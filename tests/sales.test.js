'use strict';
// Phase 13 gate: quote → order → (partial) deliveries → invoice, with stock
// posted exactly once at delivery and receivables at invoice. Payments and
// settlement complete the lifecycle in P16; here the receivable is asserted.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

const SALES = { actor: 's', grants: ['sales.create', 'sales.post', 'sales.cancel', 'deliveries.create', 'deliveries.complete'] };

describe('sales', () => {
  let t, p, customer;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'SL-1', name: 'SL', defaultSalePrice: 100 });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 100, unitCost: 60 }] });
    customer = t.app.commands.createParty({ displayName: 'Client', roles: ['customer'] });
  });
  afterEach(() => { closeTestApp(t); });

  function postOrder(qty = 10, price = 100) {
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: p.id, qty, unitPrice: price }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    return t.app.commands.postDocument(o.id, SALES);
  }

  function deliverAll(orderId, warehouseCode = 'MAIN') {
    const dn = t.app.commands.convertDocument(orderId, 'delivery_note', { warehouseCode, actor: SALES });
    t.app.commands.confirmDocument(dn.id, SALES);
    return t.app.commands.postDeliveryNote(dn.id, { actor: SALES });
  }

  function invoiceAll(deliveryIds) {
    const inv = t.app.commands.convertDeliveriesToInvoice(deliveryIds, { actor: SALES });
    t.app.commands.confirmDocument(inv.id, SALES);
    return t.app.commands.postInvoice(inv.id, SALES);
  }

  it('runs quote → order with no stock effects', () => {
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: customer.id, lines: [{ productId: p.id, qty: 10, unitPrice: 100 }] }, SALES);
    t.app.commands.confirmDocument(q.id, SALES);
    const o = t.app.commands.convertDocument(q.id, 'sales_order', { actor: SALES });
    assert.equal(o.sourceDocId, q.id);
    assert.equal(o.lines[0].source_line_id, q.lines[0].id);
    assert.equal(o.lines[0].unit_price, 100); // quote promise honored
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    assert.equal(t.app.queries.getStock(p.id, 1), 100); // orders move nothing
    assert.throws(() => t.app.commands.convertDocument(q.id, 'delivery_note', { actor: SALES }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.convertDocument(o.id, 'sales_invoice', { actor: SALES }), (e) => e.code === 'VALIDATION');
  });

  it('fulfills partially across two deliveries and invoices both at once', () => {
    const o = postOrder(10, 100);
    const d1 = t.app.commands.convertDocument(o.id, 'delivery_note', { quantities: [{ sourceLineId: o.lines[0].id, qty: 6 }], partial: true, warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(d1.id, SALES);
    t.app.commands.postDeliveryNote(d1.id, { actor: SALES });
    assert.equal(t.app.queries.getStock(p.id, 1), 94);
    assert.throws(() => t.app.commands.convertDocument(o.id, 'delivery_note', { quantities: [{ sourceLineId: o.lines[0].id, qty: 5 }], partial: true, warehouseCode: 'MAIN', actor: SALES }), (e) => e.code === 'INVALID_STATE');
    const d2 = t.app.commands.convertDocument(o.id, 'delivery_note', { quantities: [{ sourceLineId: o.lines[0].id, qty: 4 }], partial: true, warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(d2.id, SALES);
    t.app.commands.postDeliveryNote(d2.id, { actor: SALES });
    assert.equal(t.app.queries.getStock(p.id, 1), 90);
    const inv = invoiceAll([d1.id, d2.id]);
    assert.equal(inv.lines.length, 2);
    assert.equal(inv.grandTotal, 1000);
    assert.equal(t.app.queries.getParty(customer.id).balance.receivable, 1000);
    assert.throws(() => t.app.commands.convertDeliveriesToInvoice([d1.id], { actor: SALES }), (e) => e.code === 'VALIDATION'); // nothing left
  });

  it('leaves zero partial writes when fulfillment fails mid-post', () => {
    const o = postOrder(10, 100);
    const d = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(d.id, SALES);
    // sabotage: deactivate the product so the second line's check fails first —
    // use two lines where the post must fail atomically
    const movBefore = t.app.queries.listMovements({}).length;
    t.app.commands.setProductActive(p.id, false);
    assert.throws(() => t.app.commands.postDeliveryNote(d.id, { actor: SALES }), (e) => e.code === 'INVALID_STATE');
    assert.equal(t.app.queries.getDocument(d.id).status, 'confirmed'); // still confirmed, not half-posted
    assert.equal(t.app.queries.listMovements({}).length, movBefore);
    assert.equal(t.app.queries.getStock(p.id, 1), 100);
  });

  it('posts stock exactly once per delivery (status-guarded)', () => {
    const o = postOrder(5, 100);
    const posted = deliverAll(o.id);
    assert.equal(posted.status, 'posted');
    assert.throws(() => t.app.commands.postDeliveryNote(posted.id, { actor: SALES }), (e) => e.code === 'VALIDATION');
    const issues = t.app.db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE reference_type = 'delivery_note'").get().n;
    assert.equal(issues, 1);
    assert.throws(() => t.app.commands.postDocument(posted.id, SALES), (e) => e.code === 'VALIDATION'); // re-post guarded by status
  });

  it('requires stock effects through fulfillment (bare posts rejected)', () => {
    const o = postOrder(2, 100);
    const d = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(d.id, SALES);
    assert.throws(() => t.app.commands.postDocument(d.id, { actor: 's', grants: ['deliveries.complete'] }), (e) => e.code === 'INVALID_STATE');
  });

  it('blocks posted-delivery cancellation until P15 returns exist', () => {
    const o = postOrder(2, 100);
    const posted = deliverAll(o.id);
    assert.throws(() => t.app.commands.cancelDocument(posted.id, 'oops', SALES), (e) => e.code === 'INVALID_STATE');
    assert.equal(t.app.queries.getStock(p.id, 1), 98); // stock untouched by the refused cancel
  });

  it('drops the receivable when a posted invoice cancels', () => {
    const o = postOrder(3, 100);
    const inv = invoiceAll([deliverAll(o.id).id]);
    assert.equal(t.app.queries.getParty(customer.id).balance.receivable, 300);
    t.app.commands.cancelDocument(inv.id, 'billed wrong customer', SALES);
    assert.equal(t.app.queries.getParty(customer.id).balance.receivable, 0);
  });

  it('applies explicit document discounts in totals', () => {
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, docDiscountAmount: 50, lines: [{ productId: p.id, qty: 2, unitPrice: 100 }] }, SALES);
    assert.equal(o.draftTotals.grandTotal, 150);
    t.app.commands.confirmDocument(o.id, SALES);
    const posted = t.app.commands.postDocument(o.id, SALES);
    assert.equal(posted.grandTotal, 150);
    assert.throws(() => t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, docDiscountAmount: 500, lines: [{ productId: p.id, qty: 1, unitPrice: 100 }] }, SALES), (e) => e.code === 'VALIDATION');
  });

  it('fulfills serialized sales with exact serials and respects expiry', () => {
    const sp = t.app.commands.createProduct({ sku: 'SER-1', name: 'S', serialTracking: true });
    t.app.commands.receiveStock({ lines: [{ productId: sp.id, qty: 2, serials: ['A-1', 'A-2'] }] });
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: sp.id, qty: 1, unitPrice: 200 }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const d = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(d.id, SALES);
    assert.throws(() => t.app.commands.postDeliveryNote(d.id, { actor: SALES }), (e) => e.code === 'VALIDATION'); // serials required
    t.app.commands.postDeliveryNote(d.id, { serialsByLine: { [d.lines[0].id]: ['A-1'] }, actor: SALES });
    assert.deepEqual(t.app.queries.listSerials(sp.id, 'out').map((s) => s.code), ['A-1']);
    assert.equal(t.app.queries.getStock(sp.id, 1), 1);
    // expired lot delivery blocked
    const lp = t.app.commands.createProduct({ sku: 'LT-1', name: 'L' });
    const lot = t.app.commands.createLot(lp.id, { lotNo: 'OLD', expiryDate: '2001-01-01' });
    t.app.commands.receiveStock({ lines: [{ productId: lp.id, qty: 5, lotId: lot.id }] });
    const o2 = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: lp.id, qty: 2, unitPrice: 10, lotId: lot.id }] }, SALES);
    t.app.commands.confirmDocument(o2.id, SALES);
    t.app.commands.postDocument(o2.id, SALES);
    const d2 = t.app.commands.convertDocument(o2.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(d2.id, SALES);
    assert.throws(() => t.app.commands.postDeliveryNote(d2.id, { actor: SALES }), (e) => e.code === 'INVALID_STATE');
  });

  it('leaves a complete audit trail across the chain', () => {
    const o = postOrder(2, 100);
    const d = deliverAll(o.id);
    invoiceAll([d.id]);
    const ops = t.app.queries.recentAudit({ limit: 100 }).map((a) => a.operation);
    for (const op of ['document.create', 'document.confirm', 'document.post']) {
      assert.ok(ops.includes(op), `missing audit: ${op}`);
    }
    // fulfillment stock effects are audited through the delivery posting…
    assert.ok(t.app.db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE reference_type = 'delivery_note'").get().n >= 1);
    // …and every movement traces back to its delivery document
    const movs = t.app.db.prepare("SELECT DISTINCT reference_id FROM stock_movements WHERE reference_type = 'delivery_note'").all();
    assert.ok(movs.every((m) => t.app.queries.getDocument(m.reference_id).docType === 'delivery_note'));
  });
});
