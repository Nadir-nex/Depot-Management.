'use strict';
// Stock movement engine (Phase 09) — the ONLY producer of manual inventory
// movements. Every operation is ONE transaction: validation + movement rows +
// audit commit together or not at all. Quantities are NEVER assigned, only
// appended as signed deltas; stock always equals SUM(movements).
//
// Negative-stock rule: a movement that would drive stock below zero is
// rejected unless the product explicitly opts out (allow_negative_stock).
// Transfers move a linked pair (out + in) under one stock_transfers record;
// reversals append compensating rows with reverses_movement_id links.
const { ConflictError, NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { MAIN_WAREHOUSE_CODE } = require('../domain/vocabulary');
const { validateReasonCode } = require('../domain/catalog');
const { validateUnitCost } = require('../domain/products');
const { validateQty } = require('../domain/inventory');
const { createProductRepository } = require('../data/productRepository');
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

// The no-negative rule, checked inside the same transaction as the movement.
function assertSufficientStock(stock, product, warehouse, delta) {
  const after = stock.stockOf(product.id, warehouse.id) + delta;
  if (after < 0 && !product.allowNegativeStock) {
    throw new StateError(`insufficient stock for ${product.sku} in ${warehouse.code}: would go to ${after}`);
  }
  return after;
}

// Outflow outside any sales document (samples, internal use, corrections).
// qty is a POSITIVE count of base pieces leaving; the ledger stores -qty.
function issueStock(db, args = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const qty = validateQty(args.qty);
  const reason = validateReasonCode(args.reasonCode ?? args.reason_code ?? args.reason);
  const unitCost = validateUnitCost(args.unitCost ?? args.unit_cost ?? 0);
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const warehouses = createWarehouseRepository(db);
    const stock = createStockRepository(db);
    const product = resolveProduct(products, args);
    const warehouse = resolveWarehouse(warehouses, args);
    assertStorableOpen(product, warehouse);
    const after = assertSufficientStock(stock, product, warehouse, -qty);
    const id = stock.insertMovement({
      productId: product.id, warehouseId: warehouse.id, qty: -qty,
      movementType: 'issue', reasonCode: reason,
      referenceType: 'manual_issue', referenceId: 0, unitCost,
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.issue', entityType: 'stock_movement', entityId: id, details: `sku=${product.sku} wh=${warehouse.code} qty=${-qty} stock=${after}`, reason, referenceNo: product.sku });
    return stock.getMovement(id);
  });
}

// Signed correction. Positive = found/correction stock, negative = damage/loss.
function adjustStock(db, args = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const rawQty = args.qty;
  if (rawQty === undefined || rawQty === null) throw new ValidationError('qty is required');
  const qty = typeof rawQty === 'string' && rawQty.trim() !== ''
    ? (/^-?\d+$/.test(rawQty.trim()) ? Number(rawQty.trim()) : (() => { throw new ValidationError('qty must be an integer'); })())
    : rawQty;
  if (!Number.isInteger(qty) || qty === 0) throw new ValidationError('adjustment qty must be a non-zero integer');
  if (Math.abs(qty) > 1_000_000_000) throw new ValidationError('qty is unreasonably large');
  const reason = validateReasonCode(args.reasonCode ?? args.reason_code ?? args.reason);
  const unitCost = validateUnitCost(args.unitCost ?? args.unit_cost ?? 0);
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const warehouses = createWarehouseRepository(db);
    const stock = createStockRepository(db);
    const product = resolveProduct(products, args);
    const warehouse = resolveWarehouse(warehouses, args);
    assertStorableOpen(product, warehouse);
    const before = stock.stockOf(product.id, warehouse.id);
    const after = assertSufficientStock(stock, product, warehouse, qty);
    const id = stock.insertMovement({
      productId: product.id, warehouseId: warehouse.id, qty,
      movementType: 'adjustment', reasonCode: reason,
      referenceType: 'manual_adjustment', referenceId: 0, unitCost,
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.adjust', entityType: 'stock_movement', entityId: id, details: `sku=${product.sku} wh=${warehouse.code} qty=${qty}`, before: `stock=${before}`, after: `stock=${after}`, reason, referenceNo: product.sku });
    return stock.getMovement(id);
  });
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
// so duplicate submissions never duplicate movements.
function transferStock(db, args = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.transfer');
  const qty = validateQty(args.qty);
  const reason = cleanText(args.reason ?? '').slice(0, 1000);
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const warehouses = createWarehouseRepository(db);
    const stock = createStockRepository(db);
    const transfers = createTransferRepository(db);
    const product = resolveProduct(products, args);
    const fromRef = { warehouseId: args.fromWarehouseId ?? args.from_warehouse_id ?? null, warehouseCode: args.fromWarehouseCode ?? args.from_warehouse_code ?? null };
    const toRef = { warehouseId: args.toWarehouseId ?? args.to_warehouse_id ?? null, warehouseCode: args.toWarehouseCode ?? args.to_warehouse_code ?? null };
    if (fromRef.warehouseId === null && !fromRef.warehouseCode) throw new ValidationError('source warehouse is required');
    if (toRef.warehouseId === null && !toRef.warehouseCode) throw new ValidationError('destination warehouse is required');
    const from = resolveWarehouse(warehouses, fromRef);
    const to = resolveWarehouse(warehouses, toRef);
    if (from.id === to.id) throw new ValidationError('source and destination warehouses must differ');
    assertStorableOpen(product, from);
    assertStorableOpen(product, to);
    assertSufficientStock(stock, product, from, -qty);
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
    stock.insertMovement({
      productId: product.id, warehouseId: from.id, qty: -qty,
      movementType: 'transfer_out', referenceType: 'stock_transfer', referenceId: transfer.id,
    });
    stock.insertMovement({
      productId: product.id, warehouseId: to.id, qty,
      movementType: 'transfer_in', referenceType: 'stock_transfer', referenceId: transfer.id,
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.transfer', entityType: 'stock_transfer', entityId: transfer.id, details: `no=${transferNo} sku=${product.sku} ${from.code}→${to.code} qty=${qty}`, reason, referenceNo: transferNo });
    return transfer;
  });
}

// Compensating reversal of one movement. Transfer legs reverse as a WHOLE
// transfer (both legs) to preserve pair conservation. Receipt movements are
// NOT reversible here — cancellations own them (cancelReceipt).
function reverseStockMovement(db, movementId, reason = '', actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const why = validateReasonCode(reason);
  return withTransaction(db, () => {
    const stock = createStockRepository(db);
    const products = createProductRepository(db);
    const target = stock.getMovement(movementId);
    if (target.movement_type === 'reversal') throw new StateError('a reversal cannot itself be reversed');
    if (target.movement_type === 'purchase_receipt' || target.movement_type === 'purchase_receipt_reversal') {
      throw new StateError('receipt movements reverse via cancelReceipt, not here');
    }
    if (stock.reversedBy(target.id).length > 0) throw new StateError(`movement ${target.id} was already reversed`);
    const product = products.getById(target.product_id);

    const reverseOne = (mov) => {
      const warehouse = createWarehouseRepository(db).getById(mov.warehouse_id);
      assertSufficientStock(stock, product, warehouse, -mov.qty);
      return stock.insertMovement({
        productId: mov.product_id, warehouseId: mov.warehouse_id, qty: -mov.qty,
        movementType: 'reversal', reasonCode: why, reversesMovementId: mov.id,
        referenceType: mov.reference_type, referenceId: mov.reference_id, unitCost: mov.unit_cost,
      });
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
function getStockLedger(db, { productId = null, warehouseId = null, limit = 500 } = {}) {
  const rows = createStockRepository(db).ledger({ productId, warehouseId, limit });
  const balances = new Map();
  return rows.map((r) => {
    const key = `${r.product_id}:${r.warehouse_id}`;
    const balance = (balances.get(key) || 0) + r.qty;
    balances.set(key, balance);
    return { ...r, balance_after: balance };
  });
}

module.exports = { issueStock, adjustStock, transferStock, reverseStockMovement, getAvailableStock, getStockLedger };
