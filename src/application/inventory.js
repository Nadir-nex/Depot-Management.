'use strict';
// Inventory use-cases. Every multi-record operation runs in ONE transaction:
// receipt header + lines + stock movements + audit are committed together or
// not at all. Posted history is never edited: cancellation appends reversal
// movements and flips the receipt status. No Electron, no fs, no SQL here
// beyond the repository calls (repositories own the SQL).
const { ValidationError, NotFoundError, StateError } = require('../domain/errors');
const { validateReceiptLines, assertReceiptCancellable, reversalOf } = require('../domain/inventory');
const { validateUnitCost } = require('../domain/products');
const { createProductRepository } = require('../data/productRepository');
const {
  createWarehouseRepository,
  createStockRepository,
  createReceiptRepository,
  createAuditRepository,
} = require('../data/stockRepository');
const { withTransaction } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveWarehouse(warehouses, ref) {
  if (ref.id !== undefined && ref.id !== null) return warehouses.getById(ref.id);
  const code = cleanText(ref.code || ref.warehouseCode || 'MAIN') || 'MAIN';
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
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `RCPT-${day}-`;
  const seq = String(receipts.nextDailySequence(prefix)).padStart(4, '0');
  return `${prefix}${seq}`;
}

// Creates a POSTED purchase receipt: header + lines + one stock movement per
// line, atomically. All lines must reference existing ACTIVE products.
function receiveStock(db, payload = {}, actor = 'system') {
  const lines = validateReceiptLines(payload.lines);
  const supplierName = cleanText(payload.supplierName ?? payload.supplier_name).slice(0, 200);
  return withTransaction(db, () => {
    const warehouses = createWarehouseRepository(db);
    const products = createProductRepository(db);
    const receipts = createReceiptRepository(db);
    const stock = createStockRepository(db);
    const audit = createAuditRepository(db);

    const warehouse = resolveWarehouse(warehouses, {
      id: payload.warehouseId ?? payload.warehouse_id ?? null,
      code: payload.warehouseCode ?? payload.warehouse_code ?? 'MAIN',
    });
    const receiptNo = buildReceiptNo(receipts, payload.receiptNo ?? payload.receipt_no);

    const resolved = lines.map((l) => {
      const product = resolveProduct(products, l);
      if (!product.isActive) throw new StateError(`product ${product.sku} is inactive and cannot receive stock`);
      return { product, qty: l.qty, unitCost: validateUnitCost(l.unitCost) };
    });

    let receipt;
    try {
      receipt = receipts.insertReceipt({ receiptNo, warehouseId: warehouse.id, supplierName });
    } catch (err) {
      if (err && /UNIQUE constraint failed.*receipt_no/i.test(err.message || '')) {
        const { ConflictError } = require('../domain/errors');
        throw new ConflictError(`receipt_no ${receiptNo} already exists (duplicate submission?)`);
      }
      throw err;
    }
    for (const r of resolved) {
      receipts.insertLine({ receiptId: receipt.id, productId: r.product.id, qty: r.qty, unitCost: r.unitCost });
      stock.insertMovement({
        productId: r.product.id,
        warehouseId: warehouse.id,
        qty: r.qty,
        movementType: 'purchase_receipt',
        referenceType: 'purchase_receipt',
        referenceId: receipt.id,
        unitCost: r.unitCost,
      });
    }
    audit.append({ actor, operation: 'stock.receive', entityType: 'purchase_receipt', entityId: receipt.id, details: `receipt_no=${receiptNo} lines=${resolved.length}` });
    return receipts.getWithLines(receipt.id);
  });
}

// Cancels a POSTED receipt by appending exact reversal movements.
// The original lines stay untouched; stock returns to its pre-receipt level.
function cancelReceipt(db, receiptId, reason = '', actor = 'system') {
  const why = cleanText(reason);
  if (!why) throw new ValidationError('a cancel reason is required');
  return withTransaction(db, () => {
    const receipts = createReceiptRepository(db);
    const stock = createStockRepository(db);
    const audit = createAuditRepository(db);
    const current = receipts.getWithLines(receiptId);
    assertReceiptCancellable(current.status);
    for (const line of current.lines) {
      stock.insertMovement({
        productId: line.product_id,
        warehouseId: current.warehouse_id,
        qty: reversalOf(line.qty),
        movementType: 'purchase_receipt_reversal',
        referenceType: 'purchase_receipt',
        referenceId: current.id,
        unitCost: line.unit_cost,
        notes: `reversal of receipt ${current.receipt_no}`,
      });
    }
    const cancelled = receipts.markCancelled(current.id, why.slice(0, 1000));
    audit.append({ actor, operation: 'stock.receipt_cancel', entityType: 'purchase_receipt', entityId: current.id, details: `receipt_no=${current.receipt_no} reason=${why.slice(0, 200)}` });
    return { ...cancelled, lines: current.lines };
  });
}

function getStock(db, productId, warehouseId) {
  return createStockRepository(db).stockOf(productId, warehouseId);
}

function listStock(db, warehouseCodeOrId = 'MAIN') {
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
