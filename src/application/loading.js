'use strict';
// Truck loading as reservations (Phase 20, Model B). Planning claims stock,
// loading verifies coverage and consumes its own claims, completion and
// cancellation release leftovers. Delivery posting (sales.js) enforces
// availability net of other routes' claims, so physical logistics and
// database stock cannot silently diverge — with zero additional movements.
const { StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { createProductRepository } = require('../data/productRepository');
const { createLotRepository } = require('../data/lotRepository');
const { createWarehouseRepository, createStockRepository, createAuditRepository } = require('../data/stockRepository');
const { createRouteRepository, createRouteStopRepository } = require('../data/logisticsRepository');
const { createReservationRepository } = require('../data/loadingRepository');
const { createDocumentRepository, createDocumentLineRepository } = require('../data/documentRepository');
const { withTransaction } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveStorableProduct(db, ref) {
  const products = createProductRepository(db);
  const product = ref.productId !== undefined && ref.productId !== null
    ? products.getById(ref.productId)
    : products.getBySku(cleanText(ref.sku));
  if (!product) throw new ValidationError(`unknown product: ${ref.sku}`);
  if (!product.isActive) throw new StateError(`product ${product.sku} is inactive`);
  if (product.productType === 'service') throw new StateError(`product ${product.sku} is a service and carries no stock`);
  return product;
}

function resolveOpenWarehouse(db, ref = {}) {
  const warehouses = createWarehouseRepository(db);
  const warehouse = ref.warehouseId !== undefined && ref.warehouseId !== null
    ? warehouses.getById(ref.warehouseId)
    : warehouses.getByCode(cleanText(ref.warehouseCode) || 'MAIN');
  if (!warehouse) throw new ValidationError('unknown warehouse');
  if (!warehouse.is_active) throw new StateError(`warehouse ${warehouse.code} is inactive`);
  return warehouse;
}

function resolveRouteForPlanning(db, routeId) {
  const route = createRouteRepository(db).getById(routeId);
  if (route.status !== 'planned' && route.status !== 'loaded') {
    throw new StateError(`route ${route.route_no} is ${route.status}: reservations change before dispatch`);
  }
  return route;
}

// Availability of one pool excluding the given routes' claims.
function availableStock(db, { productId, warehouseId, lotId = null, excludeRouteIds = [] }) {
  const pool = createStockRepository(db).poolStock({ productId, warehouseId, lotId });
  const claimed = createReservationRepository(db).claimedByOthers({ productId, warehouseId, lotId, excludeRouteIds });
  return pool - claimed;
}

// Claims stock for a route's plan. Fails when the free pool is short.
function reserveStock(db, routeId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  const qty = raw.qty;
  if (!Number.isInteger(qty) || qty <= 0) throw new ValidationError('reserve qty must be a positive integer');
  if (qty > 1_000_000_000) throw new ValidationError('reserve qty is unreasonably large');
  return withTransaction(db, () => {
    const route = resolveRouteForPlanning(db, routeId);
    const product = resolveStorableProduct(db, raw);
    const warehouse = resolveOpenWarehouse(db, raw);
    let lotId = raw.lotId ?? raw.lot_id ?? null;
    if (lotId !== null && lotId !== undefined) {
      const lot = createLotRepository(db).getById(lotId);
      if (lot.product_id !== product.id) throw new ValidationError('lot belongs to another product');
      lotId = lot.id;
    } else {
      lotId = null;
    }
    const free = availableStock(db, { productId: product.id, warehouseId: warehouse.id, lotId, excludeRouteIds: [route.id] });
    if (free < qty) {
      throw new StateError(`only ${free} of ${product.sku} available (pool claimed by other routes)`);
    }
    const row = createReservationRepository(db).insert({ routeId: route.id, productId: product.id, warehouseId: warehouse.id, lotId, qty });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.reserve', entityType: 'route', entityId: route.id, details: `sku=${product.sku} qty=${qty} free-was=${free}`, referenceNo: route.route_no });
    return row;
  });
}

// Releases claims. Returns the released row count (0 = nothing held).
function releaseReservations(db, routeId, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'deliveries.create');
  return withTransaction(db, () => {
    const route = createRouteRepository(db).getById(routeId);
    const n = createReservationRepository(db).releaseRoute(routeId);
    if (n > 0) {
      createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.reserve_release', entityType: 'route', entityId: routeId, details: `released=${n}`, referenceNo: route.route_no });
    }
    return n;
  });
}

function listReservations(db, routeId) {
  createRouteRepository(db).getById(routeId);
  return createReservationRepository(db).ofRoute(routeId);
}

// Loading coverage: every posted delivery line on the route must fit in its
// pool net of OTHER routes' claims. Consumes this route's own claims (served).
function checkRouteCoverage(db, route) {
  const stops = createRouteStopRepository(db).ofRoute(route.id);
  const docs = createDocumentRepository(db);
  const need = new Map(); // `${productId}:${lotKey}` -> { productId, lotId, qty, warehouseId }
  for (const s of stops) {
    if (s.delivery_doc_id === null || s.delivery_doc_id === undefined) continue;
    const doc = docs.getById(s.delivery_doc_id);
    if (doc.status !== 'posted') throw new StateError(`delivery ${doc.docNo} is ${doc.status}: only posted deliveries load`);
    const warehouseId = doc.warehouseId;
    if (!warehouseId) throw new ValidationError(`delivery ${doc.docNo} has no warehouse`);
    for (const line of createDocumentLineRepository(db).ofDocument(doc.id)) {
      const key = `${line.product_id}:${line.lot_id === null ? 'null' : line.lot_id}`;
      const entry = need.get(key) || { productId: line.product_id, lotId: line.lot_id, warehouseId, qty: 0 };
      entry.qty += line.qty;
      need.set(key, entry);
    }
  }
  const stock = createStockRepository(db);
  const products = createProductRepository(db);
  for (const entry of need.values()) {
    const product = products.getById(entry.productId);
    const pool = stock.poolStock({ productId: entry.productId, warehouseId: entry.warehouseId, lotId: entry.lotId });
    const others = createReservationRepository(db).claimedByOthers({
      productId: entry.productId, warehouseId: entry.warehouseId, lotId: entry.lotId, excludeRouteIds: [route.id],
    });
    if (pool - others < entry.qty && !product.allowNegativeStock) {
      throw new StateError(`route needs ${entry.qty} of ${product.sku} but only ${pool - others} free`);
    }
  }
  return [...need.values()];
}

module.exports = {
  reserveStock,
  releaseReservations,
  listReservations,
  availableStock,
  checkRouteCoverage,
};
