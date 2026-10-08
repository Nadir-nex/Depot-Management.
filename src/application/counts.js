'use strict';
// Inventory counts (Phase 18). Counting never moves stock: submit freezes
// expectations, approval requires reasons on variances, posting writes one
// adjustment movement per non-zero variance. Posted counts are terminal —
// their adjustments reverse through the stock engine like any other movement.
const { NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { assertCountTransition, validateCountedQty } = require('../domain/counts');
const { validateReasonCode } = require('../domain/catalog');
const { createProductRepository } = require('../data/productRepository');
const { createLotRepository } = require('../data/lotRepository');
const {
  createWarehouseRepository,
  createStockRepository,
  createAuditRepository,
} = require('../data/stockRepository');
const { createCountRepository, createCountLineRepository } = require('../data/countRepository');
const { withTransaction, utcNowIso } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function buildCountNo(counts, requested) {
  const r = cleanText(requested);
  if (r) {
    if (r.length > 32) throw new ValidationError('count number must be at most 32 characters');
    return r;
  }
  const day = utcNowIso().slice(0, 10).replace(/-/g, '');
  const prefix = `CNT-${day}-`;
  return `${prefix}${String(counts.nextDailySequence(prefix)).padStart(4, '0')}`;
}

function resolveWarehouse(db, ref = {}) {
  const warehouses = createWarehouseRepository(db);
  if (ref.warehouseId !== undefined && ref.warehouseId !== null) return warehouses.getById(ref.warehouseId);
  const code = cleanText(ref.warehouseCode) || 'MAIN';
  const w = warehouses.getByCode(code);
  if (!w) throw new NotFoundError(`warehouse ${code} not found`);
  return w;
}

function assertDraftLike(count, action) {
  if (count.status !== 'draft') {
    throw new StateError(`count ${count.count_no} is ${count.status}: ${action} needs draft (cancel and recount to restart)`);
  }
}

function withVariance(line) {
  return { ...line, variance: line.counted_qty - (line.expected_qty || 0) };
}

function createCount(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const warehouse = resolveWarehouse(db, raw);
  if (warehouse.is_active !== 1) throw new StateError(`warehouse ${warehouse.code} is inactive`);
  return withTransaction(db, () => {
    const counts = createCountRepository(db);
    const created = counts.insert({
      countNo: buildCountNo(counts, raw.countNo ?? raw.count_no),
      warehouseId: warehouse.id,
      notes: cleanText(raw.notes ?? '').slice(0, 1000),
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'count.create', entityType: 'inventory_count', entityId: created.id, details: `wh=${warehouse.code}`, referenceNo: created.count_no });
    return getCount(db, created.id);
  });
}

function getCount(db, id) {
  const count = createCountRepository(db).getById(id);
  return { ...count, lines: createCountLineRepository(db).ofCount(id).map(withVariance) };
}

function listCounts(db, opts) {
  return createCountRepository(db).list(opts);
}

function resolveCountProduct(db, ref) {
  const products = createProductRepository(db);
  const product = ref.productId !== undefined && ref.productId !== null
    ? products.getById(ref.productId)
    : products.getBySku(cleanText(ref.sku));
  if (!product) throw new ValidationError(`unknown product: ${ref.sku}`);
  if (!product.isActive) throw new StateError(`product ${product.sku} is inactive`);
  if (product.productType === 'service') throw new StateError(`product ${product.sku} is a service and carries no stock`);
  return product;
}

function resolveCountLot(db, product, lotId) {
  if (lotId === undefined || lotId === null) return null;
  const lot = createLotRepository(db).getById(lotId);
  if (lot.product_id !== product.id) throw new ValidationError('lot belongs to another product');
  return lot.id;
}

function addCountLine(db, countId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  return withTransaction(db, () => {
    const count = createCountRepository(db).getById(countId);
    assertDraftLike(count, 'adding lines');
    const product = resolveCountProduct(db, raw);
    const lotId = resolveCountLot(db, product, raw.lotId ?? raw.lot_id);
    const row = createCountLineRepository(db).insert({ countId, productId: product.id, lotId, countedQty: validateCountedQty(raw.countedQty ?? raw.counted_qty) });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'count.line_add', entityType: 'inventory_count', entityId: countId, details: `sku=${product.sku} counted=${row.counted_qty}`, referenceNo: count.count_no });
    return row;
  });
}

function updateCountLine(db, lineId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  return withTransaction(db, () => {
    const lines = createCountLineRepository(db);
    const existing = lines.getById(lineId);
    const count = createCountRepository(db).getById(existing.count_id);
    const wantsQty = raw.countedQty !== undefined || raw.counted_qty !== undefined;
    const wantsReason = raw.reasonCode !== undefined || raw.reason_code !== undefined;
    if (count.status === 'submitted') {
      // Review stage: reasons may be recorded, quantities are frozen.
      if (wantsQty) throw new StateError(`count ${count.count_no} is submitted: quantities frozen (cancel and recount to change them)`);
      if (!wantsReason) throw new ValidationError('nothing to update');
    } else {
      assertDraftLike(count, 'editing lines');
    }
    if (wantsQty) lines.updateCounted(lineId, validateCountedQty(raw.countedQty ?? raw.counted_qty));
    if (wantsReason) {
      const reason = raw.reasonCode ?? raw.reason_code;
      lines.setReason(lineId, reason === null || reason === '' ? null : validateReasonCode(reason));
    }
    createAuditRepository(db).append({ actor: auth.actor, operation: 'count.line_update', entityType: 'inventory_count', entityId: count.id, referenceNo: count.count_no });
    return lines.getById(lineId);
  });
}

function removeCountLine(db, lineId, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  return withTransaction(db, () => {
    const lines = createCountLineRepository(db);
    const existing = lines.getById(lineId);
    const count = createCountRepository(db).getById(existing.count_id);
    assertDraftLike(count, 'removing lines');
    lines.remove(lineId);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'count.line_remove', entityType: 'inventory_count', entityId: count.id, referenceNo: count.count_no });
    return true;
  });
}

// Submitting freezes expectations: each line snapshots its pool's live stock.
function submitCount(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const current = createCountRepository(db).getById(id);
  assertCountTransition(current.status, 'submitted');
  return withTransaction(db, () => {
    const counts = createCountRepository(db);
    const lines = createCountLineRepository(db);
    const rows = lines.ofCount(id);
    if (rows.length === 0) throw new ValidationError('cannot submit an empty count');
    const stock = createStockRepository(db);
    for (const row of rows) {
      lines.setExpected(row.id, stock.poolStock({ productId: row.product_id, warehouseId: current.warehouse_id, lotId: row.lot_id }));
    }
    counts.setStatus(id, 'submitted', { submittedAt: utcNowIso() });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'count.submit', entityType: 'inventory_count', entityId: id, details: `lines=${rows.length}`, referenceNo: current.count_no });
    return getCount(db, id);
  });
}

// Approval needs a reason on every non-zero variance. Zero lines pass freely.
function approveCount(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const current = createCountRepository(db).getById(id);
  assertCountTransition(current.status, 'approved');
  return withTransaction(db, () => {
    const rows = createCountLineRepository(db).ofCount(id).map(withVariance);
    const unexplained = rows.filter((r) => r.variance !== 0 && !r.reason_code);
    if (unexplained.length > 0) {
      throw new ValidationError(`${unexplained.length} variance line(s) lack a reason`);
    }
    createCountRepository(db).setStatus(id, 'approved', { approvedAt: utcNowIso() });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'count.approve', entityType: 'inventory_count', entityId: id, details: `lines=${rows.length}`, referenceNo: current.count_no });
    return getCount(db, id);
  });
}

// Posting writes one adjustment per non-zero variance (expected → counted).
// Equal lines post nothing: the count still completes, provably a no-op.
function postCount(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const current = createCountRepository(db).getById(id);
  assertCountTransition(current.status, 'posted');
  return withTransaction(db, () => {
    const counts = createCountRepository(db);
    const stock = createStockRepository(db);
    const warehouse = createWarehouseRepository(db).getById(current.warehouse_id);
    if (warehouse.is_active !== 1) throw new StateError(`warehouse ${warehouse.code} is inactive`);
    const rows = createCountLineRepository(db).ofCount(id).map(withVariance);
    let posted = 0;
    for (const row of rows) {
      if (row.variance === 0) continue;
      const product = createProductRepository(db).getById(row.product_id);
      assertPoolFloor(stock, product, warehouse, row.lot_id, row.variance);
      stock.insertMovement({
        productId: row.product_id, warehouseId: warehouse.id, qty: row.variance, lotId: row.lot_id,
        movementType: 'adjustment', reasonCode: row.reason_code,
        referenceType: 'inventory_count', referenceId: id,
        notes: `count ${current.count_no}`,
      });
      posted++;
    }
    counts.setStatus(id, 'posted', { postedAt: utcNowIso() });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'count.post', entityType: 'inventory_count', entityId: id, details: `adjustments=${posted}/${rows.length}`, referenceNo: current.count_no });
    return getCount(db, id);
  });
}

function assertPoolFloor(stock, product, warehouse, lotId, delta) {
  const pool = stock.poolStock({ productId: product.id, warehouseId: warehouse.id, lotId });
  if (pool + delta < 0 && !product.allowNegativeStock) {
    throw new StateError(`count would drive ${product.sku} to ${pool + delta}: recount or allow negative stock`);
  }
}

function cancelCount(db, id, reason = '', actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'stock.adjust');
  const why = cleanText(reason);
  if (!why) throw new ValidationError('a cancel reason is required');
  const current = createCountRepository(db).getById(id);
  assertCountTransition(current.status, 'cancelled');
  return withTransaction(db, () => {
    createCountRepository(db).setStatus(id, 'cancelled', { cancelledAt: utcNowIso(), cancelReason: why.slice(0, 1000) });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'count.cancel', entityType: 'inventory_count', entityId: id, details: `was ${current.status}`, reason: why.slice(0, 1000), referenceNo: current.count_no });
    return getCount(db, id);
  });
}

module.exports = {
  createCount,
  getCount,
  listCounts,
  addCountLine,
  updateCountLine,
  removeCountLine,
  submitCount,
  approveCount,
  postCount,
  cancelCount,
};
