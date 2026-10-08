'use strict';
// Logistics repositories (Phase 19). Route/stop status moves are written by
// the service after its completion-rule checks; this layer maps rows.
const { ConflictError, NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function createDriverRepository(db) {
  return {
    insert({ code, name, phone = '' }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          'INSERT INTO drivers (code, name, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
        ).run(code, name, phone, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`driver ${code} already exists`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`driver ${id} not found`);
      return r;
    },
    getByCode(code) {
      return db.prepare('SELECT * FROM drivers WHERE code = ?').get(code) || null;
    },
    list() {
      return db.prepare('SELECT * FROM drivers ORDER BY code').all();
    },
    setActive(id, active) {
      const info = db.prepare('UPDATE drivers SET is_active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`driver ${id} not found`);
      return this.getById(id);
    },
  };
}

function createVehicleRepository(db) {
  return {
    insert({ code, plate = '', description = '' }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          'INSERT INTO fleet_vehicles (code, plate, description, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
        ).run(code, plate, description, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`vehicle ${code} already exists`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM fleet_vehicles WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`vehicle ${id} not found`);
      return r;
    },
    getByCode(code) {
      return db.prepare('SELECT * FROM fleet_vehicles WHERE code = ?').get(code) || null;
    },
    list() {
      return db.prepare('SELECT * FROM fleet_vehicles ORDER BY code').all();
    },
    setActive(id, active) {
      const info = db.prepare('UPDATE fleet_vehicles SET is_active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`vehicle ${id} not found`);
      return this.getById(id);
    },
  };
}

function createRouteRepository(db) {
  return {
    insert({ routeNo, routeDate, notes }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          `INSERT INTO routes (route_no, route_date, status, notes, created_at, updated_at)
           VALUES (?, ?, 'planned', ?, ?, ?)`
        ).run(routeNo, routeDate, notes, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`route ${routeNo} already exists (duplicate submission?)`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`route ${id} not found`);
      return r;
    },
    list({ status = null, limit = 200 } = {}) {
      if (status) return db.prepare('SELECT * FROM routes WHERE status = ? ORDER BY id DESC LIMIT ?').all(status, limit);
      return db.prepare('SELECT * FROM routes ORDER BY id DESC LIMIT ?').all(limit);
    },
    assign({ id, driverId = null, vehicleId = null }) {
      const info = db.prepare('UPDATE routes SET driver_id = ?, vehicle_id = ?, updated_at = ? WHERE id = ?')
        .run(driverId, vehicleId, utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`route ${id} not found`);
      return this.getById(id);
    },
    setStatus(id, status, stamps = {}) {
      const sets = ['status = ?', 'updated_at = ?'];
      const params = [status, utcNowIso()];
      for (const [col, val] of Object.entries({ dispatched_at: stamps.dispatchedAt, completed_at: stamps.completedAt, cancel_reason: stamps.cancelReason })) {
        if (val !== undefined) { sets.push(`${col} = ?`); params.push(val); }
      }
      params.push(id);
      const info = db.prepare(`UPDATE routes SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (info.changes === 0) throw new NotFoundError(`route ${id} not found`);
      return this.getById(id);
    },
    nextDailySequence(prefix) {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM routes WHERE route_no LIKE ?').get(`${prefix}%`).n) + 1;
    },
  };
}

function createRouteStopRepository(db) {
  return {
    insert({ routeId, stopNo, partyId, deliveryDocId = null }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          `INSERT INTO route_stops (route_id, stop_no, party_id, delivery_doc_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`
        ).run(routeId, stopNo, partyId, deliveryDocId, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError('duplicate stop number or delivery on this route');
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare(
        `SELECT s.*, p.code AS party_code, p.display_name AS party_name
           FROM route_stops s JOIN parties p ON p.id = s.party_id WHERE s.id = ?`
      ).get(id);
      if (!r) throw new NotFoundError(`stop ${id} not found`);
      return r;
    },
    ofRoute(routeId) {
      return db.prepare(
        `SELECT s.*, p.code AS party_code, p.display_name AS party_name
           FROM route_stops s JOIN parties p ON p.id = s.party_id
          WHERE s.route_id = ? ORDER BY s.stop_no`
      ).all(routeId);
    },
    nextStopNo(routeId) {
      const r = db.prepare('SELECT COALESCE(MAX(stop_no), 0) AS m FROM route_stops WHERE route_id = ?').get(routeId);
      return Number(r.m) + 1;
    },
    setOutcome(id, { status, failReason = '', collectedAmount = 0, proofRef = '' }) {
      const info = db.prepare(
        `UPDATE route_stops SET status = ?, fail_reason = ?, collected_amount = ?, proof_ref = ?,
          completed_at = ?, updated_at = ? WHERE id = ?`
      ).run(status, failReason, collectedAmount, proofRef, utcNowIso(), utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`stop ${id} not found`);
      return this.getById(id);
    },
    cancelPending(routeId) {
      db.prepare("UPDATE route_stops SET status = 'cancelled', updated_at = ? WHERE route_id = ? AND status = 'pending'")
        .run(utcNowIso(), routeId);
    },
  };
}

module.exports = { createDriverRepository, createVehicleRepository, createRouteRepository, createRouteStopRepository };
