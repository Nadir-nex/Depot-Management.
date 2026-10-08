'use strict';
// Phase 23 gate: printed document snapshots are stable against post-edit drift.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');
const { renderDocument } = require('../src/application/printing/renderDocument');

describe('printing (document snapshots)', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('renders posted document snapshot and remains stable after edits', () => {
    const p = t.app.commands.createProduct({ sku: 'PRT-1', name: 'Printed Item', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'C1', name: 'Customer 1', type: 'customer', displayName: 'Customer 1' });
    const q = t.app.commands.createDocument({
      type: 'sales_quote',
      partyId: c.id,
      lines: [{ productId: p.id, qty: 2, unitPrice: 1000 }],
    }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    // Receive stock before posting delivery
    t.app.commands.receiveStock({ receiptNo: 'R-1', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');
    t.app.commands.postInvoice(inv.id, 'tester');

    const snap1 = renderDocument(t.app.db, inv.id);
    assert.equal(snap1.doc.status, 'posted');
    assert.equal(snap1.party.name, 'Customer 1');
    assert.equal(snap1.lines[0].unitPrice, 1000);
    assert.equal(snap1.lines[0].lineTotal, 2000);

    // Mutate live records (should NOT affect snapshot)
    t.app.commands.updateParty(c.id, { displayName: 'Customer 1 - Renamed' }, 'tester');
    t.app.commands.updateProduct(p.id, { defaultSalePrice: 2000, name: 'Printed Item v2' }, 'tester');

    const snap2 = renderDocument(t.app.db, inv.id);
    // Deep equality on business-critical fields
    assert.equal(snap2.doc.docNo, snap1.doc.docNo);
    assert.equal(snap2.doc.grandTotal, snap1.doc.grandTotal);
    assert.equal(snap2.party.name, 'Customer 1'); // still historical
    assert.equal(snap2.lines[0].unitPrice, 1000); // frozen
    assert.equal(snap2.lines[0].lineTotal, 2000); // frozen
    assert.equal(snap2.lines[0].description, snap1.lines[0].description);
  });

  it('can require posted documents for historical printing', () => {
    const p = t.app.commands.createProduct({ sku: 'PRT-2', name: 'X' });
    const c = t.app.commands.createParty({ code: 'C2', name: 'Y', type: 'customer', displayName: 'Y' });
    const q = t.app.commands.createDocument({
      type: 'sales_quote',
      partyId: c.id,
      lines: [{ productId: p.id, qty: 1, unitPrice: 500 }],
    }, 'tester');
    let err = null;
    try { renderDocument(t.app.db, q.id, { requirePosted: true }); } catch (e) { err = e; }
    assert.ok(err && err.code === 'INVALID_STATE', 'must throw STATE for non-posted');
  });
});
