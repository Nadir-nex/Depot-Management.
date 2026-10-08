'use strict';
// Lot + serial repositories (Phase 10). Raw SQL only; expiry and serial
// lifecycle RULES live in the application layer, status transitions are
// compare-and-set here so concurrent paths cannot double-consume.
const { ConflictError, NotFoundError, StateError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function createLotRepository(db) {
  return {
    insert({ productId, lotNo, supplierRef = '', manufacturedDate = null, expiryDate = null }) {
      try {
        const info = db.prepare(
          `INSERT INTO lots (product_id, lot_no, supplier_ref, manufactured_date, expiry_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(productId, lotNo, supplierRef, manufacturedDate, expiryDate, utcNowIso());
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`lot ${lotNo} already exists for this product`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM lots WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`lot ${id} not found`);
      return r;
    },
    findByProductAndNo(productId, lotNo) {
      return db.prepare('SELECT * FROM lots WHERE product_id = ? AND lot_no = ?').get(productId, lotNo) || null;
    },
    listOfProduct(productId) {
      return db.prepare('SELECT * FROM lots WHERE product_id = ? ORDER BY expiry_date IS NULL, expiry_date, id').all(productId);
    },
    remove(id) {
      const info = db.prepare('DELETE FROM lots WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`lot ${id} not found`);
      return true;
    },
    isReferenced(id) {
      const mov = db.prepare('SELECT 1 FROM stock_movements WHERE lot_id = ? LIMIT 1').get(id);
      if (mov) return true;
      const ser = db.prepare('SELECT 1 FROM serial_numbers WHERE lot_id = ? LIMIT 1').get(id);
      return Boolean(ser);
    },
    stockOf(lotId, warehouseId) {
      const r = db.prepare(
        'SELECT COALESCE(SUM(qty), 0) AS stock FROM stock_movements WHERE lot_id = ? AND warehouse_id = ?'
      ).get(lotId, warehouseId);
      return r.stock;
    },
    totalStock(lotId) {
      const r = db.prepare(
        'SELECT COALESCE(SUM(qty), 0) AS stock FROM stock_movements WHERE lot_id = ?'
      ).get(lotId);
      return r.stock;
    },
    stocksOf(lotId) {
      return db.prepare(
        `SELECT m.warehouse_id, w.code AS warehouse_code, COALESCE(SUM(m.qty), 0) AS stock
           FROM stock_movements m JOIN warehouses w ON w.id = m.warehouse_id
          WHERE m.lot_id = ? GROUP BY m.warehouse_id ORDER BY w.code`
      ).all(lotId);
    },
    // Earliest landing movement: FIFO order key (NULL when never received).
    firstMovementId(lotId, warehouseId) {
      const r = db.prepare(
        'SELECT MIN(id) AS first_id FROM stock_movements WHERE lot_id = ? AND warehouse_id = ? AND qty > 0'
      ).get(lotId, warehouseId);
      return r.first_id === null ? Number.MAX_SAFE_INTEGER : r.first_id;
    },
  };
}

function createSerialRepository(db) {
  return {
    insert({ productId, lotId = null, code, warehouseId, movementId }) {
      try {
        const info = db.prepare(
          `INSERT INTO serial_numbers
             (product_id, lot_id, code, status, warehouse_id, in_movement_id, created_at)
           VALUES (?, ?, ?, 'in_stock', ?, ?, ?)`
        ).run(productId, lotId, code, warehouseId, movementId, utcNowIso());
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`serial ${code} is already registered for this product`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM serial_numbers WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`serial ${id} not found`);
      return r;
    },
    findByProductAndCode(productId, code) {
      return db.prepare('SELECT * FROM serial_numbers WHERE product_id = ? AND code = ?').get(productId, code) || null;
    },
    listOfProduct(productId, status = null) {
      if (status) return db.prepare('SELECT * FROM serial_numbers WHERE product_id = ? AND status = ? ORDER BY code').all(productId, status);
      return db.prepare('SELECT * FROM serial_numbers WHERE product_id = ? ORDER BY code').all(productId);
    },
    serialsConsumedBy(movementId) {
      return db.prepare('SELECT * FROM serial_numbers WHERE out_movement_id = ? ORDER BY id').all(movementId);
    },
    serialsRegisteredBy(movementId) {
      return db.prepare('SELECT * FROM serial_numbers WHERE in_movement_id = ? ORDER BY id').all(movementId);
    },
    // in_stock → out exactly once. Zero changes = already out (double-sell).
    consume(id, movementId) {
      const info = db.prepare(
        "UPDATE serial_numbers SET status = 'out', warehouse_id = NULL, out_movement_id = ? WHERE id = ? AND status = 'in_stock'"
      ).run(movementId, id);
      if (info.changes === 0) throw new StateError(`serial ${id} is not available (already out or missing)`);
      return this.getById(id);
    },
    // out → in_stock at a warehouse. Only reversals call this.
    restore(id, warehouseId) {
      const info = db.prepare(
        "UPDATE serial_numbers SET status = 'in_stock', warehouse_id = ?, out_movement_id = NULL WHERE id = ? AND status = 'out'"
      ).run(warehouseId, id);
      if (info.changes === 0) throw new StateError(`serial ${id} cannot be restored`);
      return this.getById(id);
    },
    move(id, warehouseId) {
      const info = db.prepare(
        "UPDATE serial_numbers SET warehouse_id = ? WHERE id = ? AND status = 'in_stock'"
      ).run(warehouseId, id);
      if (info.changes === 0) throw new StateError(`serial ${id} cannot move (not in stock)`);
      return this.getById(id);
    },
  };
}

module.exports = { createLotRepository, createSerialRepository };
