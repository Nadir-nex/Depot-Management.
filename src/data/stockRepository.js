'use strict';
// Warehouse + stock-movement + receipt + audit repositories. Raw SQL only.
const { NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');
const { isAuditOperation } = require('../domain/vocabulary');

function createWarehouseRepository(db) {
  return {
    ensureMain() {
      const existing = db.prepare("SELECT * FROM warehouses WHERE code = 'MAIN'").get();
      if (existing) return existing;
      const now = utcNowIso();
      const info = db.prepare(
        'INSERT INTO warehouses (code, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
      ).run('MAIN', 'Main depot', now, now);
      return db.prepare('SELECT * FROM warehouses WHERE id = ?').get(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`warehouse ${id} not found`);
      return r;
    },
    getByCode(code) {
      return db.prepare('SELECT * FROM warehouses WHERE code = ?').get(code) || null;
    },
    list() {
      return db.prepare('SELECT * FROM warehouses ORDER BY code').all();
    },
  };
}

function createStockRepository(db) {
  return {
    insertMovement({ productId, warehouseId, qty, movementType, referenceType, referenceId, unitCost = 0, notes = '' }) {
      const info = db.prepare(
        `INSERT INTO stock_movements
           (product_id, warehouse_id, qty, movement_type, reference_type, reference_id, unit_cost, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(productId, warehouseId, qty, movementType, referenceType, referenceId, unitCost, notes, utcNowIso());
      return Number(info.lastInsertRowid);
    },
    stockOf(productId, warehouseId) {
      const r = db.prepare(
        'SELECT COALESCE(SUM(qty), 0) AS stock FROM stock_movements WHERE product_id = ? AND warehouse_id = ?'
      ).get(productId, warehouseId);
      return r.stock;
    },
    stockByProduct(warehouseId) {
      return db.prepare(
        `SELECT p.id AS product_id, p.sku, p.name, p.default_sale_price, COALESCE(SUM(m.qty), 0) AS stock
           FROM products p LEFT JOIN stock_movements m
             ON m.product_id = p.id AND m.warehouse_id = ?
          GROUP BY p.id ORDER BY p.name`
      ).all(warehouseId);
    },
    listMovements({ productId = null, warehouseId = null, limit = 200 } = {}) {
      const conds = [];
      const params = [];
      if (productId !== null) { conds.push('product_id = ?'); params.push(productId); }
      if (warehouseId !== null) { conds.push('warehouse_id = ?'); params.push(warehouseId); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(`SELECT * FROM stock_movements ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit);
    },
  };
}

function createReceiptRepository(db) {
  return {
    insertReceipt({ receiptNo, warehouseId, supplierName, postedAt }) {
      const now = utcNowIso();
      const info = db.prepare(
        `INSERT INTO purchase_receipts
           (receipt_no, warehouse_id, supplier_name, status, posted_at, created_at, updated_at)
         VALUES (?, ?, ?, 'posted', ?, ?, ?)`
      ).run(receiptNo, warehouseId, supplierName, postedAt || now, now, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    insertLine({ receiptId, productId, qty, unitCost }) {
      const info = db.prepare(
        'INSERT INTO purchase_receipt_lines (receipt_id, product_id, qty, unit_cost) VALUES (?, ?, ?, ?)'
      ).run(receiptId, productId, qty, unitCost);
      return Number(info.lastInsertRowid);
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM purchase_receipts WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`receipt ${id} not found`);
      return r;
    },
    linesOf(receiptId) {
      return db.prepare('SELECT * FROM purchase_receipt_lines WHERE receipt_id = ? ORDER BY id').all(receiptId);
    },
    getWithLines(id) {
      const receipt = this.getById(id);
      return { ...receipt, lines: this.linesOf(id) };
    },
    markCancelled(id, reason) {
      const now = utcNowIso();
      const info = db.prepare(
        "UPDATE purchase_receipts SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE id = ? AND status = 'posted'"
      ).run(now, reason, now, id);
      if (info.changes === 0) {
        const cur = db.prepare('SELECT status FROM purchase_receipts WHERE id = ?').get(id);
        if (!cur) throw new NotFoundError(`receipt ${id} not found`);
        throw new Error(`receipt ${id} is ${cur.status}, only posted receipts can be cancelled`);
      }
      return this.getById(id);
    },
    nextDailySequence(datePrefix) {
      const r = db.prepare('SELECT COUNT(*) AS n FROM purchase_receipts WHERE receipt_no LIKE ?').get(`${datePrefix}%`);
      return Number(r.n) + 1;
    },
    list({ limit = 100 } = {}) {
      return db.prepare('SELECT * FROM purchase_receipts ORDER BY id DESC LIMIT ?').all(limit);
    },
  };
}

function createAuditRepository(db) {
  return {
    // Append-only: there is deliberately no update() or delete().
    // before/after are short state sketches, reason is mandatory for
    // cancellations, referenceNo is the human document number. operation must
    // match the vocabulary audit convention (<area>.<action>).
    append({ actor = 'system', operation, entityType, entityId = null, details = '', before = '', after = '', reason = '', referenceNo = '' }) {
      if (!isAuditOperation(operation)) throw new Error(`invalid audit operation: ${operation}`);
      db.prepare(
        `INSERT INTO audit_log
           (occurred_at, actor, operation, entity_type, entity_id, details,
            before_summary, after_summary, reason, reference_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(utcNowIso(), actor, operation, entityType, entityId, details,
        String(before).slice(0, 500), String(after).slice(0, 500),
        String(reason).slice(0, 1000), String(referenceNo).slice(0, 64));
    },
    recent({ limit = 100 } = {}) {
      return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
    },
  };
}

module.exports = { createWarehouseRepository, createStockRepository, createReceiptRepository, createAuditRepository };
