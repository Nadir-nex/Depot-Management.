'use strict';
// Fiscal year / exercise domain (Phase 25). Pure validation and queries.

const { ConflictError, NotFoundError, StateError, ValidationError } = require('./errors');
const { utcNowIso } = require('../db');

const FY_STATUSES = Object.freeze(['open', 'closed', 'archived']);

function validateFyCode(code) {
  if (!code || typeof code !== 'string') throw new ValidationError('fiscal year code is required');
  const c = code.trim();
  if (c.length < 1 || c.length > 32) throw new ValidationError('fiscal year code must be 1-32 chars');
  return c;
}

function validateFyDates(start, end) {
  const s = typeof start === 'string' && start.match(/^\d{4}-\d{2}-\d{2}$/) ? start : null;
  const e = typeof end === 'string' && end.match(/^\d{4}-\d{2}-\d{2}$/) ? end : null;
  if (!s || !e) throw new ValidationError('start_date and end_date must be YYYY-MM-DD');
  if (s >= e) throw new ValidationError('start_date must be before end_date');
  return { start: s, end: e };
}

function validateStatus(status) {
  if (!FY_STATUSES.includes(status)) throw new ValidationError(`invalid fiscal year status: ${status}`);
  return status;
}

// Accounting event types and their default debit/credit logic is in application layer
const ACCT_EVENT_TYPES = Object.freeze([
  'sales_invoice_posted', 'sales_credit_note', 'purchase_invoice_recorded',
  'purchase_credit_note', 'cash_receipt', 'cash_payment', 'cash_adjustment',
  'stock_movement', 'expense_recorded', 'manual_journal'
]);

const SOURCE_TYPES = Object.freeze([
  'document', 'payment_allocation', 'cash_transaction', 'expense', 'stock_movement', 'manual'
]);

const JOURNAL_CODES = Object.freeze({
  SALES: 'SAL', PURCHASES: 'PUR', CASH: 'CSH', STOCK: 'STK', GENERAL: 'GEN'
});

module.exports = {
  FY_STATUSES,
  ACCT_EVENT_TYPES,
  SOURCE_TYPES,
  JOURNAL_CODES,
  validateFyCode,
  validateFyDates,
  validateStatus,
};
