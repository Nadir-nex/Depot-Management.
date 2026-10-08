'use strict';
// Phase 15 gate: commercial corrections without touching history.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

const SALES = { actor: 's', grants: ['sales.create', 'sales.post', 'sales.cancel', 'deliveries.create', 'deliveries.complete'] };
const BUY = { actor: 'b', grants: ['purchases.create', 'purchases.post', 'purchases.cancel'] };

describe('returns', () => {
  let t, p, customer, supplier;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'R-1', name: 'R' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 50, unitCost: 10 }] });
    customer = t.app.commands.createParty({ displayName: 'Client', roles: ['customer'] });
    supplier = t.app.commands.createParty({ displayName: 'Grossiste', roles: ['supplier'] });
  });
  afterEach(() => { closeTestApp(t); });

  function delivered(qty = 10, price = 100) {
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: p.id, qty, unitPrice: price }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(dn.id, SALES);
    return t.app.commands.postDeliveryNote(dn.id, { actor: SALES });
  }

  function returnAll(deliveryId, reason = 'defective') {
    const delivery = t.app.queries.getDocument(deliveryId);
    const ret = t.app.commands.createCustomerReturn(deliveryId, {
      lines: delivery.lines.map((l) => ({ sourceLineId: l.id, qty: l.qty })),
    }, SALES);
    t.app.commands.confirmDocument(ret.id, SALES);
    return t.app.commands.postCustomerReturn(ret.id, { reason, actor: SALES });
  }

  it('returns a full delivery to stock with links and reason', () => {
    const d = delivered();
    assert.equal(t.app.queries.getStock(p.id, 1), 40);
    const ret = returnAll(d.id);
    assert.equal(ret.status, 'posted');
    assert.equal(ret.sourceDocId, d.id);
    assert.equal(t.app.queries.getStock(p.id, 1), 50);
    const movs = t.app.db.prepare("SELECT * FROM stock_movements WHERE reference_type = 'customer_return'").all();
    assert.equal(movs.length, 1);
    assert.equal(movs[0].movement_type, 'sales_return');
    assert.equal(movs[0].reason_code, 'defective');
    const audit = t.app.queries.recentAudit({ limit: 5 }).map((a) => [a.operation, a.reason]);
    assert.ok(audit.some(([op]) => op === 'document.post'));
    // original delivery untouched
    assert.equal(t.app.queries.getDocument(d.id).status, 'posted');
    assert.throws(() => returnAll(d.id), (e) => e.code === 'INVALID_STATE'); // nothing left: double-return rejected
  });

  it('returns partially and tracks remaining per line', () => {
    const d = delivered(10);
    const ret = t.app.commands.createCustomerReturn(d.id, { lines: [{ sourceLineId: d.lines[0].id, qty: 4 }] }, SALES);
    t.app.commands.confirmDocument(ret.id, SALES);
    t.app.commands.postCustomerReturn(ret.id, { reason: 'wrong_item', actor: SALES });
    assert.equal(t.app.queries.getStock(p.id, 1), 44);
    assert.throws(() => t.app.commands.createCustomerReturn(d.id, { lines: [{ sourceLineId: d.lines[0].id, qty: 7 }] }, SALES), (e) => e.code === 'INVALID_STATE');
    const ret2 = t.app.commands.createCustomerReturn(d.id, { lines: [{ sourceLineId: d.lines[0].id, qty: 6 }] }, SALES);
    t.app.commands.confirmDocument(ret2.id, SALES);
    t.app.commands.postCustomerReturn(ret2.id, { reason: 'customer_request', actor: SALES });
    assert.equal(t.app.queries.getStock(p.id, 1), 50);
  });

  it('validates return sources strictly', () => {
    const d = delivered();
    assert.throws(() => t.app.commands.createCustomerReturn(99999, { lines: [] }, SALES), (e) => e.code === 'NOT_FOUND');
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }, SALES);
    assert.throws(() => t.app.commands.createCustomerReturn(o.id, { lines: [{ sourceLineId: 1, qty: 1 }] }, SALES), (e) => e.code === 'VALIDATION'); // not a delivery
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const draft = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    assert.throws(() => t.app.commands.createCustomerReturn(draft.id, { lines: [{ sourceLineId: 1, qty: 1 }] }, SALES), (e) => e.code === 'INVALID_STATE'); // unposted
    assert.throws(() => t.app.commands.createCustomerReturn(d.id, { lines: [] }, SALES), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createCustomerReturn(d.id, { lines: [{ sourceLineId: d.lines[0].id, qty: 0 }] }, SALES), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.postCustomerReturn(d.id, { reason: 'defective', actor: SALES }), (e) => e.code === 'VALIDATION'); // wrong type
    const ret = t.app.commands.createCustomerReturn(d.id, { lines: [{ sourceLineId: d.lines[0].id, qty: 1 }] }, SALES);
    t.app.commands.confirmDocument(ret.id, SALES);
    assert.throws(() => t.app.commands.postCustomerReturn(ret.id, { reason: 'whatever', actor: SALES }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.postCustomerReturn(ret.id, { actor: SALES }), (e) => e.code === 'VALIDATION'); // reason required
  });

  it('restores lots and serials through returns', () => {
    const sp = t.app.commands.createProduct({ sku: 'SER-R', name: 'S', serialTracking: true });
    const slot = t.app.commands.createLot(sp.id, { lotNo: 'SLOT' });
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: sp.id, qty: 2, unitPrice: 50 }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    t.app.commands.receiveStock({ lines: [{ productId: sp.id, qty: 2, lotId: slot.id, serials: ['RS-1', 'RS-2'] }] });
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    // fulfillment allocates the lot explicitly (orders are lot-agnostic)
    t.app.commands.updateDocumentLine(dn.lines[0].id, { lotId: slot.id }, SALES);
    t.app.commands.confirmDocument(dn.id, SALES);
    const posted = t.app.commands.postDeliveryNote(dn.id, { serialsByLine: { [dn.lines[0].id]: ['RS-1', 'RS-2'] }, actor: SALES });
    assert.equal(t.app.queries.listSerials(sp.id, 'in_stock').length, 0);
    const ret = t.app.commands.createCustomerReturn(posted.id, { lines: [{ sourceLineId: posted.lines[0].id, qty: 2, lotId: slot.id }] }, SALES);
    t.app.commands.confirmDocument(ret.id, SALES);
    t.app.commands.postCustomerReturn(ret.id, { reason: 'defective', serialsByLine: { [ret.lines[0].id]: ['RS-1', 'RS-2'] }, actor: SALES });
    assert.deepEqual(t.app.queries.listSerials(sp.id, 'in_stock').map((s) => s.code), ['RS-1', 'RS-2']);
    assert.equal(t.app.queries.listLots(sp.id, { warehouseId: 1 }).find((l) => l.lot_no === 'SLOT').stock, 2);
  });

  it('returns goods to the supplier against their receipt', () => {
    const r = t.app.commands.receiveStock({ supplierPartyId: supplier.id, lines: [{ productId: p.id, qty: 10, unitCost: 20 }] });
    const mov = t.app.commands.returnToSupplier({ receiptId: r.id, productId: p.id, qty: 4, reason: 'defective' }, BUY);
    assert.equal(mov.qty, -4);
    assert.equal(mov.movement_type, 'purchase_return');
    assert.equal(t.app.queries.getStock(p.id, 1), 56); // 50 + 10 - 4
    assert.throws(() => t.app.commands.returnToSupplier({ receiptId: r.id, productId: p.id, qty: 7, reason: 'damaged' }, BUY), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.returnToSupplier({ productId: p.id, qty: 1, reason: 'damaged' }, BUY), (e) => e.code === 'VALIDATION'); // receipt required
    assert.throws(() => t.app.commands.returnToSupplier({ receiptId: r.id, productId: p.id, qty: 1 }, BUY), (e) => e.code === 'VALIDATION'); // reason required
    assert.throws(() => t.app.commands.returnToSupplier({ receiptId: r.id, productId: p.id, qty: 1, reason: 'damaged' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    t.app.commands.cancelReceipt(r.id, 'void all');
    assert.throws(() => t.app.commands.returnToSupplier({ receiptId: r.id, productId: p.id, qty: 1, reason: 'damaged' }, BUY), (e) => e.code === 'INVALID_STATE');
    const audit = t.app.queries.recentAudit({ limit: 5 });
    assert.ok(audit.some((a) => a.operation === 'stock.supplier_return' && a.reason === 'defective'));
  });

  it('reverses return movements symmetrically', () => {
    const d = delivered(10);
    const ret = returnAll(d.id);
    const retMov = t.app.db.prepare("SELECT id FROM stock_movements WHERE reference_type = 'customer_return'").get();
    const rev = t.app.commands.reverseStockMovement(retMov.id, 'correction');
    assert.equal(rev.qty, -10); // return undone: stock leaves again
    assert.equal(t.app.queries.getStock(p.id, 1), 40);
    assert.equal(t.app.queries.getDocument(ret.id).status, 'posted'); // the doc stands; only stock compensated
  });
});
