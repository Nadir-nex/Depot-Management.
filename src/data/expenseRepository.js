'use strict';
// Expense repositories (Phase 17). Categories are reference data; expenses
// are append-only with status. Cash legs are written by the service into
// cash_transactions — this layer only maps rows.
const { ConflictError, NotFoundError, StateError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function createExpenseCategoryRepository(db) {
  return {
    insert({ code, name }) {
      try {
        const info = db.prepare('INSERT INTO expense_categories (code, name, created_at) VALUES (?, ?, ?)')
          .run(code, name, utcNowIso());
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`expense category ${code} already exists`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`expense category ${id} not found`);
      return r;
    },
    getByCode(code) {
      return db.prepare('SELECT * FROM expense_categories WHERE code = ?').get(code) || null;
    },
    list() {
      return db.prepare('SELECT * FROM expense_categories ORDER BY code').all();
    },
    remove(id) {
      const used = db.prepare('SELECT 1 FROM expenses WHERE category_id = ? LIMIT 1').get(id);
      if (used) throw new ConflictError('expense category is in use and cannot be deleted');
      const info = db.prepare('DELETE FROM expense_categories WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`expense category ${id} not found`);
      return true;
    },
  };
}

function createExpenseRepository(db) {
  return {
    insert({ expenseNo, categoryId, amount, expenseDate, method, cashAccountId, partyId, taxClass, reference, notes }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          `INSERT INTO expenses
             (expense_no, category_id, amount, expense_date, method, cash_account_id,
              party_id, tax_class, status, reference, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)`
        ).run(expenseNo, categoryId, amount, expenseDate, method, cashAccountId, partyId,
          taxClass, reference, notes, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`expense ${expenseNo} already exists (duplicate submission?)`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare(
        `SELECT e.*, c.code AS category_code, c.name AS category_name
           FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.id = ?`
      ).get(id);
      if (!r) throw new NotFoundError(`expense ${id} not found`);
      return r;
    },
    list({ categoryId = null, from = null, to = null, status = null, limit = 200 } = {}) {
      const conds = [];
      const params = [];
      if (categoryId !== null && categoryId !== undefined) { conds.push('e.category_id = ?'); params.push(categoryId); }
      if (from) { conds.push('e.expense_date >= ?'); params.push(from); }
      if (to) { conds.push('e.expense_date <= ?'); params.push(to); }
      if (status) { conds.push('e.status = ?'); params.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(
        `SELECT e.*, c.code AS category_code FROM expenses e
         JOIN expense_categories c ON c.id = e.category_id
         ${where} ORDER BY e.expense_date DESC, e.id DESC LIMIT ?`
      ).all(...params, limit);
    },
    markCancelled(id, reason) {
      const info = db.prepare("UPDATE expenses SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ? AND status = 'posted'")
        .run(reason, utcNowIso(), id);
      if (info.changes === 0) {
        const cur = db.prepare('SELECT status FROM expenses WHERE id = ?').get(id);
        if (!cur) throw new NotFoundError(`expense ${id} not found`);
        throw new StateError(`expense ${id} is already cancelled`);
      }
      return this.getById(id);
    },
    // Explainability query: posted totals grouped by category in a range.
    totalsByCategory({ from = null, to = null } = {}) {
      const conds = ["e.status = 'posted'"];
      const params = [];
      if (from) { conds.push('e.expense_date >= ?'); params.push(from); }
      if (to) { conds.push('e.expense_date <= ?'); params.push(to); }
      return db.prepare(
        `SELECT c.code AS category, c.name AS category_name, COALESCE(SUM(e.amount), 0) AS total,
                COUNT(*) AS count FROM expenses e
         JOIN expense_categories c ON c.id = e.category_id
         WHERE ${conds.join(' AND ')} GROUP BY c.id ORDER BY total DESC`
      ).all(...params);
    },
  };
}

module.exports = { createExpenseCategoryRepository, createExpenseRepository };
