'use strict';
// Fiscal year / accounting event application layer (Phase 25).
// Generates accounting events from operational transactions.

const { ConflictError, NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { validateFyCode, validateFyDates, validateStatus, ACCT_EVENT_TYPES, SOURCE_TYPES, JOURNAL_CODES } = require('../domain/fiscal');
const {
  createFiscalYearRepository,
  createJournalRepository,
  createAccountingEventRepository,
  createJournalLineRepository,
  createChargeCategoryRepository,
  createFiscalClassificationRepository,
} = require('../data/fiscalRepository');
const { createDocumentRepository, createDocumentLineRepository } = require('../data/documentRepository');
const { createPartyRepository } = require('../data/partyRepository');
const { createWarehouseRepository } = require('../data/stockRepository');
const { createPaymentRepository, createAllocationRepository, createCashAccountRepository } = require('../data/paymentRepository');
const { createExpenseRepository } = require('../data/expenseRepository');
const { createStockRepository } = require('../data/stockRepository');
const { withTransaction, utcNowIso } = require('../db');

function cleanText(v) { return typeof v === 'string' ? v.trim() : ''; }

function getOpenFiscalYear(db) {
  const fy = createFiscalYearRepository(db).getOpen();
  if (!fy) throw new StateError('no open fiscal year: cannot post');
  return fy;
}

function requireOpenPeriod(db, docDate) {
  const fyRepo = createFiscalYearRepository(db);
  const anyFy = fyRepo.list({ limit: 1 });
  if (anyFy.length === 0) return; // no fiscal years configured yet: allow (pre-fiscal-mode)
  if (!fyRepo.isDateInOpenFy(docDate)) {
    throw new StateError(`date ${docDate} not in any open fiscal year`);
  }
}

// Simple chart of accounts mapping (extensible)
const ACCOUNT_MAP = Object.freeze({
  // Sales
  sales_revenue: { code: '701', name: 'Sales Revenue' },
  sales_tax_collected: { code: '4457', name: 'VAT Collected' },
  // Receivables
  customer_receivable: { code: '411', name: 'Customer Receivables' },
  // Purchases
  purchase_expense: { code: '601', name: 'Purchases' },
  purchase_tax_deductible: { code: '4456', name: 'VAT Deductible' },
  supplier_payable: { code: '401', name: 'Supplier Payables' },
  // Cash
  cash_account: { code: '53', name: 'Cash' },
  bank_account: { code: '512', name: 'Bank' },
  // Stock
  stock_variation: { code: '603', name: 'Stock Variation' },
  inventory: { code: '3', name: 'Inventory' },
  // Expenses
  expense_general: { code: '6', name: 'Expenses' },
});

function journalCodeForEventType(eventType) {
  if (eventType.startsWith('sales')) return JOURNAL_CODES.SALES;
  if (eventType.startsWith('purchase')) return JOURNAL_CODES.PURCHASES;
  if (eventType.startsWith('cash')) return JOURNAL_CODES.CASH;
  if (eventType === 'stock_movement') return JOURNAL_CODES.STOCK;
  return JOURNAL_CODES.GENERAL;
}

function createAccountingEventFromSalesInvoice(db, doc, lines, actor) {
  const fy = getOpenFiscalYear(db);
  requireOpenPeriod(db, doc.docDate);
  const journalCode = journalCodeForEventType('sales_invoice_posted');
  const journal = createJournalRepository(db).getByCode(journalCode);

  // Build lines: DR Receivable, CR Revenue + VAT
  const eventLines = [];
  let lineNo = 0;
  let totalDebit = 0, totalCredit = 0;

  // Receivable (DR)
  if (doc.grandTotal > 0) {
    lineNo++;
    eventLines.push({ lineNo, ...ACCOUNT_MAP.customer_receivable, debit: doc.grandTotal, credit: 0 });
    totalDebit += doc.grandTotal;
  }
  // Revenue (CR)
  if (doc.subtotal > 0) {
    lineNo++;
    eventLines.push({ lineNo, ...ACCOUNT_MAP.sales_revenue, debit: 0, credit: doc.subtotal });
    totalCredit += doc.subtotal;
  }
  // VAT (CR)
  if (doc.taxTotal > 0) {
    lineNo++;
    eventLines.push({ lineNo, ...ACCOUNT_MAP.sales_tax_collected, debit: 0, credit: doc.taxTotal });
    totalCredit += doc.taxTotal;
  }
  // Discount (DR if any - reduces revenue)
  if (doc.discountTotal > 0) {
    lineNo++;
    eventLines.push({ lineNo, ...ACCOUNT_MAP.sales_revenue, debit: doc.discountTotal, credit: 0 });
    totalDebit += doc.discountTotal;
  }

  return withTransaction(db, () => {
    const evRepo = createAccountingEventRepository(db);
    const lineRepo = createJournalLineRepository(db);
    const ev = evRepo.insert({
      fiscalYearId: fy.id, journalId: journal.id,
      eventDate: doc.docDate, eventType: 'sales_invoice_posted',
      sourceType: 'document', sourceId: doc.id,
      description: `Sales invoice ${doc.docNo}`,
      totalDebit, totalCredit, createdBy: actor,
    });
    for (const l of eventLines) {
      lineRepo.insert({ accountingEventId: ev.id, lineNo: l.lineNo,
        accountCode: l.code, accountName: l.name, debit: l.debit, credit: l.credit });
    }
    return ev;
  });
}

function createAccountingEventFromCashReceipt(db, payment, allocation, actor) {
  const fy = getOpenFiscalYear(db);
  requireOpenPeriod(db, payment.paymentDate);
  const journal = createJournalRepository(db).getByCode(JOURNAL_CODES.CASH);

  const eventLines = [];
  let lineNo = 0;
  let totalDebit = 0, totalCredit = 0;

  // Cash/Bank (DR)
  lineNo++;
  const cashAcc = payment.cashAccountId ? createCashAccountRepository(db).getAccountName(payment.cashAccountId) : ACCOUNT_MAP.cash_account;
  eventLines.push({ lineNo, ...cashAcc, debit: payment.amount, credit: 0 });
  totalDebit += payment.amount;

  // Receivable (CR) - if allocated
  if (allocation && allocation.amount > 0) {
    lineNo++;
    eventLines.push({ lineNo, ...ACCOUNT_MAP.customer_receivable, debit: 0, credit: allocation.amount });
    totalCredit += allocation.amount;
  } else {
    // Unallocated receipt - CR Suspense or Revenue
    lineNo++;
    eventLines.push({ lineNo, ...ACCOUNT_MAP.sales_revenue, debit: 0, credit: payment.amount });
    totalCredit += payment.amount;
  }

  return withTransaction(db, () => {
    const evRepo = createAccountingEventRepository(db);
    const lineRepo = createJournalLineRepository(db);
    const ev = evRepo.insert({
      fiscalYearId: fy.id, journalId: journal.id,
      eventDate: payment.paymentDate, eventType: 'cash_receipt',
      sourceType: 'payment_allocation', sourceId: allocation?.id || payment.id,
      description: `Cash receipt ${payment.referenceNo || payment.id}`,
      totalDebit, totalCredit, createdBy: actor,
    });
    for (const l of eventLines) {
      lineRepo.insert({ accountingEventId: ev.id, lineNo: l.lineNo,
        accountCode: l.code, accountName: l.name, debit: l.debit, credit: l.credit });
    }
    return ev;
  });
}

function createAccountingEventFromExpense(db, expense, actor) {
  const fy = getOpenFiscalYear(db);
  requireOpenPeriod(db, expense.expenseDate);
  const journal = createJournalRepository(db).getByCode(JOURNAL_CODES.CASH);

  const eventLines = [];
  let lineNo = 0;
  let totalDebit = 0, totalCredit = 0;

  // Expense (DR)
  lineNo++;
  eventLines.push({ lineNo, ...ACCOUNT_MAP.expense_general, debit: expense.amount, credit: 0 });
  totalDebit += expense.amount;

  // Cash/Bank (CR)
  lineNo++;
  const cashAcc = expense.cashAccountId ? createCashAccountRepository(db).getAccountName(expense.cashAccountId) : ACCOUNT_MAP.cash_account;
  eventLines.push({ lineNo, ...cashAcc, debit: 0, credit: expense.amount });
  totalCredit += expense.amount;

  return withTransaction(db, () => {
    const evRepo = createAccountingEventRepository(db);
    const lineRepo = createJournalLineRepository(db);
    const ev = evRepo.insert({
      fiscalYearId: fy.id, journalId: journal.id,
      eventDate: expense.expenseDate, eventType: 'expense_recorded',
      sourceType: 'expense', sourceId: expense.id,
      description: `Expense ${expense.referenceNo || expense.id}`,
      totalDebit, totalCredit, createdBy: actor,
    });
    for (const l of eventLines) {
      lineRepo.insert({ accountingEventId: ev.id, lineNo: l.lineNo,
        accountCode: l.code, accountName: l.name, debit: l.debit, credit: l.credit });
    }
    return ev;
  });
}

// Hook: called from document.postDocument after posting
function generateAccountingEventsForPostedDocument(db, doc, actor) {
  if (!['sales_invoice', 'customer_return'].includes(doc.docType)) return null;
  // Only generate accounting events if fiscal years are configured
  const fyRepo = createFiscalYearRepository(db);
  if (fyRepo.list({ limit: 1 }).length === 0) return null;
  if (doc.docType === 'sales_invoice') return createAccountingEventFromSalesInvoice(db, doc, null, actor);
  return null;
}

// Public API
function openFiscalYear(db, { code, name, startDate, endDate }, actor) {
  const auth = requirePermission(normalizeAuth(actor), 'fiscal.manage');
  const c = validateFyCode(code);
  const { start, end } = validateFyDates(startDate, endDate);
  const existing = createFiscalYearRepository(db).getByCode(c);
  if (existing) throw new ConflictError(`fiscal year ${c} already exists`);
  const open = createFiscalYearRepository(db).getOpen();
  if (open) throw new StateError('an open fiscal year already exists; close it first');
  return withTransaction(db, () => {
    const fyRepo = createFiscalYearRepository(db);
    return fyRepo.insert({ code: c, name: cleanText(name).slice(0, 200), startDate: start, endDate: end });
  });
}

function closeFiscalYear(db, id, actor) {
  const auth = requirePermission(normalizeAuth(actor), 'fiscal.manage');
  const fyRepo = createFiscalYearRepository(db);
  const fy = fyRepo.getById(id);
  if (fy.status !== 'open') throw new StateError(`fiscal year ${fy.code} is not open`);
  return withTransaction(db, () => fyRepo.setStatus(id, 'closed', { closedBy: auth.actor }));
}

function listFiscalYears(db, { status = null } = {}) {
  return createFiscalYearRepository(db).list({ status });
}

function listAccountingEvents(db, fiscalYearId, opts) {
  return createAccountingEventRepository(db).listByFiscalYear(fiscalYearId, opts);
}

function getAccountingEvent(db, id) {
  return createAccountingEventRepository(db).getById(id);
}

function getJournalLines(db, accountingEventId) {
  return createJournalLineRepository(db).ofEvent(accountingEventId);
}

module.exports = {
  openFiscalYear,
  closeFiscalYear,
  listFiscalYears,
  listAccountingEvents,
  getAccountingEvent,
  getJournalLines,
  generateAccountingEventsForPostedDocument,
  createAccountingEventFromCashReceipt,
  createAccountingEventFromExpense,
  requireOpenPeriod,
  getOpenFiscalYear,
};
