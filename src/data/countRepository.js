'use strict';
// Count repositories (Phase 18). Expected quantities freeze at submit;
// variances derive (counted − expected); postings reference the count.
const { ConflictError, NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function createCountRepository(db) {
  return {
    insert({ countNo, warehouseId, notes }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          `INSERT INTO inventory_counts
             (count_no, warehouse_id, status, notes, created_at, updated_at)
           VALUES (?, ?, 'draft', ?, ?, ?)`
        ).run(countNo, warehouseId, notes, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`count ${countNo} already exists (duplicate submission?)`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM inventory_counts WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`count ${id} not found`);
      return r;
    },
    list({ status = null, warehouseId = null, limit = 200 } = {}) {
      const conds = [];
      const params = [];
      if (status) { conds.push('status = ?'); params.push(status); }
      if (warehouseId !== null && warehouseId !== undefined) { conds.push('warehouse_id = ?'); params.push(warehouseId); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(`SELECT * FROM inventory_counts ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit);
    },
    setStatus(id, status, stamps = {}) {
      const sets = ['status = ?', 'updated_at = ?'];
      const params = [status, utcNowIso()];
      for (const [col, val] of Object.entries({ submitted_at: stamps.submittedAt, approved_at: stamps.approvedAt, posted_at: stamps.postedAt, cancelled_at: stamps.cancelledAt, cancel_reason: stamps.cancelReason })) {
        if (val !== undefined) { sets.push(`${col} = ?`); params.push(val); }
      }
      params.push(id);
      const info = db.prepare(`UPDATE inventory_counts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (info.changes === 0) throw new NotFoundError(`count ${id} not found`);
      return this.getById(id);
    },
    nextDailySequence(prefix) {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM inventory_counts WHERE count_no LIKE ?').get(`${prefix}%`).n) + 1;
    },
  };
}

function createCountLineRepository(db) {
  return {
    insert({ countId, productId, lotId = null, countedQty }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          'INSERT INTO inventory_count_lines (count_id, product_id, lot_id, counted_qty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(countId, productId, lotId, countedQty, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError('this product pool is already on the count');
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare(
        `SELECT l.*, p.sku AS product_sku, p.name AS product_name, k.lot_no
           FROM inventory_count_lines l
           JOIN products p ON p.id = l.product_id
           LEFT JOIN lots k ON k.id = l.lot_id WHERE l.id = ?`
      ).get(id);
      if (!r) throw new NotFoundError(`count line ${id} not found`);
      return r;
    },
    ofCount(countId) {
      return db.prepare(
        `SELECT l.*, p.sku AS product_sku, p.name AS product_name, k.lot_no
           FROM inventory_count_lines l
           JOIN products p ON p.id = l.product_id
           LEFT JOIN lots k ON k.id = l.lot_id WHERE l.count_id = ? ORDER BY l.id`
      ).all(countId);
    },
    updateCounted(id, countedQty) {
      const info = db.prepare('UPDATE inventory_count_lines SET counted_qty = ?, updated_at = ? WHERE id = ?')
        .run(countedQty, utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`count line ${id} not found`);
      return this.getById(id);
    },
    setExpected(id, expectedQty) {
      db.prepare('UPDATE inventory_count_lines SET expected_qty = ?, updated_at = ? WHERE id = ?')
        .run(expectedQty, utcNowIso(), id);
      return this.getById(id);
    },
    setReason(id, reasonCode) {
      db.prepare('UPDATE inventory_count_lines SET reason_code = ?, updated_at = ? WHERE id = ?')
        .run(reasonCode, utcNowIso(), id);
      return this.getById(id);
    },
    remove(id) {
      const info = db.prepare('DELETE FROM inventory_count_lines WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`count line ${id} not found`);
      return true;
    },
  };
}

module.exports = { createCountRepository, createCountLineRepository };
