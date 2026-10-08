'use strict';
// Warehouse + stock-movement + receipt + audit repositories. Raw SQL only.
const { NotFoundError, ValidationError } = require('../domain/errors');
const { utcNowIso } = require('../db');
const { isAuditOperation } = require('../domain/vocabulary');
const { validateMovementType } = require('../domain/inventory');

function createWarehouseRepository(db) {
  return {
    insert({ code, name }) {
      const now = utcNowIso();
      const info = db.prepare(
        'INSERT INTO warehouses (code, name, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)'
      ).run(code, name, now, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    ensureMain() {
      const { MAIN_WAREHOUSE_CODE } = require('../domain/vocabulary');
      const existing = db.prepare('SELECT * FROM warehouses WHERE code = ?').get(MAIN_WAREHOUSE_CODE);
      if (existing) return existing;
      const now = utcNowIso();
      const info = db.prepare(
        'INSERT INTO warehouses (code, name, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)'
      ).run(MAIN_WAREHOUSE_CODE, 'Main depot', now, now);
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
    setActive(id, active) {
      const info = db.prepare('UPDATE warehouses SET is_active = ?, updated_at = ? WHERE id = ?')
        .run(active ? 1 : 0, utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`warehouse ${id} not found`);
      return this.getById(id);
    },
    remove(id) {
      const info = db.prepare('DELETE FROM warehouses WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`warehouse ${id} not found`);
      return true;
    },
    // Any movement or receipt referencing the warehouse blocks deletion.
    isReferenced(id) {
      const mov = db.prepare('SELECT 1 FROM stock_movements WHERE warehouse_id = ? LIMIT 1').get(id);
      if (mov) return true;
      const rec = db.prepare('SELECT 1 FROM purchase_receipts WHERE warehouse_id = ? LIMIT 1').get(id);
      return Boolean(rec);
    },
  };
}

function createStockRepository(db) {
  return {
    // The ONLY writer of stock_movements (P09 exit gate: no quantity is ever
    // assigned anywhere else). Validates the movement type against the single
    // vocabulary source and the unit against the registry before inserting.
    insertMovement({ productId, warehouseId, qty, movementType, reasonCode = null, reversesMovementId = null, referenceType = '', referenceId = 0, unitCost = 0, unitCode = 'PCS', notes = '' }) {
      validateMovementType(movementType);
      if (!Number.isInteger(qty) || qty === 0) {
        throw new ValidationError('movement qty must be a non-zero integer');
      }
      const unit = db.prepare('SELECT code FROM units WHERE code = ?').get(unitCode);
      if (!unit) throw new ValidationError(`unknown unit: ${unitCode}`);
      if (reversesMovementId !== null && reversesMovementId !== undefined) {
        const target = db.prepare('SELECT id FROM stock_movements WHERE id = ?').get(reversesMovementId);
        if (!target) throw new NotFoundError(`reversed movement ${reversesMovementId} not found`);
      }
      const info = db.prepare(
        `INSERT INTO stock_movements
           (product_id, warehouse_id, qty, movement_type, reason_code, reverses_movement_id,
            reference_type, reference_id, unit_cost, unit_code, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(productId, warehouseId, qty, movementType, reasonCode, reversesMovementId,
        referenceType, referenceId, unitCost, unitCode, notes, utcNowIso());
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
    // Ledger order (oldest first) for running-balance computation by callers.
    ledger({ productId = null, warehouseId = null, limit = 500 } = {}) {
      const conds = [];
      const params = [];
      if (productId !== null) { conds.push('product_id = ?'); params.push(productId); }
      if (warehouseId !== null) { conds.push('warehouse_id = ?'); params.push(warehouseId); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(`SELECT * FROM stock_movements ${where} ORDER BY id ASC LIMIT ?`).all(...params, limit);
    },
    getMovement(id) {
      const r = db.prepare('SELECT * FROM stock_movements WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`stock movement ${id} not found`);
      return r;
    },
    reversedBy(id) {
      return db.prepare('SELECT * FROM stock_movements WHERE reverses_movement_id = ? ORDER BY id').all(id);
    },
    legsOfTransfer(transferId) {
      return db.prepare(
        "SELECT * FROM stock_movements WHERE reference_type = 'stock_transfer' AND reference_id = ? ORDER BY id"
      ).all(transferId);
    },
  };
}

function createTransferRepository(db) {
  return {
    insert({ transferNo, productId, fromWarehouseId, toWarehouseId, qty, reason = '' }) {
      const info = db.prepare(
        `INSERT INTO stock_transfers
           (transfer_no, product_id, from_warehouse_id, to_warehouse_id, qty, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(transferNo, productId, fromWarehouseId, toWarehouseId, qty, reason, utcNowIso());
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`transfer ${id} not found`);
      return r;
    },
    getByNo(transferNo) {
      return db.prepare('SELECT * FROM stock_transfers WHERE transfer_no = ?').get(transferNo) || null;
    },
    nextDailySequence(datePrefix) {
      const r = db.prepare('SELECT COUNT(*) AS n FROM stock_transfers WHERE transfer_no LIKE ?').get(`${datePrefix}%`);
      return Number(r.n) + 1;
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

module.exports = { createWarehouseRepository, createStockRepository, createTransferRepository, createReceiptRepository, createAuditRepository };
