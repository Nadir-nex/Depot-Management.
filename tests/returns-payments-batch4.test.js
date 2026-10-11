'use strict';
// Batch 4 gate: returns + payment allocation/reversal contract.
// Recording ≠ allocation ≠ settlement ≠ reversal; no fake balances.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTestApp, closeTestApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');

describe('batch4 returns/payments contract', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  function setup() {
    t.app.commands.createCashAccount({ code: 'TILL', name: 'Till' });
    const p = t.app.commands.createProduct({ sku: 'B4-P', name: 'b4' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 20 }] });
    const customer = t.app.commands.createParty({ displayName: 'B4C', roles: ['customer'] });
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: p.id, qty: 10, unitPrice: 100 }] });
    t.app.commands.confirmDocument(o.id);
    t.app.commands.postDocument(o.id);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN' });
    t.app.commands.confirmDocument(dn.id);
    const posted = t.app.commands.postDeliveryNote(dn.id, {});
    return { p, customer, posted };
  }

  it('customer return draft/posted split with reason + remaining guard', () => {
    const { posted } = setup();
    const ret = t.app.commands.createCustomerReturn(posted.id, { lines: [{ sourceLineId: posted.lines[0].id, qty: 4 }] });
    assert.equal(ret.status, 'draft');
    assert.ok(ret.docType === 'customer_return');
    t.app.commands.confirmDocument(ret.id);
    const out = t.app.commands.postCustomerReturn(ret.id, { reason: 'defective' });
    assert.equal(out.status, 'posted');
    assert.throws(() => t.app.commands.createCustomerReturn(posted.id, { lines: [{ sourceLineId: posted.lines[0].id, qty: 7 }] }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.postCustomerReturn(ret.id, { reason: 'defective' }), (e) => e.code === 'INVALID_STATE' || e.code === 'VALIDATION');
  });

  it('supplier return is a bounded ledger movement, not a document', () => {
    const p = t.app.commands.createProduct({ sku: 'B4-S', name: 's' });
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10 }] });
    const m = t.app.commands.returnToSupplier({ receiptId: r.id, productId: p.id, qty: 4, reason: 'defective' });
    assert.equal(m.movement_type, 'purchase_return');
    assert.throws(() => t.app.commands.returnToSupplier({ receiptId: r.id, productId: p.id, qty: 7, reason: 'damaged' }), (e) => e.code === 'INVALID_STATE');
  });

  it('payment allocation + reversal: links cleared, cash compensated, balances authoritative', () => {
    const { customer, posted } = setup();
    const inv = t.app.commands.convertDeliveriesToInvoice([posted.id], {});
    t.app.commands.confirmDocument(inv.id);
    t.app.commands.postInvoice(inv.id);
    const pay = t.app.commands.recordPayment({ direction: 'in', partyId: customer.id, method: 'cash', cashAccountCode: 'TILL', amount: 500, allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 500 }] });
    assert.equal(t.app.queries.getPayment(pay.id).allocations.length, 1);
    const bal1 = t.app.queries.partyBalance(customer.id);
    assert.ok(bal1.receivable < 1000);
    assert.throws(() => t.app.commands.reversePayment(pay.id, ''), (e) => e.code === 'VALIDATION');
    const rev = t.app.commands.reversePayment(pay.id, 'wrong customer');
    assert.equal(rev.status, 'cancelled');
    assert.equal(t.app.queries.getPayment(pay.id).allocations.length, 0);
    assert.throws(() => t.app.commands.reversePayment(pay.id, 'again'), (e) => e.code === 'INVALID_STATE');
    const bal2 = t.app.queries.partyBalance(customer.id);
    assert.ok(bal2.receivable >= bal1.receivable);
  });

  it('frontend separates record/allocate/settle/reverse and documents gaps', () => {
    const must = [
      'api.createCustomerReturn', 'api.postCustomerReturn', 'api.returnToSupplier',
      'api.recordPayment', 'api.reversePayment', 'api.getPayment', 'api.partyBalance',
      'onAccount', 'allocation',
    ];
    for (const m of must) assert.ok(FRONT.includes(m), `frontend must use ${m}`);
    assert.ok(FRONT.includes('postReturn'), 'return posting via reason flow');
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(FRONT), 'no renderer persistence');
  });

  it('renderer stays display-only after batch 4', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
  });
});
