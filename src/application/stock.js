'use strict';
// Stock movement engine (P09) + lot/serial integration (P10) — the ONLY
// producer of manual inventory movements. Every operation is ONE transaction:
// validation + movement rows + serial transitions + audit commit together or
// not at all. Quantities are NEVER assigned, only appended as signed deltas;
// stock always equals SUM(movements), per pool (lot pools are NOT fungible).
//
// Negative-stock rule: a movement that would drive its pool below zero is
// rejected unless the product explicitly opts out (allow_negative_stock).
// Expiry rule (EXPIRY_POLICY 'block_outflow'): expired lots refuse commercial
// outflows (issue, transfer-out) but accept adjustments, so write-offs stay
// representable. Transfers move a linked pair under one stock_transfers
// record; serial-tracked products cannot transfer yet (custody across
// locations needs the P20 logistics model) — an explicit limitation.
// Reversals append compensating rows with reverses_movement_id links and
// restore consumed serials.
const { ConflictError, NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { MAIN_WAREHOUSE_CODE } = require('../domain/vocabulary');
const { validateReasonCode, validateSerialCode } = require('../domain/catalog');
const { todayDateString, isExpired } = require('../domain/dates');
const { validateUnitCost } = require('../domain/products');
const { validateQty } = require('../domain/inventory');
const { createProductRepository } = require('../data/productRepository');
const { createLotRepository, createSerialRepository } = require('../data/lotRepository');
const {
  createWarehouseRepository,
  createStockRepository,
  createTransferRepository,
  createAuditRepository,
} = require('../data/stockRepository');
const { withTransaction, utcNowIso } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveProduct(products, ref) {
  if (ref.productId !== undefined && ref.productId !== null) return products.getById(ref.productId);
  if (ref.sku) {
    const p = products.getBySku(ref.sku);
    if (!p) throw new NotFoundError(`product sku ${ref.sku} not found`);
    return p;
  }
  throw new ValidationError('a product (productId or sku) is required');
}

function resolveWarehouse(warehouses, ref) {
  if (ref.warehouseId !== undefined && ref.warehouseId !== null) return warehouses.getById(ref.warehouseId);
  const code = cleanText(ref.warehouseCode || MAIN_WAREHOUSE_CODE) || MAIN_WAREHOUSE_CODE;
  const w = warehouses.getByCode(code);
  if (!w) throw new NotFoundError(`warehouse ${code} not found`);
  return w;
}

function assertStorableOpen(product, warehouse) {
  if (!product.isActive) throw new StateError(`product ${product.sku} is inactive and cannot move stock`);
  if (product.productType === 'service') throw new StateError(`product ${product.sku} is a service and carries no stock`);
  if (warehouse.is_active !== 1) throw new StateError(`warehouse ${warehouse.code} is inactive and cannot move stock`);
}

// Pool-scoped floor: an allocation draws only from its own lot pool (or the
// untracked pool when lotId is null). Pools are not fungible.
function assertPoolSufficient(stock, product, warehouse, lotId, delta) {
  const pool = stock.poolStock({ productId: product.id, warehouseId: warehouse.id, lotId });
  if (pool + delta < 0 && !product.allowNegativeStock) {
    const where = lotId === null ? 'untracked pool' : `lot ${lotId}`;
    throw new StateError(`insufficient stock for ${product.sku} in ${warehouse.code} (${where}): have ${pool}`);
  }
  return pool + delta;
}

function loadLot(db, product, lotId) {
  const lot = createLotRepository(db).getById(lotId);
  if (lot.product_id !== product.id) throw new ValidationError('lot belongs to a different product');
  return lot;
}

// Commercial outflows refuse expired lots; adjustments (write-offs) pass.
function assertLotOutflowAllowed(lot, op, atDate) {
  if ((op === 'issue' || op === 'transfer') && isExpired(lot.expiry_date, atDate)) {
    throw new StateError(`lot ${lot.lot_no} expired on ${lot.expiry_date} and cannot be ${op === 'issue' ? 'issued' : 'transferred'}`);
  }
}

function cleanSerialCodes(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError('serials must be an array of codes');
  const codes = raw.map(validateSerialCode);
  if (new Set(codes).size !== codes.length) throw new ValidationError('duplicate serial codes in one operation');
  return codes;
}

// Binds flat serial codes to allocations by lot match for CONSUME paths.
// Tracking products require full coverage (one serial per piece); anything
// else with serials is rejected explicitly.
function bindConsumeSerials(db, { product, warehouse, allocations, serialCodes }) {
  const serials = createSerialRepository(db);
  if (!product.serialTracking && serialCodes.length > 0) {
    throw new ValidationError(`product ${product.sku} is not serial-tracked`);
  }
  if (!product.serialTracking) return new Map();
  const byAlloc = new Map(allocations.map((a) => [a.lotKey, []]));
  for (const code of serialCodes) {
    const row = serials.findByProductAndCode(product.id, code);
    if (!row) throw new NotFoundError(`serial ${code} is not registered for ${product.sku}`);
    if (row.status !== 'in_stock') throw new StateError(`serial ${code} is already out`);
    if (row.warehouse_id !== warehouse.id) throw new StateError(`serial ${code} is not in ${warehouse.code}`);
    const key = row.lot_id === null ? 'null' : String(row.lot_id);
    if (!byAlloc.has(key)) throw new ValidationError(`serial ${code} does not belong to the allocated lot`);
    byAlloc.get(key).push(row);
  }
  for (const a of allocations) {
    const bound = byAlloc.get(a.lotKey);
    if (bound.length !== a.qty) {
      throw new ValidationError(`allocation needs ${a.qty} serial(s), got ${bound.length}`);
    }
  }
  return byAlloc;
}

// Outflow outside any sales document (samples, internal use, corrections).
// Either qty (untracked pool) or lots ([{lotId, qty}]) defines the outflow;
// both given must agree. The ledger stores negative movements per allocation.
function issueStock(db, args = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const reason = validateReasonCode(args.reasonCode ?? args.reason_code ?? args.reason);
  const unitCost = validateUnitCost(args.unitCost ?? args.unit_cost ?? 0);
  const day = todayDateString();
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const warehouses = createWarehouseRepository(db);
    const stock = createStockRepository(db);
    const serials = createSerialRepository(db);
    const product = resolveProduct(products, args);
    const warehouse = resolveWarehouse(warehouses, args);
    assertStorableOpen(product, warehouse);
    const allocations = normalizeOutflowAllocations(args, true);
    for (const a of allocations) {
      if (a.lotId !== null) assertLotOutflowAllowed(loadLot(db, product, a.lotId), 'issue', day);
      assertPoolSufficient(stock, product, warehouse, a.lotId, -a.qty);
    }
    const bound = bindConsumeSerials(db, { product, warehouse, allocations, serialCodes: cleanSerialCodes(args.serials) });
    const ids = [];
    for (const a of allocations) {
      const id = stock.insertMovement({
        productId: product.id, warehouseId: warehouse.id, qty: -a.qty, lotId: a.lotId,
        movementType: 'issue', reasonCode: reason,
        referenceType: 'manual_issue', referenceId: 0, unitCost,
      });
      for (const s of bound.get(a.lotKey) || []) serials.consume(s.id, id);
      ids.push(id);
    }
    const after = stock.stockOf(product.id, warehouse.id);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.issue', entityType: 'stock_movement', entityId: ids[0], details: `sku=${product.sku} wh=${warehouse.code} pieces=${allocations.reduce((n, a) => n + a.qty, 0)} stock=${after}`, reason, referenceNo: product.sku });
    return ids.length === 1 ? stock.getMovement(ids[0]) : ids.map((id) => stock.getMovement(id));
  });
}

// Signed correction. Positive allocations may register new serials (tracking
// products require them); negative allocations consume like an issue.
function adjustStock(db, args = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const reason = validateReasonCode(args.reasonCode ?? args.reason_code ?? args.reason);
  const unitCost = validateUnitCost(args.unitCost ?? args.unit_cost ?? 0);
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const warehouses = createWarehouseRepository(db);
    const stock = createStockRepository(db);
    const serials = createSerialRepository(db);
    const product = resolveProduct(products, args);
    const warehouse = resolveWarehouse(warehouses, args);
    assertStorableOpen(product, warehouse);
    const allocations = normalizeAdjustmentAllocations(args);
    const before = stock.stockOf(product.id, warehouse.id);
    const serialCodes = cleanSerialCodes(args.serials);
    if (!product.serialTracking && serialCodes.length > 0) {
      throw new ValidationError(`product ${product.sku} is not serial-tracked`);
    }
    // Partition serials: existing in_stock rows are consumed (negative legs),
    // unknown codes are registered (positive legs, tracking products only).
    const consumeCodes = [];
    const registerCodes = [];
    for (const code of serialCodes) {
      const row = serials.findByProductAndCode(product.id, code);
      if (row && row.status === 'in_stock') consumeCodes.push(code);
      else if (!row) registerCodes.push(code);
      else throw new StateError(`serial ${code} is already out`);
    }
    const negatives = allocations.filter((a) => a.qty < 0);
    const positives = allocations.filter((a) => a.qty > 0);
    if (product.serialTracking) {
      const needConsume = negatives.reduce((n, a) => n + Math.abs(a.qty), 0);
      const needRegister = positives.reduce((n, a) => n + a.qty, 0);
      if (consumeCodes.length !== needConsume || registerCodes.length !== needRegister) {
        throw new ValidationError(`serial coverage mismatch: need ${needConsume} to consume and ${needRegister} to register`);
      }
    } else if (serialCodes.length > 0) {
      throw new ValidationError(`product ${product.sku} is not serial-tracked`);
    }
    const consumeRows = consumeCodes.map((c) => serials.findByProductAndCode(product.id, c));
    const byAlloc = new Map(allocations.map((a) => [a.lotKey, { alloc: a, serials: [] }]));
    for (const code of registerCodes) {
      // Registration binds to the single positive allocation of the same lot.
      const singleton = positives.length === 1 ? positives[0] : positives.find((a) => a.lotKey === 'null');
      if (!singleton) throw new ValidationError(`serial ${code} cannot be bound to an allocation`);
      byAlloc.get(singleton.lotKey).serials.push({ code, register: true });
    }
    for (const row of consumeRows) {
      if (row.warehouse_id !== warehouse.id) throw new StateError(`serial ${row.code} is not in ${warehouse.code}`);
      const key = row.lot_id === null ? 'null' : String(row.lot_id);
      const slot = byAlloc.get(key);
      if (!slot || slot.alloc.qty >= 0) throw new ValidationError(`serial ${row.code} does not belong to a negative allocation`);
      slot.serials.push({ row, register: false });
    }
    for (const { alloc, serials: bound } of byAlloc.values()) {
      if (bound.length !== Math.abs(alloc.qty) && (product.serialTracking || bound.length > 0)) {
        throw new ValidationError('serial coverage mismatch within allocation');
      }
    }
    const ids = [];
    for (const { alloc, serials: bound } of byAlloc.values()) {
      if (alloc.lotId !== null) loadLot(db, product, alloc.lotId); // existence + product match
      assertPoolSufficient(stock, product, warehouse, alloc.lotId, alloc.qty);
      const id = stock.insertMovement({
        productId: product.id, warehouseId: warehouse.id, qty: alloc.qty, lotId: alloc.lotId,
        movementType: 'adjustment', reasonCode: reason,
        referenceType: 'manual_adjustment', referenceId: 0, unitCost,
      });
      for (const b of bound) {
        if (b.register) serials.insert({ productId: product.id, lotId: alloc.lotId, code: b.code, warehouseId: warehouse.id, movementId: id });
        else serials.consume(b.row.id, id);
      }
      ids.push(id);
    }
    const after = stock.stockOf(product.id, warehouse.id);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.adjust', entityType: 'stock_movement', entityId: ids[0], details: `sku=${product.sku} wh=${warehouse.code}`, before: `stock=${before}`, after: `stock=${after}`, reason, referenceNo: product.sku });
    return ids.length === 1 ? stock.getMovement(ids[0]) : ids.map((id) => stock.getMovement(id));
  });
}

// normalizeOutflowAllocations: [{lotId, qty>0, lotKey}] — qty shorthand means
// the untracked pool; both given must agree exactly.
function normalizeOutflowAllocations(args, positive) {
  const rawLots = args.lots;
  if (rawLots !== undefined && rawLots !== null) {
    if (!Array.isArray(rawLots) || rawLots.length === 0) throw new ValidationError('lots must be a non-empty array');
    const out = rawLots.map((l, i) => {
      if (!l || typeof l !== 'object') throw new ValidationError(`allocation ${i + 1}: invalid`);
      const qty = l.qty;
      if (!Number.isInteger(qty) || qty <= 0) throw new ValidationError(`allocation ${i + 1}: qty must be a positive integer`);
      const lotId = l.lotId ?? l.lot_id ?? null;
      return { lotId, qty, lotKey: lotId === null ? 'null' : String(lotId) };
    });
    if (args.qty !== undefined && args.qty !== null) {
      const total = out.reduce((n, a) => n + a.qty, 0);
      if (total !== args.qty) throw new ValidationError('qty must equal the sum of lot allocations');
    }
    return out;
  }
  return [{ lotId: null, qty: validateQty(args.qty), lotKey: 'null' }];
}

function normalizeAdjustmentAllocations(args) {
  const rawLots = args.lots;
  const toAlloc = (l, i) => {
    if (!l || typeof l !== 'object') throw new ValidationError(`allocation ${i + 1}: invalid`);
    const qty = l.qty;
    if (!Number.isInteger(qty) || qty === 0) throw new ValidationError(`allocation ${i + 1}: qty must be a non-zero integer`);
    if (Math.abs(qty) > 1_000_000_000) throw new ValidationError('qty is unreasonably large');
    const lotId = l.lotId ?? l.lot_id ?? null;
    return { lotId, qty, lotKey: lotId === null ? 'null' : String(lotId) };
  };
  let out;
  if (rawLots !== undefined && rawLots !== null) {
    if (!Array.isArray(rawLots) || rawLots.length === 0) throw new ValidationError('lots must be a non-empty array');
    out = rawLots.map(toAlloc);
    if (args.qty !== undefined && args.qty !== null) {
      const total = out.reduce((n, a) => n + a.qty, 0);
      if (total !== args.qty) throw new ValidationError('qty must equal the sum of lot allocations');
    }
  } else {
    if (args.qty === undefined || args.qty === null) throw new ValidationError('qty is required');
    const qty = typeof args.qty === 'string' && args.qty.trim() !== ''
      ? (/^-?\d+$/.test(args.qty.trim()) ? Number(args.qty.trim()) : (() => { throw new ValidationError('qty must be an integer'); })())
      : args.qty;
    if (!Number.isInteger(qty) || qty === 0) throw new ValidationError('adjustment qty must be a non-zero integer');
    out = [{ lotId: null, qty, lotKey: 'null' }];
  }
  if (out.reduce((n, a) => n + a.qty, 0) === 0) throw new ValidationError('net adjustment cannot be zero');
  return out;
}

function buildTransferNo(transfers, requested) {
  const r = cleanText(requested);
  if (r) {
    if (r.length > 64) throw new ValidationError('transfer_no must be at most 64 characters');
    return r;
  }
  const day = utcNowIso().slice(0, 10).replace(/-/g, '');
  const prefix = `TRF-${day}-`;
  return `${prefix}${String(transfers.nextDailySequence(prefix)).padStart(4, '0')}`;
}

// Linked pair: transfer_out (source, negative) + transfer_in (dest, positive)
// under one stock_transfers record. Retried transfer_no values are rejected,
// so duplicate submissions never duplicate movements. Source allocations may
// name lots; the destination inherits the same lots.
function transferStock(db, args = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.transfer');
  const qty = validateQty(args.qty);
  const reason = cleanText(args.reason ?? '').slice(0, 1000);
  const day = todayDateString();
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const warehouses = createWarehouseRepository(db);
    const stock = createStockRepository(db);
    const transfers = createTransferRepository(db);
    const product = resolveProduct(products, args);
    if (product.serialTracking) {
      throw new StateError('serial-tracked products cannot transfer yet (serial custody needs the P20 logistics model)');
    }
    if (args.serials !== undefined && args.serials !== null) {
      throw new ValidationError(`product ${product.sku} is not serial-tracked`);
    }
    const fromRef = { warehouseId: args.fromWarehouseId ?? args.from_warehouse_id ?? null, warehouseCode: args.fromWarehouseCode ?? args.from_warehouse_code ?? null };
    const toRef = { warehouseId: args.toWarehouseId ?? args.to_warehouse_id ?? null, warehouseCode: args.toWarehouseCode ?? args.to_warehouse_code ?? null };
    if (fromRef.warehouseId === null && !fromRef.warehouseCode) throw new ValidationError('source warehouse is required');
    if (toRef.warehouseId === null && !toRef.warehouseCode) throw new ValidationError('destination warehouse is required');
    const from = resolveWarehouse(warehouses, fromRef);
    const to = resolveWarehouse(warehouses, toRef);
    if (from.id === to.id) throw new ValidationError('source and destination warehouses must differ');
    assertStorableOpen(product, from);
    assertStorableOpen(product, to);
    const allocations = normalizeOutflowAllocations({ ...args, warehouseId: from.id }, true);
    for (const a of allocations) {
      if (a.lotId !== null) assertLotOutflowAllowed(loadLot(db, product, a.lotId), 'transfer', day);
      assertPoolSufficient(stock, product, from, a.lotId, -a.qty);
    }
    const total = allocations.reduce((n, a) => n + a.qty, 0);
    if (total !== qty) throw new ValidationError('qty must equal the sum of lot allocations');
    const transferNo = buildTransferNo(transfers, args.transferNo ?? args.transfer_no);
    let transfer;
    try {
      transfer = transfers.insert({ transferNo, productId: product.id, fromWarehouseId: from.id, toWarehouseId: to.id, qty, reason });
    } catch (err) {
      if (err && /UNIQUE constraint failed/i.test(err.message || '')) {
        throw new ConflictError(`transfer_no ${transferNo} already exists (duplicate submission?)`);
      }
      throw err;
    }
    for (const a of allocations) {
      stock.insertMovement({
        productId: product.id, warehouseId: from.id, qty: -a.qty, lotId: a.lotId,
        movementType: 'transfer_out', referenceType: 'stock_transfer', referenceId: transfer.id,
      });
      stock.insertMovement({
        productId: product.id, warehouseId: to.id, qty: a.qty, lotId: a.lotId,
        movementType: 'transfer_in', referenceType: 'stock_transfer', referenceId: transfer.id,
      });
    }
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.transfer', entityType: 'stock_transfer', entityId: transfer.id, details: `no=${transferNo} sku=${product.sku} ${from.code}→${to.code} qty=${qty}`, reason, referenceNo: transferNo });
    return transfer;
  });
}

// Compensating reversal of one movement. Transfer legs reverse as a WHOLE
// transfer (both legs) to preserve pair conservation. Receipt movements are
// NOT reversible here — cancellations own them (cancelReceipt). Serials
// consumed by the reversed movement return to stock at its warehouse.
function reverseStockMovement(db, movementId, reason = '', actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const why = validateReasonCode(reason);
  return withTransaction(db, () => {
    const stock = createStockRepository(db);
    const products = createProductRepository(db);
    const serials = createSerialRepository(db);
    const target = stock.getMovement(movementId);
    if (target.movement_type === 'reversal') throw new StateError('a reversal cannot itself be reversed');
    if (target.movement_type === 'purchase_receipt' || target.movement_type === 'purchase_receipt_reversal') {
      throw new StateError('receipt movements reverse via cancelReceipt, not here');
    }
    if (stock.reversedBy(target.id).length > 0) throw new StateError(`movement ${target.id} was already reversed`);
    const product = products.getById(target.product_id);

    const reverseOne = (mov) => {
      const warehouse = createWarehouseRepository(db).getById(mov.warehouse_id);
      assertPoolSufficient(stock, product, warehouse, mov.lot_id, -mov.qty);
      const id = stock.insertMovement({
        productId: mov.product_id, warehouseId: mov.warehouse_id, qty: -mov.qty, lotId: mov.lot_id,
        movementType: 'reversal', reasonCode: why, reversesMovementId: mov.id,
        referenceType: mov.reference_type, referenceId: mov.reference_id, unitCost: mov.unit_cost, unitCode: mov.unit_code,
      });
      if (mov.qty < 0) {
        // Outbound undone: consumed serials come back (linked to this reversal).
        for (const s of serials.serialsConsumedBy(mov.id)) serials.restore(s.id, mov.warehouse_id, id);
      } else {
        // Inbound undone: landed serials leave again, as do return-restored ones.
        for (const s of serials.serialsRegisteredBy(mov.id)) serials.consume(s.id, id);
        for (const s of serials.serialsReturnedBy(mov.id)) serials.consume(s.id, id);
      }
      return id;
    };

    let reversed;
    if (target.reference_type === 'stock_transfer') {
      const legs = stock.legsOfTransfer(target.reference_id);
      if (legs.length === 0) throw new StateError('transfer legs not found');
      reversed = legs.map(reverseOne);
    } else {
      reversed = [reverseOne(target)];
    }
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.movement_reverse', entityType: 'stock_movement', entityId: target.id, details: `reversed ${reversed.length} movement(s)`, reason: why, referenceNo: product.sku });
    return Array.isArray(reversed) && reversed.length === 1 ? stock.getMovement(reversed[0]) : reversed.map((id) => stock.getMovement(id));
  });
}

function getAvailableStock(db, productId, warehouseId) {
  createProductRepository(db).getById(productId);
  createWarehouseRepository(db).getById(warehouseId);
  // Available == on-hand until reservations arrive (P20 keeps this alias).
  return createStockRepository(db).stockOf(productId, warehouseId);
}

// Ledger with per-row running balance_after (computed per product+warehouse).
function getStockLedger(db, { productId = null, warehouseId = null, lotId = null, limit = 500 } = {}) {
  const rows = createStockRepository(db).ledger({ productId, warehouseId, limit });
  const scoped = lotId === null || lotId === undefined
    ? rows
    : rows.filter((r) => r.lot_id === lotId);
  const balances = new Map();
  return scoped.map((r) => {
    const key = `${r.product_id}:${r.warehouse_id}`;
    const balance = (balances.get(key) || 0) + r.qty;
    balances.set(key, balance);
    return { ...r, balance_after: balance };
  });
}

module.exports = { issueStock, adjustStock, transferStock, reverseStockMovement, getAvailableStock, getStockLedger };
