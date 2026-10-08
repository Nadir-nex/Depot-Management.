'use strict';
// Lot + serial queries and master-data commands (Phase 10).
// suggestLots() is a PURE QUERY hook: it proposes an allocation but never
// moves anything — callers (sales UI in P13, counts in P18) apply the proposal
// explicitly through issue/adjust/transfer. Nothing auto-consumes lots.
const { ConflictError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { todayDateString, isExpired } = require('../domain/dates');
const { validateLotNo, validateSupplierRef, validateLotDates } = require('../domain/catalog');
const { createProductRepository } = require('../data/productRepository');
const { createLotRepository, createSerialRepository } = require('../data/lotRepository');
const { createAuditRepository } = require('../data/stockRepository');
const { withTransaction } = require('../db');

function createLot(db, productId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  const lotNo = validateLotNo(raw.lotNo ?? raw.lot_no);
  const { manufacturedDate: manufactured, expiryDate: expiry } = validateLotDates(raw);
  return withTransaction(db, () => {
    createProductRepository(db).getById(productId);
    const lot = createLotRepository(db).insert({
      productId, lotNo,
      supplierRef: validateSupplierRef(raw.supplierRef ?? raw.supplier_ref),
      manufacturedDate: manufactured, expiryDate: expiry,
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'lot.create', entityType: 'lot', entityId: lot.id, details: `product=${productId} lot=${lotNo}`, referenceNo: lotNo.slice(0, 64) });
    return lot;
  });
}

function getLot(db, id) {
  const lot = createLotRepository(db).getById(id);
  return { ...lot, stocks: createLotRepository(db).stocksOf(id) };
}

function deleteLot(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  return withTransaction(db, () => {
    const lots = createLotRepository(db);
    const current = lots.getById(id);
    if (lots.isReferenced(id)) {
      throw new ConflictError(`lot ${current.lot_no} has movements or serials and cannot be deleted`);
    }
    lots.remove(id);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'lot.delete', entityType: 'lot', entityId: id, details: `lot=${current.lot_no}`, before: `lot=${current.lot_no}`, referenceNo: current.lot_no.slice(0, 64) });
    return true;
  });
}

// Lots of a product with live stock + expiry state. warehouseId scopes the
// stock figure; without it the total across warehouses is reported.
function listLots(db, productId, { warehouseId = null, includeExpired = true, atDate = null } = {}) {
  createProductRepository(db).getById(productId);
  const day = atDate || todayDateString();
  const lots = createLotRepository(db);
  return lots.listOfProduct(productId)
    .map((lot) => {
      const stock = warehouseId === null
        ? lots.totalStock(lot.id)
        : lots.stockOf(lot.id, warehouseId);
      return { ...lot, stock, expired: isExpired(lot.expiry_date, day) };
    })
    .filter((row) => includeExpired || !row.expired);
}

// Allocation proposal only — never writes. FEFO skips expired lots and takes
// earliest-expiry first; FIFO takes earliest-received first. Shortfall throws
// instead of silently under-allocating.
function suggestLots(db, { productId, warehouseId, qty, policy = 'fefo', atDate = null } = {}) {
  if (!Number.isInteger(qty) || qty <= 0) throw new ValidationError('qty must be a positive integer');
  if (policy !== 'fefo' && policy !== 'fifo') throw new ValidationError("policy must be 'fefo' or 'fifo'");
  createProductRepository(db).getById(productId);
  const day = atDate || todayDateString();
  const lots = createLotRepository(db);
  const candidates = lots.listOfProduct(productId)
    .map((lot) => ({ lot, stock: lots.stockOf(lot.id, warehouseId), firstIn: lots.firstMovementId(lot.id, warehouseId) }))
    .filter((c) => c.stock > 0 && !isExpired(c.lot.expiry_date, day));
  candidates.sort((a, b) => policy === 'fefo'
    ? (a.lot.expiry_date || 'zz').localeCompare(b.lot.expiry_date || 'zz') || (a.lot.id - b.lot.id)
    : (a.firstIn - b.firstIn) || (a.lot.id - b.lot.id));
  const allocations = [];
  let remaining = qty;
  for (const c of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, c.stock);
    allocations.push({ lotId: c.lot.id, lotNo: c.lot.lot_no, qty: take });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new StateError(`insufficient available lot stock: need ${qty}, have ${qty - remaining}`);
  }
  return allocations;
}

function listSerials(db, productId, status = null) {
  createProductRepository(db).getById(productId);
  if (status !== null && status !== 'in_stock' && status !== 'out') {
    throw new ValidationError("status must be 'in_stock' or 'out'");
  }
  return createSerialRepository(db).listOfProduct(productId, status);
}

module.exports = { createLot, getLot, deleteLot, listLots, suggestLots, listSerials };
