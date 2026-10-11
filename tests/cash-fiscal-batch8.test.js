'use strict';
// Batch 8 gate: cash detail, expenses, debts, fiscal read-only.
// No invented accounting; tax totals stay server-computed; gaps recorded.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTestApp, closeTestApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');

describe('batch8 cash/expenses/fiscal contract', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('expense categories + expense + reverse + report round-trip', () => {
    t.app.commands.createCashAccount({ code: 'TILL', name: 'Till' });
    const cat = t.app.commands.createExpenseCategory({ code: 'B8X', name: 'B8' });
    assert.equal(cat.code, 'B8X');
    const x = t.app.commands.createExpense({ categoryCode: 'B8X', amount: 500, method: 'cash', cashAccountCode: 'TILL', notes: 'b8' });
    assert.equal(x.amount, 500);
    assert.equal(t.app.queries.getExpense(x.id).expense_no, x.expense_no);
    const rep = t.app.queries.expenseReport({});
    assert.ok(rep.total >= 500);
    assert.throws(() => t.app.commands.reverseExpense(x.id, ''), (e) => e.code === 'VALIDATION');
    const rev = t.app.commands.reverseExpense(x.id, 'duplicate');
    assert.ok(rev.status === 'cancelled' || rev.status === 'reversed');
    assert.throws(() => t.app.commands.deleteExpenseCategory(cat.id), (e) => e.code === 'CONFLICT');
  });

  it('cash sessions open/close/report with discrepancy math from server', () => {
    const a = t.app.commands.createCashAccount({ code: 'TILL', name: 'Till' });
    const s = t.app.commands.openCashSession(a.id, { openingAmount: 1000 });
    assert.ok(s.id);
    assert.throws(() => t.app.commands.openCashSession(a.id, {}), (e) => e.code === 'CONFLICT');
    const r = t.app.commands.closeCashSession(s.id, { countedAmount: 900 });
    assert.equal(r.discrepancy, -100);
    assert.ok(t.app.queries.sessionReport(s.id).expected !== undefined);
  });

  it('fiscal years open once, close guards, events read-only', () => {
    const fy = t.app.commands.openFiscalYear({ code: 'FY26', name: 'FY', startDate: '2026-01-01', endDate: '2026-12-31' });
    assert.equal(fy.status, 'open');
    assert.throws(() => t.app.commands.openFiscalYear({ code: 'FY27', name: 'FY', startDate: '2027-01-01', endDate: '2027-12-31' }), (e) => e.code === 'INVALID_STATE');
    assert.ok(Array.isArray(t.app.queries.listFiscalYears({})));
    assert.ok(Array.isArray(t.app.queries.listAccountingEvents(fy.id, {})));
    const closed = t.app.commands.closeFiscalYear(fy.id);
    assert.equal(closed.status, 'closed');
  });

  it('frontend wires cash/expense/fiscal honestly and states tax gaps', () => {
    const must = [
      'api.openCashSession', 'api.closeCashSession', 'api.sessionReport',
      'api.listExpenseCategories', 'api.createExpenseCategory', 'api.deleteExpenseCategory',
      'api.getExpense', 'api.reverseExpense', 'api.expenseReport',
      'api.partyBalance',
      'api.openFiscalYear', 'api.closeFiscalYear', 'api.listFiscalYears',
      'api.listAccountingEvents', 'api.getAccountingEvent', 'api.getJournalLines',
    ];
    for (const m of must) assert.ok(FRONT.includes(m), `frontend must use ${m}`);
    assert.ok(!/updateExpense|updateCashAccount|setTaxRate|stampDuty/i.test(FRONT), 'no invented config methods');
    assert.ok(/no .*TVA|no TVA|tax.*server|server-computed/i.test(FRONT), 'tax gap stated, no UI tax math');
  });

  it('renderer stays display-only after batch 8', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
  });
});
