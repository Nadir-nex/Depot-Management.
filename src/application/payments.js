'use strict';
// Payments, allocations and cash sessions (Phase 16). One transaction per
// operation: payment row + allocation links + cash leg + invoice statuses
// commit together or not at all. Payments are never edited: reversal removes
// the allocation LINKS (derived data), writes a compensating cash movement,
// and flips status — the row stays as history. Balances derive from
// invoices/receipts MINUS live allocations, so effects apply exactly once.
const { ConflictError, NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const {
  validatePaymentNo,
  validateDirection,
  validateMethod,
  validatePaymentAmount,
  validatePaymentDate,
  validateAccountCode,
  validateAllocationTarget,
} = require('../domain/payments');
const { assertMinorUnits } = require('../domain/money');
const { assertTransition } = require('../domain/documents');
const { todayDateString } = require('../domain/dates');
const { createPartyRepository, createPartyRoleRepository, createPartyBalanceRepository } = require('../data/partyRepository');
const {
  createCashAccountRepository,
  createCashSessionRepository,
  createPaymentRepository,
  createAllocationRepository,
  createCashTransactionRepository,
} = require('../data/paymentRepository');
const { createDocumentRepository } = require('../data/documentRepository');
const { createReceiptRepository, createAuditRepository } = require('../data/stockRepository');
const { withTransaction, utcNowIso } = require('../db');
const { tryClaimOperationKey } = require('./idempotency');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveParty(db, { partyId = null, partyCode = null }, direction) {
  const parties = createPartyRepository(db);
  const party = partyId !== null && partyId !== undefined
    ? parties.getById(partyId)
    : parties.getByCode(cleanText(partyCode).toUpperCase());
  if (!party) throw new NotFoundError(`party ${partyCode || partyId} not found`);
  if (!party.isActive) throw new StateError(`party ${party.code} is inactive`);
  const need = direction === 'in' ? 'customer' : 'supplier';
  if (!createPartyRoleRepository(db).ofParty(party.id).includes(need)) {
    throw new StateError(`party ${party.code} is not a ${need}`);
  }
  return party;
}

function resolveCashAccount(db, { cashAccountId = null, cashAccountCode = null }, method) {
  const accounts = createCashAccountRepository(db);
  const hasRef = (cashAccountId !== null && cashAccountId !== undefined) || cleanText(cashAccountCode) !== '';
  if (method !== 'cash' && hasRef) throw new ValidationError('only cash payments touch a cash account');
  if (method !== 'cash') return null;
  const account = cashAccountId !== null && cashAccountId !== undefined
    ? accounts.getById(cashAccountId)
    : accounts.getByCode(validateAccountCode(cashAccountCode));
  if (!account) throw new NotFoundError(`cash account ${cashAccountCode || cashAccountId} not found`);
  if (!account.is_active) throw new StateError(`cash account ${account.code} is inactive`);
  return account;
}

function buildPaymentNo(payments, requested) {
  const r = cleanText(requested);
  if (r) {
    if (r.length > 32) throw new ValidationError('payment number must be at most 32 characters');
    return r;
  }
  const day = utcNowIso().slice(0, 10).replace(/-/g, '');
  const prefix = `PAY-${day}-`;
  const n = payments.countByNoPrefix(prefix) + 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

// Target totals for the over-allocation guards.
function targetTotal(db, targetType, targetId) {
  if (targetType === 'sales_invoice') {
    const doc = createDocumentRepository(db).getById(targetId);
    if (doc.docType !== 'sales_invoice') throw new ValidationError('allocation target is not a sales invoice');
    if (!['posted', 'partially_paid'].includes(doc.status)) {
      throw new StateError(`invoice ${doc.docNo} is ${doc.status}: only open invoices take allocations`);
    }
    return { total: doc.grandTotal, partyId: doc.partyId, doc };
  }
  const receipt = createReceiptRepository(db).getById(targetId);
  if (receipt.status !== 'posted') throw new StateError('only posted receipts take allocations');
  const lines = createReceiptRepository(db).linesOf(targetId);
  return { total: lines.reduce((n, l) => n + l.qty * l.unit_cost, 0), partyId: receipt.supplier_party_id, doc: receipt };
}

function refreshInvoiceStatus(db, invoiceId, actor) {
  const docs = createDocumentRepository(db);
  const doc = docs.getById(invoiceId);
  const allocated = createAllocationRepository(db).allocatedTo('sales_invoice', invoiceId);
  const want = allocated >= doc.grandTotal ? 'paid' : allocated > 0 ? 'partially_paid' : 'posted';
  if (want === doc.status) return doc;
  assertTransition('sales_invoice', doc.status, want);
  const updated = docs.setStatus(invoiceId, want);
  createAuditRepository(db).append({ actor, operation: 'payment.apply', entityType: 'document', entityId: invoiceId, details: `allocated=${allocated}/${doc.grandTotal}`, before: `status=${doc.status}`, after: `status=${want}`, referenceNo: doc.docNo });
  return updated;
}

function recordPayment(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'payments.record');
  // Idempotency
  if (raw.operationKey) {
    const claim = tryClaimOperationKey(db, 'record_payment', raw.operationKey);
    if (!claim.claimed) {
      const existing = claim.existing;
      throw new ConflictError(`duplicate record_payment operation: key already used at ${existing.created_at} for entity ${existing.entity_id}`);
    }
  }
  const direction = validateDirection(raw.direction);
  const method = validateMethod(raw.method);
  const amount = validatePaymentAmount(raw.amount);
  const paymentDate = validatePaymentDate(raw.paymentDate ?? raw.payment_date) || todayDateString();
  const allocations = Array.isArray(raw.allocations) ? raw.allocations : [];
  return withTransaction(db, () => {
    const party = resolveParty(db, raw, direction);
    const account = resolveCashAccount(db, raw, method);
    const payments = createPaymentRepository(db);
    const allocs = createAllocationRepository(db);
    const seen = new Set();
    let allocatedSum = 0;
    const checked = [];
    for (const [i, a] of allocations.entries()) {
      if (!a || typeof a !== 'object') throw new ValidationError(`allocation ${i + 1}: invalid`);
      const targetType = validateAllocationTarget(a.targetType ?? a.target_type);
      const targetId = a.targetId ?? a.target_id;
      if (!Number.isInteger(targetId)) throw new ValidationError(`allocation ${i + 1}: target id required`);
      const key = `${targetType}:${targetId}`;
      if (seen.has(key)) throw new ValidationError(`allocation ${i + 1}: duplicate target`);
      seen.add(key);
      const allocAmount = a.amount;
      if (typeof allocAmount === 'string' || !Number.isInteger(allocAmount) || allocAmount <= 0) {
        throw new ValidationError(`allocation ${i + 1}: amount must be a positive integer`);
      }
      assertMinorUnits(allocAmount);
      const { total, partyId } = targetTotal(db, targetType, targetId);
      if (partyId !== party.id) throw new ValidationError(`allocation ${i + 1}: target belongs to another party`);
      const already = allocs.allocatedTo(targetType, targetId);
      if (already + allocAmount > total) {
        throw new StateError(`allocation ${i + 1}: only ${total - already} remaining on target`);
      }
      allocatedSum += allocAmount;
      checked.push({ targetType, targetId, amount: allocAmount });
    }
    if (allocatedSum > amount) throw new StateError(`allocations (${allocatedSum}) exceed payment (${amount})`);
    let payment;
    try {
      payment = payments.insert({
        paymentNo: buildPaymentNo(payments, raw.paymentNo ?? raw.payment_no),
        direction, partyId: party.id, cashAccountId: account ? account.id : null,
        method, amount, paymentDate,
      });
    } catch (err) {
      if (err && /UNIQUE constraint failed/i.test(err.message || '')) {
        throw new ConflictError('duplicate payment number (duplicate submission?)');
      }
      throw err;
    }
    for (const c of checked) allocs.add({ paymentId: payment.id, ...c });
    if (account) {
      const session = createCashSessionRepository(db).openOfAccount(account.id);
      createCashTransactionRepository(db).insert({
        cashAccountId: account.id, sessionId: session ? session.id : null,
        paymentId: payment.id, direction, amount, reason: `payment ${payment.payment_no}`,
      });
    }
    const touchedInvoices = new Set(checked.filter((c) => c.targetType === 'sales_invoice').map((c) => c.targetId));
    for (const invoiceId of touchedInvoices) refreshInvoiceStatus(db, invoiceId, auth.actor);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'payment.record', entityType: 'payment', entityId: payment.id, details: `${direction} ${amount} to ${party.code} allocated=${allocatedSum}`, referenceNo: payment.payment_no });
    return getPayment(db, payment.id);
  });
}

function getPayment(db, id) {
  const payment = createPaymentRepository(db).getById(id);
  return { ...payment, allocations: createAllocationRepository(db).ofPayment(id) };
}

function listPayments(db, opts) {
  return createPaymentRepository(db).list(opts);
}

// Reversal removes allocation LINKS (derived data), compensates the cash leg,
// and cancels the row — the payment itself is never deleted or edited.
function reversePayment(db, paymentId, reason = '', actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'payments.reverse');
  const why = cleanText(reason);
  if (!why) throw new ValidationError('a reversal reason is required');
  return withTransaction(db, () => {
    const payments = createPaymentRepository(db);
    const allocs = createAllocationRepository(db);
    const payment = payments.getById(paymentId);
    if (payment.status !== 'posted') throw new StateError(`payment ${payment.payment_no} is already cancelled`);
    const touchedInvoices = allocs.ofPayment(paymentId).filter((a) => a.target_type === 'sales_invoice').map((a) => a.target_id);
    allocs.removeOfPayment(paymentId);
    payments.markCancelled(paymentId, why.slice(0, 1000));
    if (payment.cash_account_id) {
      const session = createCashSessionRepository(db).openOfAccount(payment.cash_account_id);
      createCashTransactionRepository(db).insert({
        cashAccountId: payment.cash_account_id, sessionId: session ? session.id : null,
        paymentId, direction: payment.direction === 'in' ? 'out' : 'in',
        amount: payment.amount, reason: `reversal of ${payment.payment_no}`,
      });
    }
    for (const invoiceId of new Set(touchedInvoices)) refreshInvoiceStatus(db, invoiceId, auth.actor);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'payment.reverse', entityType: 'payment', entityId: paymentId, details: `reversed ${payment.payment_no}`, reason: why.slice(0, 1000), referenceNo: payment.payment_no });
    return getPayment(db, paymentId);
  });
}

function createCashAccount(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'cash.manage');
  const code = validateAccountCode(raw.code);
  const name = cleanText(raw.name ?? '');
  if (!name) throw new ValidationError('cash account name is required');
  const opening = raw.openingBalance ?? raw.opening_balance ?? 0;
  if (typeof opening === 'string' || !Number.isInteger(opening) || opening < 0) {
    throw new ValidationError('opening balance must be a non-negative integer');
  }
  assertMinorUnits(opening);
  return withTransaction(db, () => {
    const created = createCashAccountRepository(db).insert({ code, name: name.slice(0, 100), openingBalance: opening });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'cash.account_create', entityType: 'cash_account', entityId: created.id, details: `code=${code}`, referenceNo: code });
    return created;
  });
}

function listCashAccounts(db) {
  const accounts = createCashAccountRepository(db);
  return accounts.list().map((a) => ({ ...a, balance: accounts.balanceOf(a.id) }));
}

function openCashSession(db, accountId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'cash.manage');
  return withTransaction(db, () => {
    const accounts = createCashAccountRepository(db);
    const sessions = createCashSessionRepository(db);
    const account = accounts.getById(accountId);
    if (!account.is_active) throw new StateError(`cash account ${account.code} is inactive`);
    if (sessions.openOfAccount(accountId)) throw new ConflictError(`cash account ${account.code} already has an open session`);
    const opening = raw.openingAmount ?? raw.opening_amount ?? accounts.balanceOf(accountId);
    if (typeof opening === 'string' || !Number.isInteger(opening) || opening < 0) {
      throw new ValidationError('opening amount must be a non-negative integer');
    }
    const session = sessions.open({ cashAccountId: accountId, openingAmount: opening });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'cash.session_open', entityType: 'cash_session', entityId: session.id, details: `account=${account.code} opening=${opening}`, referenceNo: account.code });
    return session;
  });
}

function closeCashSession(db, sessionId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'cash.manage');
  const counted = raw.countedAmount ?? raw.counted_amount;
  if (typeof counted === 'string' || !Number.isInteger(counted) || counted < 0) {
    throw new ValidationError('counted amount must be a non-negative integer');
  }
  return withTransaction(db, () => {
    const sessions = createCashSessionRepository(db);
    sessions.close(sessionId, counted);
    const report = sessions.report(sessionId);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'cash.session_close', entityType: 'cash_session', entityId: sessionId, details: `expected=${report.expected} counted=${counted} discrepancy=${report.discrepancy}` });
    return report;
  });
}

function sessionReport(db, sessionId) {
  return createCashSessionRepository(db).report(sessionId);
}

function getPartyBalance(db, partyId) {
  createPartyRepository(db).getById(partyId);
  const base = createPartyBalanceRepository(db).balanceOf(partyId);
  const paidInvoices = createAllocationRepository(db).allocatedForPartyInvoices(partyId);
  const paidReceipts = createAllocationRepository(db).allocatedForPartyReceipts(partyId);
  const receivable = base.receivable - paidInvoices;
  const payable = Math.max(0, base.payable - paidReceipts);
  return { receivable, payable, allocatedIn: paidInvoices, allocatedOut: paidReceipts, net: receivable - payable };
}

module.exports = {
  recordPayment,
  getPayment,
  listPayments,
  reversePayment,
  createCashAccount,
  listCashAccounts,
  openCashSession,
  closeCashSession,
  sessionReport,
  getPartyBalance,
};
