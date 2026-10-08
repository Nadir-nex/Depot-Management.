'use strict';
// Source import orchestration (Phase 22) — one-shot data migration into the
// current architecture, never a runtime layer. Reads are done by the
// infrastructure source reader (read-only + fingerprint); THIS module maps,
// stages and applies in one transaction, and produces the migration report
// the exit gate reconciles against.
//
// Rules enforced here:
//  - canonical writes happen ONLY after raw rows are staged (apply mode);
//  - every imported row gets a source_link (traceability + idempotency) or a
//    documented deterministic key from domain/importMapping;
//  - duplicate handling is explicit: linked → adopt (deterministic key
//    already in the target) → create; deleted/ambiguous rows skip with a
//    counted reason; failures become error rows, never silent drops;
//  - the report reconciles source vs target counts (and documents where the
//    source simply has no such data).
const { NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { MAIN_WAREHOUSE_CODE } = require('../domain/vocabulary');
const { validateCategoryName } = require('../domain/catalog');
const { toProductInput } = require('../domain/products');
const { validateListCode, validateListName, validateScope, validateLinePrice } = require('../domain/pricing');
const { validatePartyCode, validateDisplayName, validatePhone, validateRoles } = require('../domain/parties');
const { validateRegistryCode } = require('../domain/logistics');
const { validateDateString } = require('../domain/dates');
const {
  DEFERRED_TABLES,
  sourceSku, sourceCustomerCode, sourceTypeCode, sourceVehicleCode,
  sourceLotNo, sourceReceiptNo, sourceSupplierCode, sourceMoneyToMinor,
} = require('../domain/importMapping');
const { createImportRepository } = require('../data/importRepository');
const { createProductRepository } = require('../data/productRepository');
const { createPartyRepository } = require('../data/partyRepository');
const { createReceiptRepository, createAuditRepository } = require('../data/stockRepository');
const productsApp = require('./products');
const catalogApp = require('./catalog');
const pricingApp = require('./pricing');
const partiesApp = require('./parties');
const inventoryApp = require('./inventory');
const logisticsApp = require('./logistics');
const warehousesApp = require('./warehouses');
const { withTransaction } = require('../db');

// An import spans every domain it writes into; the caller must hold them all.
const REQUIRED_PERMS = Object.freeze(['products.edit', 'pricing.edit', 'customers.edit', 'purchases.post', 'deliveries.create']);
const IMPORT_AUTH = Object.freeze({ actor: 'importer', grants: [...REQUIRED_PERMS] });
const REPORT_VERSION = 1;

function clean(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// source: { path, fingerprint, inventory, tables } from the source reader.
// apply=false → preview: validated classification + reconciliation, only an
// import_batches row is written. apply=true → stage → import → links → report.
function runSourceImport(db, source, { apply = false, actorOrAuth = IMPORT_AUTH } = {}) {
  const auth = normalizeAuth(actorOrAuth);
  for (const perm of REQUIRED_PERMS) requirePermission(auth, perm);

  const applyWrites = Boolean(apply);
  const imports = createImportRepository(db);
  const links = imports.allLinks();
  const actions = {};
  const skipReasons = {};
  const errors = [];
  const notesSet = new Set();

  const tally = (entity, action) => {
    if (!actions[entity]) actions[entity] = { create: 0, linked: 0, adopt: 0, skip: 0, error: 0 };
    actions[entity][action] += 1;
  };
  const skip = (reason) => { skipReasons[reason] = (skipReasons[reason] || 0) + 1; };
  const rowError = (table, row, err) => errors.push({
    table, sourceRowid: row && row._rowid !== undefined ? row._rowid : null,
    message: err && err.message ? err.message : String(err),
  });

  const rows = (t) => source.tables[t] || [];
  const sourceIds = {};
  for (const [t, rs] of Object.entries(source.tables)) sourceIds[t] = new Set(rs.map((r) => r._rowid));
  const sourceHas = (t, id) => Boolean(sourceIds[t] && sourceIds[t].has(id));

  const resolved = {
    categories: new Map(), priceLists: new Map(), products: new Map(),
    customers: new Map(), vehicles: new Map(), receipts: new Map(),
  };

  let batchId = null;

  function link(entity, table, rowid, entityId) {
    if (!applyWrites) return;
    imports.insertLink({ sourceTable: table, sourceRowid: rowid, entity, entityId, batchId });
  }

  // Upstream target resolution: linked/adopted/created rows populate the
  // resolved maps. Dry-run performs no upstream writes, so source presence
  // is the only honest check there (the target id materializes on apply).
  function resolveUpstream(map, table, id, what) {
    const hit = map.get(id);
    if (hit !== undefined && hit !== null) return hit;
    if (!applyWrites) {
      if (!sourceHas(table, id)) throw new NotFoundError(`${what} ${id} is missing in the source`);
      return null;
    }
    throw new StateError(`${what} ${id} was not imported`);
  }

  // Generic row processor: classify (linked → adopt → create), validate via
  // prepare ALWAYS (dry-run must catch bad rows too), write ONLY on apply.
  // Tally happens exactly once: success paths inside, failures in catch.
  function process({ entity, table, sourceRows, skipReason = null, keyOf, prepare, execute, onResolved }) {
    for (const row of sourceRows) {
      const rowid = row._rowid;
      try {
        const reason = skipReason ? skipReason(row) : null;
        if (reason) { tally(entity, 'skip'); skip(reason); continue; }
        const existingLink = links.get(`${entity}|${table}|${rowid}`);
        if (existingLink) {
          tally(entity, 'linked');
          if (onResolved) onResolved(row, existingLink.entity_id);
          continue;
        }
        const prepared = prepare ? prepare(row) : null;
        const keyId = keyOf ? keyOf(row) : null;
        if (keyId) {
          const targetId = applyWrites && execute ? (execute(row, prepared, keyId) ?? keyId) : keyId;
          tally(entity, 'adopt');
          link(entity, table, rowid, targetId);
          if (onResolved) onResolved(row, targetId);
          continue;
        }
        let targetId = null;
        if (applyWrites && execute) targetId = execute(row, prepared, null);
        tally(entity, 'create');
        if (targetId) {
          link(entity, table, rowid, targetId);
          if (onResolved) onResolved(row, targetId);
        }
      } catch (err) {
        tally(entity, 'error');
        rowError(table, row, err);
      }
    }
  }

  // Distinct source suppliers (free text on shipments) — deterministic code,
  // created once, name mismatches fail loudly instead of merging silently.
  const supplierSeen = new Map();
  for (const row of rows('shipments')) {
    const name = clean(row.supplier);
    if (!name) continue;
    const code = sourceSupplierCode(name, row.id);
    if (!supplierSeen.has(code)) supplierSeen.set(code, name);
  }

  const report = { version: REPORT_VERSION, mode: applyWrites ? 'apply' : 'dry_run', source: null, batchId: null };

  return withTransaction(db, () => {
    const stagedCounts = {};
    batchId = imports.insertBatch({
      sourcePath: source.path, sourceFingerprint: source.fingerprint,
      mode: applyWrites ? 'apply' : 'dry_run',
    }).id;
    if (applyWrites) {
      for (const [table, tableRows] of Object.entries(source.tables)) {
        for (const row of tableRows) imports.stage(batchId, table, row._rowid, JSON.stringify(row));
        stagedCounts[table] = tableRows.length;
      }
    }

    // --- categories → product_categories (exact-name deterministic key) ---
    const catByName = new Map(catalogApp.listCategories(db).map((c) => [c.name, c.id]));
    process({
      entity: 'category', table: 'categories', sourceRows: rows('categories'),
      prepare: (row) => validateCategoryName(row.name),
      keyOf: (row) => catByName.get(String(row.name)) ?? null,
      execute: (row, prepared, keyId) => keyId ?? catalogApp.createCategory(db, { name: row.name }, auth).id,
      onResolved: (row, id) => { resolved.categories.set(row.id, id); catByName.set(String(row.name), id); },
    });

    // --- customer types → price lists (scope customer_type) ---
    const listByCode = new Map(pricingApp.listPriceLists(db).map((l) => [l.code, l.id]));
    process({
      entity: 'price_list', table: 'customer_types', sourceRows: rows('customer_types'),
      prepare: (row) => {
        const code = validateListCode(sourceTypeCode(row.id));
        validateListName(row.name);
        validateScope('customer_type', code);
        return code;
      },
      keyOf: (row) => listByCode.get(sourceTypeCode(row.id)) ?? null,
      execute: (row, prepared, keyId) => keyId ?? pricingApp.createPriceList(db, {
        code: prepared, name: row.name, scopeType: 'customer_type', scopeKey: prepared,
      }, auth).id,
      onResolved: (row, id) => resolved.priceLists.set(row.id, id),
    });

    // --- items → products (cost folded in; company → notes; cat by name) ---
    const costByItem = new Map(rows('product_costs').map((c) => [c.item_id, c.current_cost]));
    const companyById = new Map(rows('companies').map((c) => [c.id, c.name]));
    const productsRepo = createProductRepository(db);
    process({
      entity: 'product', table: 'items', sourceRows: rows('items'),
      prepare: (row) => {
        const brand = row.company_id !== null && row.company_id !== undefined
          ? clean(companyById.get(row.company_id)) : '';
        const input = toProductInput({
          sku: sourceSku(row.id),
          name: row.name,
          barcode: row.barcode ? String(row.barcode).trim() : null,
          productType: 'goods',
          defaultUnitCost: sourceMoneyToMinor(costByItem.get(row.id) ?? 0),
          notes: brand ? `brand: ${brand}` : '',
        });
        let categoryId = null;
        if (row.category_id !== null && row.category_id !== undefined) {
          const target = resolved.categories.get(row.category_id);
          if (target) categoryId = target;
          else if (applyWrites) throw new StateError(`category ${row.category_id} was not imported`);
          else if (!sourceHas('categories', row.category_id)) throw new NotFoundError(`category ${row.category_id} is missing in the source`);
        }
        return { input, categoryId };
      },
      keyOf: (row) => productsRepo.getBySku(sourceSku(row.id))?.id ?? null,
      execute: (row, prepared, keyId) => keyId
        ?? productsApp.createProduct(db, { ...prepared.input, categoryId: prepared.categoryId }, auth).id,
      onResolved: (row, id) => resolved.products.set(row.id, id),
    });

    // --- product prices → price list lines (manual beats auto; upsert) ---
    process({
      entity: 'price_line', table: 'product_prices', sourceRows: rows('product_prices'),
      skipReason: (row) => (row.manual_price === null && row.auto_price === null ? 'no_price' : null),
      prepare: (row) => {
        if (!sourceHas('items', row.item_id)) throw new NotFoundError(`item ${row.item_id} is missing in the source`);
        if (!sourceHas('customer_types', row.customer_type_id)) throw new NotFoundError(`customer type ${row.customer_type_id} is missing in the source`);
        const value = row.manual_price ?? row.auto_price;
        return validateLinePrice(sourceMoneyToMinor(value));
      },
      keyOf: () => null, // upsert on (list, product): idempotent by construction
      execute: (row, prepared) => {
        const listId = resolveUpstream(resolved.priceLists, 'customer_types', row.customer_type_id, 'price list');
        const productId = resolveUpstream(resolved.products, 'items', row.item_id, 'product');
        return pricingApp.setPriceLine(db, listId, { productId, unitPrice: prepared }, auth).id;
      },
    });

    // --- customers → parties (first phone wins; deleted rows skip) ---
    const firstPhone = new Map();
    for (const ph of rows('customer_phones')) {
      if (!firstPhone.has(ph.customer_id)) firstPhone.set(ph.customer_id, ph.phone_number);
    }
    const partiesRepo = createPartyRepository(db);
    process({
      entity: 'customer', table: 'customers', sourceRows: rows('customers'),
      skipReason: (row) => (row.deleted_at ? 'deleted_customer' : null),
      prepare: (row) => {
        const code = validatePartyCode(sourceCustomerCode(row.id));
        const displayName = validateDisplayName(row.name);
        const phone = validatePhone(firstPhone.get(row.id) ?? '');
        let customerTypeCode = null;
        if (row.customer_type_id !== null && row.customer_type_id !== undefined) {
          if (sourceHas('customer_types', row.customer_type_id)) customerTypeCode = sourceTypeCode(row.customer_type_id);
          else notesSet.add(`customer ${code}: customer type ${row.customer_type_id} missing in source; imported untyped`);
        }
        validateRoles(['customer']);
        return { code, displayName, phone, customerTypeCode, notes: clean(row.notes).slice(0, 2000) };
      },
      keyOf: (row) => partiesRepo.getByCode(sourceCustomerCode(row.id))?.id ?? null,
      execute: (row, prepared, keyId) => keyId ?? partiesApp.createParty(db, {
        code: prepared.code, displayName: prepared.displayName, phone: prepared.phone,
        customerTypeCode: prepared.customerTypeCode, notes: prepared.notes, roles: ['customer'],
      }, auth).id,
      onResolved: (row, id) => resolved.customers.set(row.id, id),
    });

    // --- vehicles → fleet_vehicles ---
    const vehicleByCode = new Map(logisticsApp.listVehicles(db).map((v) => [v.code, v.id]));
    process({
      entity: 'vehicle', table: 'vehicles', sourceRows: rows('vehicles'),
      skipReason: (row) => (row.deleted_at ? 'deleted_vehicle' : null),
      prepare: (row) => ({
        code: validateRegistryCode(sourceVehicleCode(row.id), 'vehicle code'),
        plate: clean(row.plate_number).slice(0, 32),
        description: clean(row.notes).slice(0, 200),
      }),
      keyOf: (row) => vehicleByCode.get(sourceVehicleCode(row.id)) ?? null,
      execute: (row, prepared, keyId) => keyId ?? logisticsApp.createVehicle(db, prepared, auth).id,
      onResolved: (row, id) => { resolved.vehicles.set(row.id, id); vehicleByCode.set(sourceVehicleCode(row.id), id); },
    });

    // --- suppliers (free text) → supplier parties, deterministic code ---
    for (const [code, name] of supplierSeen.entries()) {
      try {
        const existing = partiesRepo.getByCode(code);
        if (existing) {
          if (clean(existing.displayName) !== name) {
            throw new StateError(`supplier code ${code} belongs to "${existing.displayName}" in the target, the source says "${name}"`);
          }
          tally('supplier', 'adopt');
          continue;
        }
        validateDisplayName(name);
        if (applyWrites) partiesApp.createParty(db, { code, displayName: name, roles: ['supplier'] }, auth);
        tally('supplier', 'create');
      } catch (err) {
        tally('supplier', 'error');
        errors.push({ table: 'shipments', sourceRowid: null, message: `supplier "${name}": ${err.message}` });
      }
    }

    // --- shipments → opening stock receipts (one receipt per row) ---
    const receiptsRepo = createReceiptRepository(db);
    process({
      entity: 'receipt', table: 'shipments', sourceRows: rows('shipments'),
      prepare: (row) => {
        const qty = Number(row.qty);
        if (!Number.isInteger(qty) || qty <= 0) throw new ValidationError(`shipment qty must be a positive integer (got ${row.qty})`);
        const expiry = validateDateString(row.expiry_date || null, 'expiry_date');
        const productId = resolveUpstream(resolved.products, 'items', row.item_id, 'product');
        const supplierName = clean(row.supplier);
        return {
          qty, expiry, productId,
          unitCost: sourceMoneyToMinor(row.buy_price),
          supplierPartyCode: supplierName ? sourceSupplierCode(supplierName, row.id) : null,
        };
      },
      keyOf: (row) => receiptsRepo.getByNo(sourceReceiptNo(row.id))?.id ?? null,
      execute: (row, prepared, keyId) => {
        if (keyId) return keyId;
        const receipt = inventoryApp.receiveStock(db, {
          receiptNo: sourceReceiptNo(row.id),
          warehouseCode: MAIN_WAREHOUSE_CODE,
          supplierPartyCode: prepared.supplierPartyCode || undefined,
          lines: [{
            productId: prepared.productId, qty: prepared.qty, unitCost: prepared.unitCost,
            lot: { lotNo: sourceLotNo(row.id), expiryDate: prepared.expiry },
          }],
        }, auth);
        return receipt.id;
      },
      onResolved: (row, id) => resolved.receipts.set(row.id, id),
    });

    // --- report ---
    const deferred = [];
    for (const [table, reason] of Object.entries(DEFERRED_TABLES)) {
      if (source.inventory[table] === undefined) continue;
      deferred.push({ table, rows: source.inventory[table], reason });
    }
    notesSet.add('customer_phones: first phone folded into parties.phone (remaining rows staged)');
    notesSet.add('customer type markup percentages: recorded in this report only (no canonical markup field)');

    const activeCustomers = rows('customers').filter((c) => !c.deleted_at).length;
    const sourceStockQty = rows('shipments').reduce((n, s) => n + (Number(s.qty) || 0), 0);
    const parties = partiesApp.listParties(db, { limit: 100000 });
    const targetSuppliers = new Set(
      parties.filter((p) => p.code.startsWith('LGS-') && p.roles.includes('supplier')).map((p) => p.code)
    ).size;
    const targetWarehouses = warehousesApp.listWarehouses(db).length;

    report.source = { path: source.path, fingerprint: source.fingerprint, inventory: source.inventory };
    report.batchId = batchId;
    report.actions = actions;
    report.skipReasons = skipReasons;
    report.customerTypes = rows('customer_types').map((t) => ({
      code: sourceTypeCode(t.id), name: t.name, markupPercentage: t.markup_percentage ?? null,
    }));
    report.deferred = deferred;
    report.notes = [...notesSet];
    report.errors = errors;
    report.staged = applyWrites ? stagedCounts : null;
    report.reconciliation = buildReconciliation({
      imports, rows, activeCustomers, supplierSeen, sourceStockQty, targetSuppliers, targetWarehouses,
    });
    report.linksTotal = imports.totalLinks();

    imports.finishBatch(batchId, { status: 'done', report: JSON.stringify(report) });
    if (applyWrites) {
      createAuditRepository(db).append({
        actor: auth.actor, operation: 'import.batch', entityType: 'import', entityId: batchId,
        details: `mode=apply products+${actions.product ? actions.product.create : 0} links=${report.linksTotal} errors=${errors.length}`,
        referenceNo: source.fingerprint.slice(0, 16),
      });
    }
    return report;
  });
}

// The reconciliation checklist from the plan: compare what the source has
// against what actually landed, and say so where the source has no such data.
function buildReconciliation({ imports, rows, activeCustomers, supplierSeen, sourceStockQty, targetSuppliers, targetWarehouses }) {
  const orders = rows('orders').length;
  return {
    products: {
      source: rows('items').length,
      target: imports.countLinks('product'),
      ok: rows('items').length === imports.countLinks('product'),
    },
    customers: {
      source: activeCustomers,
      target: imports.countLinks('customer'),
      ok: activeCustomers === imports.countLinks('customer'),
    },
    suppliers: {
      source: supplierSeen.size,
      target: targetSuppliers,
      ok: supplierSeen.size === targetSuppliers,
    },
    warehouses: {
      source: null, target: targetWarehouses, ok: true,
      note: 'no warehouse table in the source; MAIN is the implicit store (count not comparable)',
    },
    openingStock: {
      source: sourceStockQty,
      target: imports.importedReceiptQty(),
      ok: sourceStockQty === imports.importedReceiptQty(),
    },
    orders: {
      source: orders, target: 0, deferred: true, ok: true,
      note: DEFERRED_TABLES.orders,
    },
    invoices: {
      source: null, target: 0, ok: true, note: 'no invoice table in the source',
    },
    paymentTotals: {
      source: null, target: 0, ok: true, note: 'no payments table in the source',
    },
    balances: {
      source: null, target: 0, ok: true, note: 'no balances table in the source',
    },
  };
}

module.exports = { runSourceImport, IMPORT_AUTH };
