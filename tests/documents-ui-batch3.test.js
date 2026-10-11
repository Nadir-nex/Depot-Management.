'use strict';
// Batch 3 gate: commercial document detail + line editor contract.
// Detail shows server header/lines/totals; only real transitions appear;
// delivery posts via fulfillment flow; print never mutates state.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTestApp, closeTestApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');

describe('batch3 document detail contract', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  function party(role = 'customer') {
    return t.app.commands.createParty({ displayName: 'B3 ' + Math.random().toString(36).slice(2, 7), roles: [role] });
  }
  function product(sku) {
    return t.app.commands.createProduct({ sku, name: sku, defaultSalePrice: 200 });
  }

  it('draft detail: header edit + line add/update/remove, totals from server', () => {
    const c = party('customer');
    const p = product('B3-P1');
    const q = product('B3-P2');
    let d = t.app.commands.createDocument({ type: 'sales_order', partyId: c.id, lines: [{ productId: p.id, qty: 2, unitPrice: 150 }] });
    assert.equal(d.lines.length, 1);
    const added = t.app.commands.addDocumentLine(d.id, { productId: q.id, qty: 1, unitPrice: 100, discountAmount: 10 });
    assert.equal(added.qty, 1);
    d = t.app.queries.getDocument(d.id);
    assert.equal(d.lines.length, 2);
    assert.ok(d.draftTotals && d.draftTotals.grandTotal === (2 * 150) + (1 * 100 - 10));
    const upd = t.app.commands.updateDocumentLine(added.id, { qty: 3 });
    assert.equal(upd.qty, 3);
    assert.equal(t.app.commands.removeDocumentLine(added.id), true);
    assert.equal(t.app.queries.getDocument(d.id).lines.length, 1);
    const edited = t.app.commands.updateDocument(d.id, { notes: 'B3 note', docDiscountAmount: 5 });
    assert.equal(edited.notes, 'B3 note');
    assert.throws(() => t.app.commands.addDocumentLine(d.id, { productId: p.id, qty: 0, unitPrice: 1 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.addDocumentLine(d.id, { productId: p.id, qty: 1, unitPrice: 9.99 }), (e) => e.code === 'VALIDATION');
  });

  it('transitions: confirm needs lines; delivery posts only via fulfillment; cancel needs reason', () => {
    const c = party('customer');
    const p = product('B3-T1');
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10 }] });
    const empty = t.app.commands.createDocument({ type: 'sales_order', partyId: c.id, lines: [] });
    assert.throws(() => t.app.commands.confirmDocument(empty.id), (e) => e.code === 'VALIDATION');
    let d = t.app.commands.createDocument({ type: 'sales_order', partyId: c.id, lines: [{ productId: p.id, qty: 2, unitPrice: 100 }] });
    t.app.commands.confirmDocument(d.id);
    assert.throws(() => t.app.commands.addDocumentLine(d.id, { productId: p.id, qty: 1, unitPrice: 1 }), (e) => e.code === 'INVALID_STATE');
    t.app.commands.postDocument(d.id);
    const dn = t.app.commands.convertDocument(d.id, 'delivery_note', { warehouseCode: 'MAIN' });
    assert.equal(dn.docType, 'delivery_note');
    t.app.commands.confirmDocument(dn.id);
    assert.throws(() => t.app.commands.postDocument(dn.id), (e) => e.code === 'INVALID_STATE');
    t.app.commands.postDeliveryNote(dn.id, {});
    assert.equal(t.app.queries.getDocument(dn.id).status, 'posted');
    assert.throws(() => t.app.commands.cancelDocument(dn.id, 'x'), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.cancelDocument(d.id, ''), (e) => e.code === 'VALIDATION');
    const inv = t.app.commands.convertDeliveriesToInvoice([dn.id], {});
    t.app.commands.confirmDocument(inv.id);
    t.app.commands.postInvoice(inv.id);
    assert.equal(t.app.queries.getDocument(inv.id).status, 'posted');
  });

  it('frontend detail uses server data, real actions only, print is read-only', () => {
    const must = [
      'api.getDocument', 'api.addDocumentLine', 'api.updateDocumentLine', 'api.removeDocumentLine',
      'api.updateDocument', 'api.confirmDocument', 'api.postDocument', 'api.cancelDocument',
      'api.convertDocument', 'api.convertDeliveriesToInvoice', 'api.postDeliveryNote', 'api.postInvoice',
      'draftTotals', 'window.print',
    ];
    for (const m of must) assert.ok(FRONT.includes(m), `frontend must use ${m}`);
    assert.ok(FRONT.includes('postDeliveryNote'), 'delivery fulfillment path required');
    assert.ok(!/grandTotal\s*=\s*[^=]*qty\s*\*/.test(FRONT), 'frontend must not recompute totals');
    assert.ok(FRONT.includes('data-busy'), 'double-submit guard required');
    assert.ok(FRONT.includes('cancelReason') || FRONT.includes('cancel_reason') || FRONT.includes('reason'), 'cancel reason required');
  });

  it('renderer stays display-only after batch 3', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
  });
});
