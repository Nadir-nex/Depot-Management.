'use strict';
// Phase 14 gate: order-linked receiving, partial intake, invoice matching.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

const BUY = { actor: 'b', grants: ['purchases.create', 'purchases.post', 'purchases.cancel'] };

describe('purchases', () => {
  let t, p, q, supplier;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'PU-1', name: 'PU' });
    q = t.app.commands.createProduct({ sku: 'PU-2', name: 'PU2' });
    supplier = t.app.commands.createParty({ displayName: 'Grossiste', roles: ['supplier'] });
  });
  afterEach(() => { closeTestApp(t); });

  function postedOrder(lines = [{ productId: null, qty: 10, unitPrice: 50 }]) {
    const fixed = lines.map((l) => ({ productId: l.productId === null ? p.id : l.productId, qty: l.qty, unitPrice: l.unitPrice ?? 50 }));
    const o = t.app.commands.createDocument({ type: 'purchase_order', partyId: supplier.id, lines: fixed }, BUY);
    t.app.commands.confirmDocument(o.id, BUY);
    return t.app.commands.postDocument(o.id, BUY);
  }

  it('receives fully and partially against a posted order', () => {
    const o = postedOrder([{ productId: null, qty: 10, unitPrice: 50 }]);
    const r1 = t.app.commands.receiveStock({ purchaseOrderId: o.id, supplierPartyId: supplier.id, lines: [{ productId: p.id, qty: 6, unitCost: 50 }] });
    assert.equal(r1.purchase_order_id, o.id);
    assert.equal(t.app.queries.getStock(p.id, 1), 6);
    assert.throws(() => t.app.commands.receiveStock({ purchaseOrderId: o.id, lines: [{ productId: p.id, qty: 5, unitCost: 50 }] }), (e) => e.code === 'INVALID_STATE');
    assert.equal(t.app.queries.getStock(p.id, 1), 6); // over-receipt changed nothing
    const r2 = t.app.commands.receiveStock({ purchaseOrderId: o.id, lines: [{ productId: p.id, qty: 4, unitCost: 55 }] });
    assert.equal(t.app.queries.getStock(p.id, 1), 10);
    assert.throws(() => t.app.commands.receiveStock({ purchaseOrderId: o.id, lines: [{ productId: p.id, qty: 1, unitCost: 1 }] }), (e) => e.code === 'INVALID_STATE');
    assert.equal(r2.supplier_party_id, supplier.id); // inherited from the order
  });

  it('guards order linkage strictly', () => {
    const o = postedOrder();
    const customer = t.app.commands.createParty({ displayName: 'C', roles: ['customer'] });
    assert.throws(() => t.app.commands.receiveStock({ purchaseOrderId: o.id, supplierPartyId: customer.id, lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'INVALID_STATE');
    const draft = t.app.commands.createDocument({ type: 'purchase_order', partyId: supplier.id, lines: [{ productId: p.id, qty: 5, unitPrice: 1 }] }, BUY);
    assert.throws(() => t.app.commands.receiveStock({ purchaseOrderId: draft.id, lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'INVALID_STATE');
    const sale = t.app.commands.createDocument({ type: 'sales_order', partyId: customer.id, lines: [{ productId: p.id, qty: 5, unitPrice: 1 }] }, { actor: 's', grants: ['sales.create'] });
    assert.throws(() => t.app.commands.receiveStock({ purchaseOrderId: sale.id, lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.receiveStock({ purchaseOrderId: 99999, lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'NOT_FOUND');
    // product not on the order at all
    assert.throws(() => t.app.commands.receiveStock({ purchaseOrderId: o.id, lines: [{ productId: q.id, qty: 1 }] }), (e) => e.code === 'INVALID_STATE');
  });

  it('receives multi-line orders with per-product remaining', () => {
    const o = postedOrder([{ productId: null, qty: 10, unitPrice: 50 }, { productId: q.id, qty: 4, unitPrice: 20 }]);
    t.app.commands.receiveStock({ purchaseOrderId: o.id, lines: [{ productId: p.id, qty: 10, unitCost: 50 }, { productId: q.id, qty: 2, unitCost: 20 }] });
    assert.throws(() => t.app.commands.receiveStock({ purchaseOrderId: o.id, lines: [{ productId: q.id, qty: 3, unitCost: 20 }] }), (e) => e.code === 'INVALID_STATE');
    t.app.commands.receiveStock({ purchaseOrderId: o.id, lines: [{ productId: q.id, qty: 2, unitCost: 20 }] });
    assert.equal(t.app.queries.getStock(q.id, 1), 4);
  });

  it('matches supplier invoices without a second ledger', () => {
    const r = t.app.commands.receiveStock({ supplierPartyId: supplier.id, lines: [{ productId: p.id, qty: 4, unitCost: 25 }] });
    const matched = t.app.commands.recordSupplierInvoice(r.id, { invoiceNo: 'F-2026-001', total: 100 });
    assert.equal(matched.supplier_invoice_no, 'F-2026-001');
    assert.equal(matched.supplier_invoice_total, 100);
    assert.equal(t.app.queries.getParty(supplier.id).balance.payable, 100); // payable still goods-based
    assert.throws(() => t.app.commands.recordSupplierInvoice(r.id, { invoiceNo: '' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.recordSupplierInvoice(r.id, { invoiceNo: 'X', total: -1 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.recordSupplierInvoice(r.id, { invoiceNo: 'X' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    t.app.commands.cancelReceipt(r.id, 'void');
    assert.throws(() => t.app.commands.recordSupplierInvoice(r.id, { invoiceNo: 'X' }), (e) => e.code === 'INVALID_STATE');
    assert.equal(t.app.queries.getParty(supplier.id).balance.payable, 0);
  });

  it('keeps over-the-counter receiving working without orders', () => {
    const r = t.app.commands.receiveStock({ supplierName: 'Cash market', lines: [{ productId: p.id, qty: 7, unitCost: 10 }] });
    assert.equal(r.purchase_order_id, null);
    assert.equal(r.supplier_party_id, null);
    assert.equal(t.app.queries.getStock(p.id, 1), 7);
    t.app.commands.recordSupplierInvoice(r.id, { invoiceNo: 'CASH-1' });
    const audit = t.app.queries.recentAudit({ limit: 5 }).map((a) => a.operation);
    assert.ok(audit.includes('stock.receive'));
    assert.ok(audit.includes('purchase.invoice_record'));
  });
});
