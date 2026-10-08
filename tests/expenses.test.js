'use strict';
// Phase 17 gate: categorized expenses with exact cash legs and reversals.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makeTestApp, closeTestApp } = require('./helpers');

const CASH = { actor: 'c', grants: ['cash.manage'] };

describe('expenses', () => {
  let t, till;
  beforeEach(() => {
    t = makeTestApp();
    till = t.app.commands.createCashAccount({ code: 'TILL', name: 'Till' }, CASH);
  });
  afterEach(() => { closeTestApp(t); });

  function tillBalance() {
    return t.app.queries.listCashAccounts().find((a) => a.code === 'TILL').balance;
  }

  it('records cash expenses against the till exactly', () => {
    assert.equal(tillBalance(), 0);
    const e = t.app.commands.createExpense({ categoryCode: 'fuel', amount: 5000, method: 'cash', cashAccountId: till.id, notes: 'diesel' }, CASH);
    assert.ok(/^EXP-\d{8}-\d{4}$/.test(e.expense_no));
    assert.equal(e.status, 'posted');
    assert.equal(tillBalance(), -5000);
    const txns = t.app.db.prepare("SELECT * FROM cash_transactions WHERE reason LIKE 'expense %'").all();
    assert.equal(txns.length, 1);
    assert.deepEqual([txns[0].direction, txns[0].amount], ['out', 5000]);
    assert.throws(() => t.app.commands.createExpense({ categoryCode: 'FUEL', amount: 10, method: 'cash' }, CASH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createExpense({ categoryCode: 'NOPE', amount: 10, method: 'cash', cashAccountId: till.id }, CASH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createExpense({ categoryCode: 'FUEL', amount: 0, method: 'cash', cashAccountId: till.id }, CASH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createExpense({ categoryCode: 'FUEL', amount: -5, method: 'cash', cashAccountId: till.id }, CASH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createExpense({ categoryCode: 'FUEL', amount: 9.99, method: 'cash', cashAccountId: till.id }, CASH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createExpense({ categoryCode: 'FUEL', amount: 10, method: 'bank_transfer', cashAccountId: till.id }, CASH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createExpense({ categoryCode: 'FUEL', amount: 10, method: 'cash', cashAccountId: till.id }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
  });

  it('records non-cash expenses without moving the till', () => {
    t.app.commands.createExpense({ categoryCode: 'RENT', amount: 20000, method: 'bank_transfer', reference: 'VIR-11' }, CASH);
    assert.equal(tillBalance(), 0);
    assert.equal(t.app.db.prepare('SELECT COUNT(*) n FROM cash_transactions').get().n, 0);
    const report = t.app.queries.expenseReport({});
    assert.deepEqual(report.rows.map((r) => [r.category, r.total]), [['RENT', 20000]]);
    assert.equal(report.total, 20000);
  });

  it('links parties and manages categories', () => {
    const s = t.app.commands.createParty({ displayName: 'Landlord', roles: ['supplier'] });
    const e = t.app.commands.createExpense({ categoryCode: 'RENT', amount: 1000, method: 'cash', cashAccountId: till.id, partyId: s.id }, CASH);
    assert.equal(t.app.queries.getExpense(e.id).party_id, s.id);
    assert.throws(() => t.app.commands.createExpense({ categoryCode: 'RENT', amount: 1000, method: 'cash', cashAccountId: till.id, partyId: 99999 }, CASH), (e) => e.code === 'NOT_FOUND');
    const cat = t.app.commands.createExpenseCategory({ code: 'travel', name: 'Travel' }, CASH);
    assert.equal(cat.code, 'TRAVEL');
    assert.throws(() => t.app.commands.createExpenseCategory({ code: 'FUEL', name: 'dup' }, CASH), (e) => e.code === 'CONFLICT');
    t.app.commands.createExpense({ categoryCode: 'TRAVEL', amount: 100, method: 'cash', cashAccountId: till.id }, CASH);
    assert.throws(() => t.app.commands.deleteExpenseCategory(cat.id, CASH), (e) => e.code === 'CONFLICT');
    const empty = t.app.commands.createExpenseCategory({ code: 'EMPTY', name: 'Empty' }, CASH);
    assert.equal(t.app.commands.deleteExpenseCategory(empty.id, CASH), true);
  });

  it('reverses with compensation instead of deleting', () => {
    const e = t.app.commands.createExpense({ categoryCode: 'FUEL', amount: 3000, method: 'cash', cashAccountId: till.id }, CASH);
    assert.throws(() => t.app.commands.reverseExpense(e.id, '', CASH), (e) => e.code === 'VALIDATION');
    const rev = t.app.commands.reverseExpense(e.id, 'duplicate entry', CASH);
    assert.equal(rev.status, 'cancelled');
    assert.equal(tillBalance(), 0); // compensated exactly
    assert.equal(t.app.queries.getExpense(e.id).status, 'cancelled'); // row stays queryable
    assert.throws(() => t.app.commands.reverseExpense(e.id, 'again', CASH), (e) => e.code === 'INVALID_STATE');
    const nc = t.app.commands.createExpense({ categoryCode: 'RENT', amount: 7000, method: 'bank_transfer' }, CASH);
    t.app.commands.reverseExpense(nc.id, 'void', CASH);
    assert.equal(t.app.queries.getExpense(nc.id).status, 'cancelled');
    const audit = t.app.queries.recentAudit({ limit: 5 });
    assert.ok(audit.some((a) => a.operation === 'expense.reverse' && a.reason === 'duplicate entry'));
  });

  it('never touches stock from the expense paths', () => {
    const files = ['expenses.js'];
    for (const f of files) {
      const src = fs.readFileSync(`src/application/${f}`, 'utf8');
      assert.ok(!/stock_movements/i.test(src), `${f} must not reference the stock ledger`);
      assert.ok(!/stock\.insertMovement|createStockRepository/i.test(src), `${f} must not move stock`);
    }
    const p = t.app.commands.createProduct({ sku: 'E-1', name: 'E' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 5 }] });
    t.app.commands.createExpense({ categoryCode: 'FUEL', amount: 100, method: 'cash', cashAccountId: till.id }, CASH);
    t.app.commands.reverseExpense(t.app.queries.listExpenses({})[0].id, 'x', CASH);
    assert.equal(t.app.queries.getStock(p.id, 1), 5);
  });
});
