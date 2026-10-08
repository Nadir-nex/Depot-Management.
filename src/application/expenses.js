'use strict';
// Operational expenses (Phase 17). Cash-paid expenses move till money in the
// SAME transaction as the record; non-cash ones record the obligation without
// touching cash. Reversal compensates (cash leg back in, status cancelled) —
// rows are never deleted. Expenses never touch stock by construction (no stock
// calls exist in this module; pinned by test).
const { StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const {
  validateExpenseNo,
  validateCategoryCode,
  validateCategoryName,
  validateExpenseAmount,
  validateExpenseMethod,
  validateExpenseDate,
} = require('../domain/expenses');
const { validateTaxClass } = require('../domain/products');
const { todayDateString } = require('../domain/dates');
const { createExpenseCategoryRepository, createExpenseRepository } = require('../data/expenseRepository');
const { createCashAccountRepository, createCashSessionRepository, createCashTransactionRepository } = require('../data/paymentRepository');
const { createPartyRepository } = require('../data/partyRepository');
const { createAuditRepository } = require('../data/stockRepository');
const { withTransaction, utcNowIso } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function createExpenseCategory(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'cash.manage');
  const code = validateCategoryCode(raw.code);
  const name = validateCategoryName(raw.name);
  return withTransaction(db, () => {
    const created = createExpenseCategoryRepository(db).insert({ code, name });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'expense.category_create', entityType: 'expense_category', entityId: created.id, details: `code=${code}`, referenceNo: code });
    return created;
  });
}

function listExpenseCategories(db) {
  return createExpenseCategoryRepository(db).list();
}

function deleteExpenseCategory(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'cash.manage');
  return withTransaction(db, () => {
    const current = createExpenseCategoryRepository(db).getById(id);
    createExpenseCategoryRepository(db).remove(id);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'expense.category_delete', entityType: 'expense_category', entityId: id, details: `code=${current.code}`, before: `code=${current.code}` });
    return true;
  });
}

function buildExpenseNo(expenses, requested) {
  const r = cleanText(requested);
  if (r) {
    if (r.length > 32) throw new ValidationError('expense number must be at most 32 characters');
    return r;
  }
  const day = utcNowIso().slice(0, 10).replace(/-/g, '');
  const prefix = `EXP-${day}-`;
  const n = expenses.list({ limit: 100000 }).filter((e) => e.expense_no.startsWith(prefix)).length + 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

function resolveCategory(db, ref) {
  const categories = createExpenseCategoryRepository(db);
  if (ref.categoryId !== undefined && ref.categoryId !== null) return categories.getById(ref.categoryId);
  const code = validateCategoryCode(ref.categoryCode ?? ref.category_code ?? '');
  const found = categories.getByCode(code);
  if (!found) throw new ValidationError(`unknown expense category: ${code}`);
  return found;
}

function resolveCashAccount(db, method, ref) {
  const accounts = createCashAccountRepository(db);
  const hasRef = (ref.cashAccountId !== undefined && ref.cashAccountId !== null) || cleanText(ref.cashAccountCode ?? ref.cash_account_code ?? '') !== '';
  if (method !== 'cash' && hasRef) throw new ValidationError('only cash expenses touch a cash account');
  if (method !== 'cash') return null;
  const account = ref.cashAccountId !== undefined && ref.cashAccountId !== null
    ? accounts.getById(ref.cashAccountId)
    : accounts.getByCode(validateCategoryCode(ref.cashAccountCode ?? ref.cash_account_code ?? ''));
  if (!account) throw new ValidationError('cash account not found');
  if (!account.is_active) throw new StateError(`cash account ${account.code} is inactive`);
  return account;
}

function createExpense(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'cash.manage');
  const method = validateExpenseMethod(raw.method);
  const amount = validateExpenseAmount(raw.amount);
  const expenseDate = validateExpenseDate(raw.expenseDate ?? raw.expense_date) || todayDateString();
  return withTransaction(db, () => {
    const expenses = createExpenseRepository(db);
    const category = resolveCategory(db, raw);
    const account = resolveCashAccount(db, method, raw);
    let partyId = raw.partyId ?? raw.party_id ?? null;
    if (partyId !== null && partyId !== undefined) {
      const party = createPartyRepository(db).getById(partyId);
      if (!party.isActive) throw new StateError(`party ${party.code} is inactive`);
      partyId = party.id;
    } else {
      partyId = null;
    }
    const expense = expenses.insert({
      expenseNo: buildExpenseNo(expenses, raw.expenseNo ?? raw.expense_no),
      categoryId: category.id, amount, expenseDate, method,
      cashAccountId: account ? account.id : null, partyId,
      taxClass: validateTaxClass(raw.taxClass ?? raw.tax_class),
      reference: cleanText(raw.reference ?? '').slice(0, 64),
      notes: cleanText(raw.notes ?? '').slice(0, 1000),
    });
    if (account) {
      const session = createCashSessionRepository(db).openOfAccount(account.id);
      createCashTransactionRepository(db).insert({
        cashAccountId: account.id, sessionId: session ? session.id : null,
        paymentId: null, direction: 'out', amount, reason: `expense ${expense.expense_no}`,
      });
    }
    createAuditRepository(db).append({ actor: auth.actor, operation: 'expense.create', entityType: 'expense', entityId: expense.id, details: `${category.code} ${amount} ${method}`, referenceNo: expense.expense_no });
    return expenses.getById(expense.id);
  });
}

function getExpense(db, id) {
  return createExpenseRepository(db).getById(id);
}

function listExpenses(db, opts) {
  return createExpenseRepository(db).list(opts);
}

function expenseReport(db, { from = null, to = null } = {}) {
  const rows = createExpenseRepository(db).totalsByCategory({ from, to });
  return { rows, total: rows.reduce((n, r) => n + r.total, 0) };
}

// Reversal compensates the cash leg (when there was one) and cancels the row.
// The original stays queryable; nothing is deleted.
function reverseExpense(db, id, reason = '', actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'cash.manage');
  const why = cleanText(reason);
  if (!why) throw new ValidationError('a reversal reason is required');
  return withTransaction(db, () => {
    const expenses = createExpenseRepository(db);
    const current = expenses.getById(id);
    if (current.status !== 'posted') throw new StateError(`expense ${current.expense_no} is already cancelled`);
    if (current.cash_account_id) {
      const session = createCashSessionRepository(db).openOfAccount(current.cash_account_id);
      createCashTransactionRepository(db).insert({
        cashAccountId: current.cash_account_id, sessionId: session ? session.id : null,
        paymentId: null, direction: 'in', amount: current.amount, reason: `reversal of ${current.expense_no}`,
      });
    }
    const cancelled = expenses.markCancelled(id, why.slice(0, 1000));
    createAuditRepository(db).append({ actor: auth.actor, operation: 'expense.reverse', entityType: 'expense', entityId: id, details: `reversed ${current.expense_no}`, reason: why.slice(0, 1000), referenceNo: current.expense_no });
    return cancelled;
  });
}

module.exports = {
  createExpenseCategory,
  listExpenseCategories,
  deleteExpenseCategory,
  createExpense,
  getExpense,
  listExpenses,
  expenseReport,
  reverseExpense,
};
