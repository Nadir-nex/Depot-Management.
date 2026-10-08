'use strict';
// Phase 12 gate: one generic lifecycle (draft → confirmed → posted → cancelled)
// with per-type restrictions, frozen money snapshots and family permissions.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { DOCUMENT_TRANSITIONS, DOCUMENT_TYPES } = require('../src/domain/vocabulary');
const { TYPE_TRANSITIONS, TYPE_PERMISSIONS } = require('../src/domain/documents');
const { makeTestApp, closeTestApp } = require('./helpers');

const SALES = { actor: 's', grants: ['sales.create', 'sales.post', 'sales.cancel'] };
const BUYER = { actor: 's', grants: ['sales.create'] };

describe('documents', () => {
  let t, p, q, customer, supplier;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'D-1', name: 'D', defaultSalePrice: 100 });
    q = t.app.commands.createProduct({ sku: 'D-2', name: 'E', defaultSalePrice: 50 });
    customer = t.app.commands.createParty({ displayName: 'Client', roles: ['customer'] });
    supplier = t.app.commands.createParty({ displayName: 'Grossiste', roles: ['supplier'] });
  });
  afterEach(() => { closeTestApp(t); });

  function order(auth = SALES, extra = {}) {
    return t.app.commands.createDocument({
      type: 'sales_order', partyId: customer.id,
      lines: [{ productId: p.id, qty: 2, unitPrice: 100 }, { productId: q.id, qty: 1, unitPrice: 50, discountAmount: 10 }],
      ...extra,
    }, auth);
  }

  it('creates drafts with numbered identity and computed draft totals', () => {
    const d = order();
    assert.ok(/^SO-\d{8}-\d{4}$/.test(d.docNo));
    assert.equal(d.status, 'draft');
    assert.equal(d.lines.length, 2);
    assert.deepEqual(d.draftTotals, { subtotal: 250, discountTotal: 10, taxTotal: 0, grandTotal: 240 });
    assert.equal(d.grandTotal, 0); // snapshot only freezes at post
    assert.throws(() => t.app.commands.createDocument({ type: 'nope' }, SALES), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createDocument({ type: 'sales_order', partyId: supplier.id, lines: [] }, SALES), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.createDocument({ type: 'sales_order', lines: [{ productId: 99999, qty: 1, unitPrice: 1 }] }, SALES), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.createDocument({ type: 'sales_order', lines: [{ productId: p.id, qty: 1, unitPrice: 10, discountAmount: 11 }] }, SALES), (e) => e.code === 'VALIDATION');
  });

  it('edits drafts and freezes them after confirmation', () => {
    const d = order();
    const lineId = d.lines[0].id;
    t.app.commands.updateDocumentLine(lineId, { qty: 3 }, SALES);
    assert.equal(t.app.queries.getDocument(d.id).draftTotals.subtotal, 350);
    const added = t.app.commands.addDocumentLine(d.id, { productId: q.id, qty: 2, unitPrice: 50 }, SALES);
    assert.equal(t.app.queries.getDocument(d.id).lines.length, 3);
    t.app.commands.removeDocumentLine(added.id, SALES);
    assert.equal(t.app.queries.getDocument(d.id).lines.length, 2);
    t.app.commands.updateDocument(d.id, { notes: 'urgent' }, SALES);
    t.app.commands.confirmDocument(d.id, SALES);
    assert.equal(t.app.queries.getDocument(d.id).status, 'confirmed');
    assert.throws(() => t.app.commands.updateDocument(d.id, { notes: 'late' }, SALES), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.addDocumentLine(d.id, { productId: p.id, qty: 1, unitPrice: 1 }, SALES), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.updateDocumentLine(lineId, { qty: 9 }, SALES), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.removeDocumentLine(lineId, SALES), (e) => e.code === 'INVALID_STATE');
  });

  it('refuses to confirm empties and to skip states', () => {
    const d = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id }, SALES);
    assert.throws(() => t.app.commands.confirmDocument(d.id, SALES), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.postDocument(d.id, SALES), (e) => e.code === 'VALIDATION'); // draft→posted illegal
    const o = order();
    t.app.commands.confirmDocument(o.id, SALES);
    assert.throws(() => t.app.commands.confirmDocument(o.id, SALES), (e) => e.code === 'VALIDATION'); // confirmed→confirmed
  });

  it('posts money snapshots that later catalog edits cannot move', () => {
    const d = order();
    t.app.commands.confirmDocument(d.id, SALES);
    const posted = t.app.commands.postDocument(d.id, SALES);
    assert.equal(posted.status, 'posted');
    assert.equal(posted.grandTotal, 240);
    assert.ok(posted.postedAt);
    t.app.commands.updateProduct(p.id, { defaultSalePrice: 999, name: 'Renamed' });
    const reread = t.app.queries.getDocument(d.id);
    assert.equal(reread.grandTotal, 240); // frozen
    assert.equal(reread.lines[0].unit_price, 100); // line snapshot intact
    assert.equal(reread.lines[0].description, 'D');
    t.app.commands.setProductActive(p.id, false);
    const d2 = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: q.id, qty: 1, unitPrice: 1 }] }, SALES);
    t.app.commands.confirmDocument(d2.id, SALES);
    t.app.commands.setProductActive(q.id, false);
    assert.throws(() => t.app.commands.postDocument(d2.id, SALES), (e) => e.code === 'INVALID_STATE');
  });

  it('cancels with reason at any pre-terminal state, terminally', () => {
    const d = order();
    assert.throws(() => t.app.commands.cancelDocument(d.id, '', SALES), (e) => e.code === 'VALIDATION');
    t.app.commands.cancelDocument(d.id, 'client withdrew', SALES);
    const c = t.app.queries.getDocument(d.id);
    assert.equal(c.status, 'cancelled');
    assert.equal(c.cancelReason, 'client withdrew');
    assert.throws(() => t.app.commands.cancelDocument(d.id, 'again', SALES), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.postDocument(d.id, SALES), (e) => e.code === 'VALIDATION');
    const o = order();
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    t.app.commands.cancelDocument(o.id, 'duplicate entry', SALES); // posted cancel voids intent (P15 adds reversal links)
    assert.equal(t.app.queries.getDocument(o.id).status, 'cancelled');
  });

  it('restricts non-posting types structurally', () => {
    for (const type of ['sales_quote', 'proforma_invoice']) {
      const d = t.app.commands.createDocument({ type, partyId: customer.id, lines: [{ productId: p.id, qty: 1, unitPrice: 10 }] }, SALES);
      t.app.commands.confirmDocument(d.id, SALES);
      assert.throws(() => t.app.commands.postDocument(d.id, SALES), (e) => e.code === 'VALIDATION');
      t.app.commands.cancelDocument(d.id, 'done', SALES);
      assert.equal(t.app.queries.getDocument(d.id).status, 'cancelled');
    }
    const po = t.app.commands.createDocument({ type: 'purchase_order', partyId: supplier.id, lines: [{ productId: p.id, qty: 1, unitPrice: 10 }] }, { actor: 'b', grants: ['purchases.create', 'purchases.post', 'purchases.cancel'] });
    t.app.commands.confirmDocument(po.id, { actor: 'b', grants: ['purchases.create', 'purchases.post', 'purchases.cancel'] });
    assert.throws(() => t.app.commands.createDocument({ type: 'delivery_note', partyId: customer.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }, BUYER), (e) => e.code === 'FORBIDDEN');
  });

  it('enforces family permissions per lifecycle action', () => {
    const d = order(BUYER); // sales.create drafts…
    t.app.commands.confirmDocument(d.id, BUYER); // …and confirms (still pre-posting)…
    assert.throws(() => t.app.commands.postDocument(d.id, BUYER), (e) => e.code === 'FORBIDDEN'); // …but posting needs sales.post
    assert.throws(() => t.app.commands.cancelDocument(d.id, 'x', BUYER), (e) => e.code === 'FORBIDDEN'); // cancelling needs sales.cancel
    assert.throws(() => t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.createDocument({ type: 'purchase_order', partyId: supplier.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }, BUYER), (e) => e.code === 'FORBIDDEN');
    t.app.commands.postDocument(d.id, SALES);
    t.app.commands.cancelDocument(d.id, 'ok', SALES);
    assert.equal(t.app.queries.getDocument(d.id).status, 'cancelled');
  });

  it('rejects duplicate numbers and links source documents', () => {
    const a = order();
    assert.throws(() => t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, docNo: a.docNo, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }, SALES), (e) => e.code === 'CONFLICT');
    t.app.commands.confirmDocument(a.id, SALES);
    t.app.commands.postDocument(a.id, SALES);
    const dn = t.app.commands.createDocument({ type: 'delivery_note', partyId: customer.id, sourceDocId: a.id, lines: [{ productId: p.id, qty: 2, unitPrice: 100 }] }, { actor: 'd', grants: ['deliveries.create'] });
    assert.equal(dn.sourceDocId, a.id);
    assert.throws(() => t.app.commands.createDocument({ type: 'delivery_note', sourceDocId: 99999, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }, { actor: 'd', grants: ['deliveries.create'] }), (e) => e.code === 'NOT_FOUND');
    const found = t.app.queries.listDocuments({ docType: 'sales_order', status: 'posted' });
    assert.ok(found.some((x) => x.id === a.id));
  });

  it('keeps per-type lifecycles inside the generic transition table', () => {
    const party = t.app.commands.createParty({ displayName: 'C', roles: ['customer'] });
    const prod = t.app.commands.createProduct({ sku: 'Z-1', name: 'Z' });
    const mini = t.app.commands.createDocument({ type: 'sales_order', partyId: party.id, lines: [{ productId: prod.id, qty: 1, unitPrice: 1 }] }, SALES);
    t.app.commands.confirmDocument(mini.id, SALES);
    t.app.commands.postDocument(mini.id, SALES);
    t.app.commands.cancelDocument(mini.id, 'test', SALES);
    for (const [type, moves] of Object.entries(TYPE_TRANSITIONS)) {
      assert.ok(Object.values(DOCUMENT_TYPES).includes(type), type);
      for (const [from, tos] of Object.entries(moves)) {
        for (const to of tos) {
          assert.ok((DOCUMENT_TRANSITIONS[from] || []).includes(to), `${type}: ${from}→${to} not in generic table`);
        }
      }
    }
    for (const [type, perms] of Object.entries(TYPE_PERMISSIONS)) {
      assert.ok(TYPE_TRANSITIONS[type], `perms without lifecycle: ${type}`);
      for (const k of ['create', 'post', 'cancel']) assert.ok(perms[k], `${type} missing ${k} perm`);
    }
    const auditOps = t.app.queries.recentAudit({ limit: 200 }).map((a) => a.operation);
    for (const op of ['document.create', 'document.confirm', 'document.post', 'document.cancel']) {
      assert.ok(auditOps.includes(op), `missing audit: ${op}`);
    }
  });
});
