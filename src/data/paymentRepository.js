'use strict';
// Payment + cash repositories (Phase 16). Allocation sums and cash balances
// derive live; nothing financial is ever stored as an editable state.
const { ConflictError, NotFoundError, StateError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function createCashAccountRepository(db) {
  return {
    insert({ code, name, openingBalance = 0 }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          'INSERT INTO cash_accounts (code, name, opening_balance, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
        ).run(code, name, openingBalance, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`cash account ${code} already exists`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM cash_accounts WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`cash account ${id} not found`);
      return r;
    },
    getByCode(code) {
      return db.prepare('SELECT * FROM cash_accounts WHERE code = ?').get(code) || null;
    },
    list() {
      return db.prepare('SELECT * FROM cash_accounts ORDER BY code').all();
    },
    setActive(id, active) {
      const info = db.prepare('UPDATE cash_accounts SET is_active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`cash account ${id} not found`);
      return this.getById(id);
    },
    balanceOf(id) {
      this.getById(id);
      const opening = db.prepare('SELECT opening_balance FROM cash_accounts WHERE id = ?').get(id).opening_balance;
      const flow = db.prepare(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS flow
           FROM cash_transactions WHERE cash_account_id = ?`
      ).get(id).flow;
      return opening + flow;
    },
  };
}

function createCashSessionRepository(db) {
  return {
    open({ cashAccountId, openingAmount }) {
      const info = db.prepare(
        "INSERT INTO cash_sessions (cash_account_id, status, opening_amount, opened_at, created_at) VALUES (?, 'open', ?, ?, ?)"
      ).run(cashAccountId, openingAmount, utcNowIso(), utcNowIso());
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`cash session ${id} not found`);
      return r;
    },
    openOfAccount(cashAccountId) {
      return db.prepare("SELECT * FROM cash_sessions WHERE cash_account_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(cashAccountId) || null;
    },
    close(id, closingAmount) {
      const now = utcNowIso();
      const info = db.prepare("UPDATE cash_sessions SET status = 'closed', closing_amount = ?, closed_at = ? WHERE id = ? AND status = 'open'")
        .run(closingAmount, now, id);
      if (info.changes === 0) {
        const cur = db.prepare('SELECT status FROM cash_sessions WHERE id = ?').get(id);
        if (!cur) throw new NotFoundError(`cash session ${id} not found`);
        throw new StateError(`cash session ${id} is already closed`);
      }
      return this.getById(id);
    },
    // Reconciliation: opening + signed session transactions vs counted close.
    report(id) {
      const session = this.getById(id);
      const flow = db.prepare(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS flow,
                COUNT(*) AS n FROM cash_transactions WHERE session_id = ?`
      ).get(id);
      const expected = session.opening_amount + flow.flow;
      return {
        session,
        opening: session.opening_amount,
        transactionCount: flow.n,
        expected,
        counted: session.closing_amount,
        discrepancy: session.closing_amount === null || session.closing_amount === undefined ? null : session.closing_amount - expected,
      };
    },
  };
}

function createPaymentRepository(db) {
  return {
    insert({ paymentNo, direction, partyId, cashAccountId, method, amount, paymentDate }) {
      try {
        const now = utcNowIso();
        const info = db.prepare(
          `INSERT INTO payments
             (payment_no, direction, party_id, cash_account_id, method, amount, payment_date, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)`
        ).run(paymentNo, direction, partyId, cashAccountId, method, amount, paymentDate, now, now);
        return this.getById(Number(info.lastInsertRowid));
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`payment ${paymentNo} already exists (duplicate submission?)`);
        throw err;
      }
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`payment ${id} not found`);
      return r;
    },
    getByNo(paymentNo) {
      return db.prepare('SELECT * FROM payments WHERE payment_no = ?').get(paymentNo) || null;
    },
    countByNoPrefix(prefix) {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM payments WHERE payment_no LIKE ?').get(`${prefix}%`).n);
    },
    list({ partyId = null, status = null, limit = 200 } = {}) {
      const conds = [];
      const params = [];
      if (partyId !== null && partyId !== undefined) { conds.push('party_id = ?'); params.push(partyId); }
      if (status) { conds.push('status = ?'); params.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(`SELECT * FROM payments ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit);
    },
    markCancelled(id, reason) {
      const info = db.prepare("UPDATE payments SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ? AND status = 'posted'")
        .run(reason, utcNowIso(), id);
      if (info.changes === 0) {
        const cur = db.prepare('SELECT status FROM payments WHERE id = ?').get(id);
        if (!cur) throw new NotFoundError(`payment ${id} not found`);
        throw new StateError(`payment ${id} is already cancelled`);
      }
      return this.getById(id);
    },
  };
}

function createAllocationRepository(db) {
  return {
    add({ paymentId, targetType, targetId, amount }) {
      const info = db.prepare(
        'INSERT INTO payment_allocations (payment_id, target_type, target_id, amount) VALUES (?, ?, ?, ?)'
      ).run(paymentId, targetType, targetId, amount);
      return Number(info.lastInsertRowid);
    },
    ofPayment(paymentId) {
      return db.prepare('SELECT * FROM payment_allocations WHERE payment_id = ? ORDER BY id').all(paymentId);
    },
    // Non-cancelled payments' allocations against one target (over-allocation guard).
    allocatedTo(targetType, targetId) {
      const r = db.prepare(
        `SELECT COALESCE(SUM(a.amount), 0) AS total FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id
         WHERE a.target_type = ? AND a.target_id = ? AND p.status = 'posted'`
      ).get(targetType, targetId);
      return r.total;
    },
    allocatedByPayment(paymentId) {
      const r = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM payment_allocations WHERE payment_id = ?').get(paymentId);
      return r.total;
    },
    // Live allocations grouped by party, split by side. Feeds getPartyBalance:
    // receivables shrink by invoice allocations, payables by receipt ones.
    allocatedForPartyInvoices(partyId) {
      const r = db.prepare(
        `SELECT COALESCE(SUM(a.amount), 0) AS total FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id
         JOIN documents d ON d.id = a.target_id AND a.target_type = 'sales_invoice'
         WHERE d.party_id = ? AND p.status = 'posted'`
      ).get(partyId);
      return r.total;
    },
    allocatedForPartyReceipts(partyId) {
      const r = db.prepare(
        `SELECT COALESCE(SUM(a.amount), 0) AS total FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id
         JOIN purchase_receipts r ON r.id = a.target_id AND a.target_type = 'purchase_receipt'
         WHERE r.supplier_party_id = ? AND p.status = 'posted'`
      ).get(partyId);
      return r.total;
    },
    removeOfPayment(paymentId) {
      db.prepare('DELETE FROM payment_allocations WHERE payment_id = ?').run(paymentId);
    },
  };
}

function createCashTransactionRepository(db) {
  return {
    insert({ cashAccountId, sessionId = null, paymentId = null, direction, amount, reason = '' }) {
      const info = db.prepare(
        'INSERT INTO cash_transactions (cash_account_id, session_id, payment_id, direction, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(cashAccountId, sessionId, paymentId, direction, amount, reason, utcNowIso());
      return Number(info.lastInsertRowid);
    },
    ofSession(sessionId) {
      return db.prepare('SELECT * FROM cash_transactions WHERE session_id = ? ORDER BY id').all(sessionId);
    },
  };
}

module.exports = {
  createCashAccountRepository,
  createCashSessionRepository,
  createPaymentRepository,
  createAllocationRepository,
  createCashTransactionRepository,
};
