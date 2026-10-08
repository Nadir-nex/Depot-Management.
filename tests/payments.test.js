'use strict';
// Phase 16 gate: payments apply once, allocations never exceed, reversals
// undo atomically, cash sessions reconcile, balances tie out end to end.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

const CASHIER = { actor: 'c', grants: ['payments.record', 'payments.reverse', 'cash.manage'] };
const RECORDER = { actor: 'r', grants: ['payments.record'] };
const SALES = { actor: 's', grants: ['sales.create', 'sales.post', 'sales.cancel', 'deliveries.create', 'deliveries.complete'] };

describe('payments', () => {
  let t, p, customer, supplier, till;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'M-1', name: 'M' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 100, unitCost: 10 }] });
    customer = t.app.commands.createParty({ displayName: 'Client', roles: ['customer'] });
    supplier = t.app.commands.createParty({ displayName: 'Grossiste', roles: ['supplier'] });
    till = t.app.commands.createCashAccount({ code: 'TILL', name: 'Main till' }, CASHIER);
  });
  afterEach(() => { closeTestApp(t); });

  function postedInvoice(qty = 10, price = 100) {
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: p.id, qty, unitPrice: price }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(dn.id, SALES);
    t.app.commands.postDeliveryNote(dn.id, { actor: SALES });
    const inv = t.app.commands.convertDeliveriesToInvoice([dn.id], { actor: SALES });
    t.app.commands.confirmDocument(inv.id, SALES);
    return t.app.commands.postInvoice(inv.id, SALES);
  }

  function pay(args, auth = CASHIER) {
    return t.app.commands.recordPayment({ direction: 'in', partyId: customer.id, method: 'cash', cashAccountId: till.id, ...args }, auth);
  }

  it('pays in full and marks the invoice paid exactly once', () => {
    const inv = postedInvoice();
    const pay1 = pay({ amount: 1000, allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 1000 }] });
    assert.ok(/^PAY-\d{8}-\d{4}$/.test(pay1.payment_no));
    assert.equal(t.app.queries.getDocument(inv.id).status, 'paid');
    assert.deepEqual(t.app.queries.partyBalance(customer.id), { receivable: 0, payable: 0, allocatedIn: 1000, allocatedOut: 0, net: 0 });
    assert.equal(t.app.queries.listCashAccounts().find((a) => a.code === 'TILL').balance, 1000);
    assert.throws(() => pay({ amount: 100, allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 100 }] }), (e) => e.code === 'INVALID_STATE');
  });

  it('splits partial and multi-invoice allocations with remainder on-account', () => {
    const a = postedInvoice(10, 100); // 1000
    const b = postedInvoice(5, 100); // 500
    const pay1 = pay({ amount: 1200, allocations: [
      { targetType: 'sales_invoice', targetId: a.id, amount: 1000 },
      { targetType: 'sales_invoice', targetId: b.id, amount: 100 },
    ] });
    assert.equal(t.app.queries.getDocument(a.id).status, 'paid');
    assert.equal(t.app.queries.getDocument(b.id).status, 'partially_paid');
    assert.equal(t.app.queries.partyBalance(customer.id).receivable, 400);
    const unallocated = pay({ amount: 300 }); // on-account: no allocations at all
    assert.equal(t.app.queries.getPayment(unallocated.id).allocations.length, 0);
    assert.equal(t.app.queries.partyBalance(customer.id).receivable, 400); // on-account touches no invoice
    assert.throws(() => pay({ amount: 100, allocations: [{ targetType: 'sales_invoice', targetId: b.id, amount: 500 }] }), (e) => e.code === 'INVALID_STATE'); // only 400 left
    assert.throws(() => pay({ amount: 50, allocations: [{ targetType: 'sales_invoice', targetId: b.id, amount: 60 }] }), (e) => e.code === 'INVALID_STATE'); // exceeds payment
    void pay1;
  });

  it('reverses atomically: links gone, cash compensated, statuses revert', () => {
    const inv = postedInvoice();
    const pay1 = pay({ amount: 1000, allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 1000 }] });
    assert.throws(() => t.app.commands.reversePayment(pay1.id, '', CASHIER), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.reversePayment(pay1.id, 'void', RECORDER), (e) => e.code === 'FORBIDDEN');
    const rev = t.app.commands.reversePayment(pay1.id, 'wrong customer', CASHIER);
    assert.equal(rev.status, 'cancelled');
    assert.equal(t.app.queries.getPayment(pay1.id).allocations.length, 0);
    assert.equal(t.app.queries.getDocument(inv.id).status, 'posted'); // back to open
    assert.equal(t.app.queries.partyBalance(customer.id).receivable, 1000);
    assert.equal(t.app.queries.listCashAccounts().find((a) => a.code === 'TILL').balance, 0); // compensated
    assert.throws(() => t.app.commands.reversePayment(pay1.id, 'again', CASHIER), (e) => e.code === 'INVALID_STATE');
    const audit = t.app.queries.recentAudit({ limit: 5 });
    assert.ok(audit.some((a) => a.operation === 'payment.reverse' && a.reason === 'wrong customer'));
  });

  it('rejects duplicates, mismatches and bad money', () => {
    const inv = postedInvoice();
    pay({ paymentNo: 'PAY-X-1', amount: 100, allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 100 }] });
    assert.throws(() => pay({ paymentNo: 'PAY-X-1', amount: 100 }), (e) => e.code === 'CONFLICT');
    assert.throws(() => pay({ amount: 100, allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 100 }] }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => pay({ direction: 'sideways', amount: 10 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => pay({ amount: -5 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => pay({ amount: 10, method: 'barter' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => pay({ amount: 10, method: 'bank_transfer', cashAccountId: till.id }), (e) => e.code === 'VALIDATION');
    assert.throws(() => pay({ amount: 10, method: 'cash', cashAccountId: null }), (e) => e.code === 'VALIDATION'); // cash needs an account
    assert.throws(() => pay({ amount: 10, allocations: [{ targetType: 'sales_invoice', targetId: 99999, amount: 10 }] }), (e) => e.code === 'NOT_FOUND');
    const other = t.app.commands.createParty({ displayName: 'Other', roles: ['customer'] });
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: other.id, lines: [{ productId: p.id, qty: 1, unitPrice: 10 }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    const posted = t.app.commands.postDocument(o.id, SALES);
    assert.throws(() => pay({ amount: 10, allocations: [{ targetType: 'sales_invoice', targetId: posted.id, amount: 10 }] }), (e) => e.code === 'VALIDATION'); // not an invoice
  });

  it('pays suppliers against receipts and blocks over-allocation', () => {
    const r = t.app.commands.receiveStock({ supplierPartyId: supplier.id, lines: [{ productId: p.id, qty: 10, unitCost: 20 }] });
    const pay1 = t.app.commands.recordPayment({ direction: 'out', partyId: supplier.id, method: 'bank_transfer', amount: 200, allocations: [{ targetType: 'purchase_receipt', targetId: r.id, amount: 200 }] }, CASHIER);
    assert.equal(t.app.queries.partyBalance(supplier.id).payable, 0);
    assert.equal(t.app.queries.partyBalance(supplier.id).allocatedOut, 200);
    assert.throws(() => t.app.commands.recordPayment({ direction: 'out', partyId: supplier.id, method: 'bank_transfer', amount: 50, allocations: [{ targetType: 'purchase_receipt', targetId: r.id, amount: 50 }] }, CASHIER), (e) => e.code === 'INVALID_STATE');
    t.app.commands.reversePayment(pay1.id, 'duplicate', CASHIER);
    assert.equal(t.app.queries.partyBalance(supplier.id).payable, 200);
    // direction/role mismatch both ways
    assert.throws(() => t.app.commands.recordPayment({ direction: 'in', partyId: supplier.id, method: 'cash', cashAccountId: till.id, amount: 10 }, CASHIER), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.recordPayment({ direction: 'out', partyId: customer.id, method: 'cash', cashAccountId: till.id, amount: 10 }, CASHIER), (e) => e.code === 'INVALID_STATE');
  });

  it('blocks cancelling invoices with live payments', () => {
    const inv = postedInvoice();
    pay({ amount: 100, allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 100 }] });
    assert.equal(t.app.queries.getDocument(inv.id).status, 'partially_paid');
    assert.throws(() => t.app.commands.cancelDocument(inv.id, 'oops', SALES), (e) => e.code === 'INVALID_STATE');
    const pay1 = t.app.queries.listPayments({}).find((x) => x.status === 'posted');
    t.app.commands.reversePayment(pay1.id, 'void', CASHIER);
    t.app.commands.cancelDocument(inv.id, 'billed wrong customer', SALES); // clean again: cancellable
    assert.equal(t.app.queries.getDocument(inv.id).status, 'cancelled');
  });

  it('runs cash sessions with reconciliation and discrepancy reports', () => {
    assert.throws(() => t.app.commands.createCashAccount({ code: 'TILL', name: 'dup' }, CASHIER), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createCashAccount({ code: 'X', name: 'x' }, RECORDER), (e) => e.code === 'FORBIDDEN');
    const s1 = t.app.commands.openCashSession(till.id, {}, CASHIER);
    assert.equal(s1.opening_amount, 0);
    assert.throws(() => t.app.commands.openCashSession(till.id, {}, CASHIER), (e) => e.code === 'CONFLICT');
    const inv = postedInvoice();
    pay({ amount: 700, allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 700 }] });
    const rep = t.app.commands.closeCashSession(s1.id, { countedAmount: 690 }, CASHIER);
    assert.equal(rep.expected, 700);
    assert.equal(rep.discrepancy, -10); // the discrepancy report: short 10
    assert.throws(() => t.app.commands.closeCashSession(s1.id, { countedAmount: 0 }, CASHIER), (e) => e.code === 'INVALID_STATE');
    const s2 = t.app.commands.openCashSession(till.id, {}, CASHIER);
    assert.equal(s2.opening_amount, 700); // opens at the live till balance
    const rep2 = t.app.commands.closeCashSession(s2.id, { countedAmount: 700 }, CASHIER);
    assert.equal(rep2.discrepancy, 0);
    assert.equal(t.app.queries.sessionReport(s2.id).transactionCount, 0);
  });
});
