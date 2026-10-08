'use strict';
// Fiscal/Accounting repositories (Phase 25). Raw SQL only.
const { NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function toFiscalYear(r) {
  if (!r) return null;
  return {
    id: r.id, code: r.code, name: r.name,
    startDate: r.start_date, endDate: r.end_date,
    status: r.status, closedAt: r.closed_at, closedBy: r.closed_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function createFiscalYearRepository(db) {
  return {
    insert({ code, name, startDate, endDate }) {
      const now = utcNowIso();
      const info = db.prepare(
        `INSERT INTO fiscal_years (code, name, start_date, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', ?, ?)`
      ).run(code, name || '', startDate, endDate, now, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM fiscal_years WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`fiscal year ${id} not found`);
      return toFiscalYear(r);
    },
    getByCode(code) {
      return toFiscalYear(db.prepare('SELECT * FROM fiscal_years WHERE code = ?').get(code));
    },
    getOpen() {
      return toFiscalYear(db.prepare('SELECT * FROM fiscal_years WHERE status = ? ORDER BY start_date DESC LIMIT 1').get('open'));
    },
    list({ status = null, limit = 50 } = {}) {
      const conds = [];
      const params = [];
      if (status) { conds.push('status = ?'); params.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(`SELECT * FROM fiscal_years ${where} ORDER BY start_date DESC LIMIT ?`).all(...params, limit).map(toFiscalYear);
    },
    setStatus(id, status, { closedBy = null } = {}) {
      const now = utcNowIso();
      const sets = ['status = ?', 'updated_at = ?'];
      const params = [status, now];
      if (status === 'closed') {
        sets.push('closed_at = ?', 'closed_by = ?');
        params.push(now, closedBy || 'system');
      }
      params.push(id);
      const info = db.prepare(`UPDATE fiscal_years SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (info.changes === 0) throw new NotFoundError(`fiscal year ${id} not found`);
      return this.getById(id);
    },
    isDateInOpenFy(date) {
      const r = db.prepare(
        `SELECT 1 FROM fiscal_years WHERE status = 'open' AND start_date <= ? AND end_date >= ? LIMIT 1`
      ).get(date, date);
      return !!r;
    },
  };
}

function createJournalRepository(db) {
  return {
    insert({ code, name, description, isSystem = 1 }) {
      const now = utcNowIso();
      const info = db.prepare(
        'INSERT INTO journals (code, name, description, is_system, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(code, name || '', description || '', isSystem ? 1 : 0, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM journals WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`journal ${id} not found`);
      return r;
    },
    getByCode(code) {
      return db.prepare('SELECT * FROM journals WHERE code = ?').get(code);
    },
    list() {
      return db.prepare('SELECT * FROM journals ORDER BY code').all();
    },
  };
}

function toAcctEvent(r) {
  if (!r) return null;
  return {
    id: r.id, fiscalYearId: r.fiscal_year_id, journalId: r.journal_id,
    eventDate: r.event_date, eventType: r.event_type, sourceType: r.source_type,
    sourceId: r.source_id, description: r.description,
    totalDebit: r.total_debit, totalCredit: r.total_credit,
    createdAt: r.created_at, createdBy: r.created_by,
  };
}

function createAccountingEventRepository(db) {
  return {
    insert({ fiscalYearId, journalId, eventDate, eventType, sourceType, sourceId, description, totalDebit = 0, totalCredit = 0, createdBy = 'system' }) {
      const now = utcNowIso();
      const info = db.prepare(
        `INSERT INTO accounting_events
           (fiscal_year_id, journal_id, event_date, event_type, source_type, source_id,
            description, total_debit, total_credit, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(fiscalYearId, journalId, eventDate, eventType, sourceType, sourceId,
        description || '', totalDebit, totalCredit, now, createdBy);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM accounting_events WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`accounting event ${id} not found`);
      return toAcctEvent(r);
    },
    getBySource(sourceType, sourceId) {
      return db.prepare(
        'SELECT * FROM accounting_events WHERE source_type = ? AND source_id = ?'
      ).all(sourceType, sourceId).map(toAcctEvent);
    },
    listByFiscalYear(fiscalYearId, { limit = 200 } = {}) {
      return db.prepare(
        'SELECT * FROM accounting_events WHERE fiscal_year_id = ? ORDER BY event_date, id LIMIT ?'
      ).all(fiscalYearId, limit).map(toAcctEvent);
    },
  };
}

function createJournalLineRepository(db) {
  return {
    insert({ accountingEventId, lineNo, accountCode, accountName, debit = 0, credit = 0,
      chargeCategoryId = null, fiscalClassificationId = null, costCenter = null, description = '' }) {
      const info = db.prepare(
        `INSERT INTO journal_lines
           (accounting_event_id, line_no, account_code, account_name, debit, credit,
            charge_category_id, fiscal_classification_id, cost_center, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(accountingEventId, lineNo, accountCode, accountName || '', debit, credit,
        chargeCategoryId, fiscalClassificationId, costCenter, description);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM journal_lines WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`journal line ${id} not found`);
      return r;
    },
    ofEvent(accountingEventId) {
      return db.prepare(
        'SELECT * FROM journal_lines WHERE accounting_event_id = ? ORDER BY line_no'
      ).all(accountingEventId);
    },
  };
}

function createChargeCategoryRepository(db) {
  return {
    insert({ code, name, parentId = null }) {
      const now = utcNowIso();
      const info = db.prepare(
        'INSERT INTO charge_categories (code, name, parent_id, is_active, created_at) VALUES (?, ?, ?, 1, ?)'
      ).run(code, name || '', parentId, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM charge_categories WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`charge category ${id} not found`);
      return r;
    },
    list({ activeOnly = true } = {}) {
      const where = activeOnly ? 'WHERE is_active = 1' : '';
      return db.prepare(`SELECT * FROM charge_categories ${where} ORDER BY code`).all();
    },
  };
}

function createFiscalClassificationRepository(db) {
  return {
    insert({ code, name, description, appliesTo = 'all' }) {
      const now = utcNowIso();
      const info = db.prepare(
        'INSERT INTO fiscal_classifications (code, name, description, applies_to, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
      ).run(code, name || '', description || '', appliesTo, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM fiscal_classifications WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`fiscal classification ${id} not found`);
      return r;
    },
    list({ activeOnly = true } = {}) {
      const where = activeOnly ? 'WHERE is_active = 1' : '';
      return db.prepare(`SELECT * FROM fiscal_classifications ${where} ORDER BY code`).all();
    },
  };
}

module.exports = {
  createFiscalYearRepository,
  createJournalRepository,
  createAccountingEventRepository,
  createJournalLineRepository,
  createChargeCategoryRepository,
  createFiscalClassificationRepository,
};
