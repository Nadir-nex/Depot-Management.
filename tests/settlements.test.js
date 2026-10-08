'use strict';
// Phase 21 gate: stop claims settle against posted payments, derive open/
// partial/settled, reconcile per route, and reverse exactly like payments.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

const DISPATCH = { actor: 'd', grants: ['deliveries.create', 'deliveries.complete'] };
const CASHIER = { actor: 'c', grants: ['payments.record', 'payments.reverse', 'cash.manage'] };
const SETTLER = { actor: 's', grants: ['payments.record'] };
const NOPE = { actor: 'n', grants: [] };
const SALES = { actor: 'sa', grants: ['sales.create', 'sales.post', 'sales.cancel', 'deliveries.create', 'deliveries.complete'] };

describe('settlements', () => {
  let t, p, c1, c2, till;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'ST-1', name: 'S' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 100, unitCost: 10 }] });
    c1 = t.app.commands.createParty({ displayName: 'Shop 1', roles: ['customer'] });
    c2 = t.app.commands.createParty({ displayName: 'Shop 2', roles: ['customer'] });
    till = t.app.commands.createCashAccount({ code: 'TILL', name: 'Main till' }, CASHIER);
  });
  afterEach(() => { closeTestApp(t); });

  let crewNo = 0;
  function dispatchedWithStop(customer, collected = null) {
    crewNo += 1;
    const drv = t.app.commands.createDriver({ code: `D${crewNo}`, name: 'K' }, DISPATCH);
    const veh = t.app.commands.createVehicle({ code: `V${crewNo}` }, DISPATCH);
    const r = t.app.commands.createRoute({}, DISPATCH);
    t.app.commands.assignRoute(r.id, { driverId: drv.id, vehicleId: veh.id }, DISPATCH);
    const stop = t.app.commands.addStop(r.id, { partyId: customer.id }, DISPATCH);
    t.app.commands.loadRoute(r.id, DISPATCH);
    t.app.commands.dispatchRoute(r.id, DISPATCH);
    if (collected !== null) t.app.commands.completeStop(stop.id, { collectedAmount: collected }, DISPATCH);
    return { routeId: r.id, stopId: stop.id };
  }

  function postedInvoice(customerId, qty = 10, price = 100) {
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customerId, lines: [{ productId: p.id, qty, unitPrice: price }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(dn.id, SALES);
    t.app.commands.postDeliveryNote(dn.id, { actor: SALES });
    const inv = t.app.commands.convertDeliveriesToInvoice([dn.id], { actor: SALES });
    t.app.commands.confirmDocument(inv.id, SALES);
    return t.app.commands.postInvoice(inv.id, SALES);
  }

  it('materializes the claim at delivery and reconciles per route', () => {
    const { routeId, stopId } = dispatchedWithStop(c1, 500);
    const s = t.app.queries.getStopSettlement(stopId);
    assert.equal(s.status, 'open');
    assert.equal(s.amount, 500);
    assert.equal(s.outstanding, 500);
    const rec = t.app.queries.routeReconciliation(routeId);
    assert.deepEqual({ claim: rec.claim, settled: rec.settled, outstanding: rec.outstanding }, { claim: 500, settled: 0, outstanding: 500 });
    assert.equal(rec.stops[0].stop_id, stopId);
    // no cash taken → no claim; pending stops cannot settle at all
    const plain = dispatchedWithStop(c2, 0);
    assert.throws(() => t.app.queries.getStopSettlement(plain.stopId), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.settleStop(plain.stopId, {}, CASHIER), (e) => e.code === 'INVALID_STATE');
    const pending = dispatchedWithStop(c2);
    assert.throws(() => t.app.commands.settleStop(pending.stopId, {}, CASHIER), (e) => e.code === 'INVALID_STATE');
  });

  it('settles with a fresh incoming cash payment and a live cash leg', () => {
    const { routeId, stopId } = dispatchedWithStop(c1, 500);
    const settled = t.app.commands.settleStop(stopId, { cashAccountId: till.id }, SETTLER);
    assert.equal(settled.status, 'settled');
    assert.equal(settled.outstanding, 0);
    assert.equal(settled.links.length, 1);
    assert.equal(settled.links[0].direction, 'in');
    assert.equal(t.app.queries.listCashAccounts().find((a) => a.code === 'TILL').balance, 500);
    const rec = t.app.queries.routeReconciliation(routeId);
    assert.deepEqual({ settled: rec.settled, outstanding: rec.outstanding }, { settled: 500, outstanding: 0 });
    assert.throws(() => t.app.commands.settleStop(stopId, { cashAccountId: till.id }, SETTLER), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.settleStop(stopId, {}, NOPE), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.settleStop(stopId, {}, NOPE), (e) => e.code === 'FORBIDDEN');
  });

  it('supports partial settlement down to the claim', () => {
    const { stopId } = dispatchedWithStop(c1, 500);
    const half = t.app.commands.settleStop(stopId, { cashAccountId: till.id, amount: 200 }, SETTLER);
    assert.equal(half.status, 'partial');
    assert.equal(half.outstanding, 300);
    assert.throws(() => t.app.commands.settleStop(stopId, { cashAccountId: till.id, amount: 400 }, SETTLER), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.settleStop(stopId, { cashAccountId: till.id, amount: 0 }, SETTLER), (e) => e.code === 'VALIDATION');
    const rest = t.app.commands.settleStop(stopId, { cashAccountId: till.id, amount: 300 }, SETTLER);
    assert.equal(rest.status, 'settled');
    assert.equal(t.app.queries.listCashAccounts().find((a) => a.code === 'TILL').balance, 500);
  });

  it('links an existing posted incoming payment with headroom guards', () => {
    const a = dispatchedWithStop(c1, 500);
    const b = dispatchedWithStop(c1, 300);
    const supplier = t.app.commands.createParty({ displayName: 'Sup', roles: ['supplier'] });
    const pay = t.app.commands.recordPayment({ direction: 'in', partyId: c1.id, method: 'bank_transfer', amount: 600 }, CASHIER);
    const outPay = t.app.commands.recordPayment({ direction: 'out', partyId: supplier.id, method: 'bank_transfer', amount: 100 }, CASHIER);
    const foreign = t.app.commands.recordPayment({ direction: 'in', partyId: c2.id, method: 'bank_transfer', amount: 900 }, CASHIER);
    assert.throws(() => t.app.commands.settleStop(a.stopId, { paymentId: pay.id, amount: 600 }, SETTLER), (e) => e.code === 'INVALID_STATE'); // claim headroom
    assert.throws(() => t.app.commands.settleStop(b.stopId, { paymentId: outPay.id, amount: 100 }, SETTLER), (e) => e.code === 'INVALID_STATE'); // direction
    assert.throws(() => t.app.commands.settleStop(b.stopId, { paymentId: foreign.id, amount: 100 }, SETTLER), (e) => e.code === 'VALIDATION'); // party
    assert.throws(() => t.app.commands.settleStop(b.stopId, { paymentId: 99999, amount: 100 }, SETTLER), (e) => e.code === 'NOT_FOUND');
    const linkedA = t.app.commands.settleStop(a.stopId, { paymentId: pay.id }, SETTLER);
    assert.equal(linkedA.status, 'settled');
    assert.throws(() => t.app.commands.settleStop(b.stopId, { paymentId: pay.id, amount: 200 }, SETTLER), (e) => e.code === 'INVALID_STATE'); // only 100 unlinked
    const linkedB = t.app.commands.settleStop(b.stopId, { paymentId: pay.id, amount: 100 }, SETTLER);
    assert.equal(linkedB.status, 'partial');
    assert.equal(linkedB.outstanding, 200);
    assert.equal(t.app.queries.listCashAccounts().find((x) => x.code === 'TILL').balance, 0); // bank transfer: no till money
  });

  it('reversal re-opens the claim exactly like the payment ledger', () => {
    const { routeId, stopId } = dispatchedWithStop(c1, 500);
    const settled = t.app.commands.settleStop(stopId, { cashAccountId: till.id }, SETTLER);
    const paymentId = settled.links[0].payment_id;
    t.app.commands.reversePayment(paymentId, 'wrong stop', CASHIER);
    const reopened = t.app.queries.getStopSettlement(stopId);
    assert.equal(reopened.status, 'open');
    assert.equal(reopened.outstanding, 500);
    assert.equal(t.app.queries.listCashAccounts().find((a) => a.code === 'TILL').balance, 0);
    assert.equal(t.app.queries.routeReconciliation(routeId).settled, 0);
    // and the claim can be settled again against fresh money
    const again = t.app.commands.settleStop(stopId, { cashAccountId: till.id }, SETTLER);
    assert.equal(again.status, 'settled');
    assert.equal(t.app.queries.listCashAccounts().find((a) => a.code === 'TILL').balance, 500);
  });

  it('rides allocations through to the invoice in the same transaction', () => {
    const inv = postedInvoice(c1.id, 5, 100); // 500 receivable
    const { stopId } = dispatchedWithStop(c1, 500);
    const settled = t.app.commands.settleStop(stopId, {
      cashAccountId: till.id,
      allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 500 }],
    }, CASHIER);
    assert.equal(settled.status, 'settled');
    assert.equal(t.app.queries.getDocument(inv.id).status, 'paid');
    assert.deepEqual(t.app.queries.partyBalance(c1.id), { receivable: 0, payable: 0, allocatedIn: 500, allocatedOut: 0, net: 0 });
    // over-allocating the fresh payment still fails inside the same guard
    const { stopId: other } = dispatchedWithStop(c2, 100);
    assert.throws(() => t.app.commands.settleStop(other, {
      cashAccountId: till.id,
      allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 1 }],
    }, CASHIER), (e) => e.code === 'INVALID_STATE');
  });
});
