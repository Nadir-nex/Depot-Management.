'use strict';
// Inventory use-cases. Every multi-record operation runs in ONE transaction:
// receipt header + lines + stock movements + audit are committed together or
// not at all. Posted history is never edited: cancellation appends reversal
// movements and flips the receipt status. No Electron, no fs, no SQL here
// beyond the repository calls (repositories own the SQL).
const { ValidationError, NotFoundError, StateError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { MAIN_WAREHOUSE_CODE } = require('../domain/vocabulary');
const { validateReceiptLines, assertReceiptCancellable, reversalOf } = require('../domain/inventory');
const { toBasePieces, validateLotNo, validateSupplierRef, validateSerialCode, validateLotDates } = require('../domain/catalog');
const { validateUnitCost } = require('../domain/products');
const { createProductRepository } = require('../data/productRepository');
const { createPackRepository } = require('../data/catalogRepository');
const { createLotRepository, createSerialRepository } = require('../data/lotRepository');
const { createPartyRepository, createPartyRoleRepository } = require('../data/partyRepository');
const { createDocumentRepository, createDocumentLineRepository } = require('../data/documentRepository');
const {
  createWarehouseRepository,
  createStockRepository,
  createReceiptRepository,
  createAuditRepository,
} = require('../data/stockRepository');
const { withTransaction, utcNowIso } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveWarehouse(warehouses, ref) {
  if (ref.id !== undefined && ref.id !== null) return warehouses.getById(ref.id);
  const code = cleanText(ref.code || ref.warehouseCode || MAIN_WAREHOUSE_CODE) || MAIN_WAREHOUSE_CODE;
  const w = warehouses.getByCode(code);
  if (!w) throw new NotFoundError(`warehouse ${code} not found`);
  return w;
}

function resolveProduct(products, line) {
  if (line.productId !== null && line.productId !== undefined) return products.getById(line.productId);
  if (line.sku) {
    const p = products.getBySku(line.sku);
    if (!p) throw new NotFoundError(`product sku ${line.sku} not found`);
    return p;
  }
  throw new ValidationError('each receipt line must identify a product (productId or sku)');
}

function buildReceiptNo(receipts, requested) {
  const r = cleanText(requested);
  if (r) {
    if (r.length > 64) throw new ValidationError('receipt_no must be at most 64 characters');
    return r;
  }
  const day = utcNowIso().slice(0, 10).replace(/-/g, '');
  const prefix = `RCPT-${day}-`;
  const seq = String(receipts.nextDailySequence(prefix)).padStart(4, '0');
  return `${prefix}${seq}`;
}

// Lot attachment for receipt lines: an existing lot id, or an inline spec
// ({lotNo, expiryDate?, supplierRef?, manufacturedDate?}) resolved by
// find-or-create within the transaction. An existing lot reused with a
// conflicting expiry is rejected instead of silently merged.
function resolveReceiptLot(db, product, line) {
  const lots = createLotRepository(db);
  const lotId = line.lotId ?? line.lot_id ?? null;
  if (lotId !== null && lotId !== undefined) {
    const lot = lots.getById(lotId);
    if (lot.product_id !== product.id) throw new ValidationError('lot belongs to a different product');
    return lot.id;
  }
  const spec = line.lot;
  if (spec === undefined || spec === null) return null;
  if (typeof spec !== 'object') throw new ValidationError('lot must be an id or a {lotNo, ...} spec');
  const lotNo = validateLotNo(spec.lotNo ?? spec.lot_no);
  const { manufacturedDate, expiryDate } = validateLotDates(spec);
  const existing = lots.findByProductAndNo(product.id, lotNo);
  if (existing) {
    if (expiryDate && existing.expiry_date && expiryDate !== existing.expiry_date) {
      throw new ValidationError(`lot ${lotNo} exists with a different expiry date`);
    }
    return existing.id;
  }
  return lots.insert({
    productId: product.id, lotNo,
    supplierRef: validateSupplierRef(spec.supplierRef ?? spec.supplier_ref),
    manufacturedDate, expiryDate,
  }).id;
}

// Serial codes arriving on a receipt line. Tracking products must identify
// every piece (count == pieces); anything else carrying serials is rejected.
function cleanReceiptSerials(raw, product, pieces) {
  if (raw === undefined || raw === null) {
    if (product.serialTracking) throw new ValidationError(`product ${product.sku} is serial-tracked: serials are required`);
    return [];
  }
  if (!Array.isArray(raw)) throw new ValidationError('serials must be an array of codes');
  const codes = raw.map(validateSerialCode);
  if (new Set(codes).size !== codes.length) throw new ValidationError('duplicate serial codes in one receipt line');
  if (!product.serialTracking) throw new ValidationError(`product ${product.sku} is not serial-tracked`);
  if (codes.length !== pieces) throw new ValidationError(`serial count (${codes.length}) must equal pieces (${pieces})`);
  return codes;
}

// Optional supplier linkage: id or code must resolve to an ACTIVE party with
// the supplier role. The name snapshot stays on the receipt either way.
function resolveSupplierParty(db, payload) {
  const id = payload.supplierPartyId ?? payload.supplier_party_id ?? null;
  const code = cleanText(payload.supplierPartyCode ?? payload.supplier_party_code ?? '');
  if ((id === null || id === undefined) && !code) return null;
  const parties = createPartyRepository(db);
  const party = id !== null && id !== undefined ? parties.getById(id) : parties.getByCode(code.toUpperCase());
  if (!party) throw new NotFoundError(`supplier party ${code || id} not found`);
  if (!party.isActive) throw new StateError(`supplier ${party.code} is inactive`);
  const roles = createPartyRoleRepository(db).ofParty(party.id);
  if (!roles.includes('supplier')) throw new StateError(`party ${party.code} is not a supplier`);
  return party;
}

// Optional order linkage: id must resolve to a POSTED purchase_order. The
// receipt inherits the order's supplier when it names none, must agree when
// it names one, and can never exceed per-product remaining quantities.
function resolvePurchaseOrder(db, payload) {
  const id = payload.purchaseOrderId ?? payload.purchase_order_id ?? null;
  if (id === null || id === undefined) return null;
  const order = createDocumentRepository(db).getById(id);
  if (order.docType !== 'purchase_order') throw new ValidationError(`document ${order.docNo} is not a purchase order`);
  if (order.status !== 'posted') throw new StateError(`purchase order ${order.docNo} is ${order.status}: only posted orders receive`);
  order.lines = createDocumentLineRepository(db).ofDocument(id);
  return order;
}

// Per-product remaining guard: ordered minus already received (live receipts).
function assertOrderRemaining(db, order, resolved) {
  const receipts = createReceiptRepository(db);
  const byProduct = new Map();
  for (const r of resolved) byProduct.set(r.product.id, (byProduct.get(r.product.id) || 0) + r.qty);
  for (const [productId, newQty] of byProduct) {
    const ordered = order.lines.filter((l) => l.product_id === productId).reduce((n, l) => n + l.qty, 0);
    const sku = resolved.find((r) => r.product.id === productId).product.sku;
    if (ordered === 0) throw new StateError(`product ${sku} is not on order ${order.docNo}`);
    const received = receipts.receivedQty(order.id, productId);
    if (received + newQty > ordered) {
      throw new StateError(`only ${ordered - received} of ${sku} remaining on order ${order.docNo}`);
    }
  }
}

// Creates a POSTED purchase receipt: header + lines + one stock movement per
// line, atomically. All lines must reference existing ACTIVE products.
function receiveStock(db, payload = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'purchases.post');
  const lines = validateReceiptLines(payload.lines);
  let supplierName = cleanText(payload.supplierName ?? payload.supplier_name).slice(0, 200);
  let supplierParty = resolveSupplierParty(db, payload);
  const order = resolvePurchaseOrder(db, payload);
  if (order) {
    // The order governs: inherit its supplier when unnamed, agree when named.
    if (!supplierParty && order.partyId) supplierParty = createPartyRepository(db).getById(order.partyId);
    if (supplierParty && order.partyId && supplierParty.id !== order.partyId) {
      throw new ValidationError(`receipt supplier ${supplierParty.code} differs from order supplier`);
    }
    if (supplierParty && !supplierName) supplierName = supplierParty.displayName.slice(0, 200);
  } else if (supplierParty && !supplierName) {
    supplierName = supplierParty.displayName.slice(0, 200);
  }
  return withTransaction(db, () => {
    const warehouses = createWarehouseRepository(db);
    const products = createProductRepository(db);
    const receipts = createReceiptRepository(db);
    const stock = createStockRepository(db);
    const audit = createAuditRepository(db);

    const warehouse = resolveWarehouse(warehouses, {
      id: payload.warehouseId ?? payload.warehouse_id ?? null,
      code: payload.warehouseCode ?? payload.warehouse_code ?? MAIN_WAREHOUSE_CODE,
    });
    if (warehouse.is_active !== 1) {
      throw new StateError(`warehouse ${warehouse.code} is inactive and cannot receive stock`);
    }
    const receiptNo = buildReceiptNo(receipts, payload.receiptNo ?? payload.receipt_no);

    const resolved = lines.map((l) => {
      const product = resolveProduct(products, l);
      if (!product.isActive) throw new StateError(`product ${product.sku} is inactive and cannot receive stock`);
      if (product.productType === 'service') {
        throw new StateError(`product ${product.sku} is a service and carries no stock`);
      }
      const unitCost = validateUnitCost(l.unitCost);
      let qty, unitCode, note;
      if (l.packId !== undefined && l.packId !== null) {
        // Pack presentation (P06): whole packs in, base pieces to the ledger.
        const pack = createPackRepository(db).getById(l.packId);
        if (pack.product_id !== product.id) throw new ValidationError('pack belongs to a different product');
        qty = toBasePieces(l.packs, pack.qty_per_pack);
        unitCode = pack.unit_code;
        note = `pack=${pack.name} x${l.packs}`;
      } else {
        qty = l.qty;
        unitCode = 'PCS';
        note = '';
      }
      // Lot attachment (P10): existing lot id, or inline lot spec for
      // find-or-create. Inflows accept expired lots (documenting reality);
      // outflows enforce the expiry policy.
      const lotId = resolveReceiptLot(db, product, l);
      const serials = cleanReceiptSerials(l.serials, product, qty);
      return { product, qty, unitCost, unitCode, note, lotId, serials };
    });

    if (order) assertOrderRemaining(db, order, resolved);

    let receipt;
    try {
      receipt = receipts.insertReceipt({ receiptNo, warehouseId: warehouse.id, supplierName, supplierPartyId: supplierParty ? supplierParty.id : null, purchaseOrderId: order ? order.id : null });
    } catch (err) {
      if (err && /UNIQUE constraint failed.*receipt_no/i.test(err.message || '')) {
        const { ConflictError } = require('../domain/errors');
        throw new ConflictError(`receipt_no ${receiptNo} already exists (duplicate submission?)`);
      }
      throw err;
    }
    for (const r of resolved) {
      receipts.insertLine({ receiptId: receipt.id, productId: r.product.id, qty: r.qty, unitCost: r.unitCost, lotId: r.lotId });
      const movementId = stock.insertMovement({
        productId: r.product.id,
        warehouseId: warehouse.id,
        qty: r.qty,
        movementType: 'purchase_receipt',
        lotId: r.lotId,
        referenceType: 'purchase_receipt',
        referenceId: receipt.id,
        unitCost: r.unitCost,
        unitCode: r.unitCode,
        notes: r.note,
      });
      for (const code of r.serials) {
        createSerialRepository(db).insert({ productId: r.product.id, lotId: r.lotId, code, warehouseId: warehouse.id, movementId });
      }
    }
    audit.append({ actor: auth.actor, operation: 'stock.receive', entityType: 'purchase_receipt', entityId: receipt.id, details: `receipt_no=${receiptNo} lines=${resolved.length}${order ? ` order=${order.docNo}` : ''}`, after: `status=posted lines=${resolved.length}`, referenceNo: receiptNo });
    return receipts.getWithLines(receipt.id);
  });
}

// Cancels a POSTED receipt by appending exact reversal movements.
// The original lines stay untouched; stock returns to its pre-receipt level.
function cancelReceipt(db, receiptId, reason = '', actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'purchases.cancel');
  const why = cleanText(reason);
  if (!why) throw new ValidationError('a cancel reason is required');
  return withTransaction(db, () => {
    const receipts = createReceiptRepository(db);
    const stock = createStockRepository(db);
    const audit = createAuditRepository(db);
    const current = receipts.getWithLines(receiptId);
    assertReceiptCancellable(current.status);
    // Lines and their original movements pair by creation order (the receive
    // loop inserts line then movement sequentially, so both id-orders align).
    const originals = stock.ofReference('purchase_receipt', current.id);
    const products = createProductRepository(db);
    current.lines.forEach((line, i) => {
      // A receipt whose goods already left (returns, sales) cannot cancel:
      // the reversal would drive its pool negative. Adjust explicitly instead.
      const product = products.getById(line.product_id);
      const pool = stock.poolStock({ productId: line.product_id, warehouseId: current.warehouse_id, lotId: line.lot_id });
      if (pool < line.qty && !product.allowNegativeStock) {
        throw new StateError(`cannot cancel: only ${pool} of ${product.sku} left (goods already moved out)`);
      }
      const reversalId = stock.insertMovement({
        productId: line.product_id,
        warehouseId: current.warehouse_id,
        qty: reversalOf(line.qty),
        movementType: 'purchase_receipt_reversal',
        lotId: line.lot_id,
        referenceType: 'purchase_receipt',
        referenceId: current.id,
        unitCost: line.unit_cost,
        notes: `reversal of receipt ${current.receipt_no}`,
      });
      // Serials landed by this receipt leave with the returned goods.
      const original = originals[i];
      if (original && original.product_id === line.product_id) {
        const serials = createSerialRepository(db);
        for (const s of serials.serialsRegisteredBy(original.id)) serials.consume(s.id, reversalId);
      }
    });
    const cancelled = receipts.markCancelled(current.id, why.slice(0, 1000));
    audit.append({ actor: auth.actor, operation: 'stock.receipt_cancel', entityType: 'purchase_receipt', entityId: current.id, details: `receipt_no=${current.receipt_no} reason=${why.slice(0, 200)}`, before: 'status=posted', after: 'status=cancelled', reason: why.slice(0, 1000), referenceNo: current.receipt_no });
    return { ...cancelled, lines: current.lines };
  });
}

function getStock(db, productId, warehouseId) {
  return createStockRepository(db).stockOf(productId, warehouseId);
}

function listStock(db, warehouseCodeOrId = MAIN_WAREHOUSE_CODE) {
  const warehouses = createWarehouseRepository(db);
  const w = typeof warehouseCodeOrId === 'number'
    ? warehouses.getById(warehouseCodeOrId)
    : resolveWarehouse(warehouses, { code: warehouseCodeOrId });
  return { warehouse: w, rows: createStockRepository(db).stockByProduct(w.id) };
}

function listMovements(db, opts) {
  return createStockRepository(db).listMovements(opts);
}

function listReceipts(db, opts) {
  return createReceiptRepository(db).list(opts);
}

function getReceipt(db, id) {
  return createReceiptRepository(db).getWithLines(id);
}

module.exports = { receiveStock, cancelReceipt, getStock, listStock, listMovements, listReceipts, getReceipt };
