'use strict';
// Reservation repository (Phase 20). Claims are rows; release is deletion.
// Availability math lives in the service; this layer sums claims.
const { NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function createReservationRepository(db) {
  return {
    insert({ routeId, productId, warehouseId, lotId = null, qty }) {
      const info = db.prepare(
        'INSERT INTO stock_reservations (route_id, product_id, warehouse_id, lot_id, qty, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(routeId, productId, warehouseId, lotId, qty, utcNowIso());
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM stock_reservations WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`reservation ${id} not found`);
      return r;
    },
    ofRoute(routeId) {
      return db.prepare('SELECT * FROM stock_reservations WHERE route_id = ? ORDER BY id').all(routeId);
    },
    // Claims of OTHER routes on one pool (NULL-safe lot match).
    claimedByOthers({ productId, warehouseId, lotId = null, excludeRouteIds = [] }) {
      const lotCond = lotId === null || lotId === undefined
        ? 'AND lot_id IS NULL'
        : 'AND lot_id = ?';
      const params = [productId, warehouseId];
      if (lotId !== null && lotId !== undefined) params.push(lotId);
      let excl = '';
      if (excludeRouteIds.length > 0) {
        excl = `AND route_id NOT IN (${excludeRouteIds.map(() => '?').join(',')})`;
        params.push(...excludeRouteIds);
      }
      const r = db.prepare(
        `SELECT COALESCE(SUM(qty), 0) AS total FROM stock_reservations
         WHERE product_id = ? AND warehouse_id = ? ${lotCond} ${excl}`
      ).get(...params);
      return r.total;
    },
    releaseRoute(routeId) {
      const info = db.prepare('DELETE FROM stock_reservations WHERE route_id = ?').run(routeId);
      return info.changes;
    },
  };
}

module.exports = { createReservationRepository };
