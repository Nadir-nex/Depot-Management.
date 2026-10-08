'use strict';
// Phase 25 gate: fiscal year, accounting events, period controls
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('fiscal year and accounting events', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('opens and closes a fiscal year', () => {
    // Before any FY, posting works (pre-fiscal mode)
    const p = t.app.commands.createProduct({ sku: 'FY-1', name: 'Test', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'FY-C1', name: 'Customer', type: 'customer', displayName: 'Customer' });
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-FY1', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');
    t.app.commands.postInvoice(inv.id, 'tester');

    // Now open a fiscal year
    const fy = t.app.commands.openFiscalYear({ code: 'FY2026', name: 'Fiscal 2026', startDate: '2026-01-01', endDate: '2026-12-31' }, 'tester');
    assert.equal(fy.code, 'FY2026');
    assert.equal(fy.status, 'open');

    // Cannot open second
    assert.throws(() => t.app.commands.openFiscalYear({ code: 'FY2027', name: 'FY27', startDate: '2027-01-01', endDate: '2027-12-31' }, 'tester'), (e) => e.code === 'INVALID_STATE');

    // Close it
    t.app.commands.closeFiscalYear(fy.id, 'tester');
    const closed = t.app.queries.listFiscalYears({ status: 'closed' });
    assert.equal(closed[0].status, 'closed');
  });

  it('rejects posting outside open fiscal year', () => {
    const fy = t.app.commands.openFiscalYear({ code: 'FY2026', name: 'FY26', startDate: '2026-01-01', endDate: '2026-12-31' }, 'tester');

    const p = t.app.commands.createProduct({ sku: 'FY-2', name: 'Test', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'FY-C2', name: 'Customer', type: 'customer', displayName: 'Customer' });
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-FY2', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');

    // Close FY before posting invoice
    t.app.commands.closeFiscalYear(fy.id, 'tester');

    // Should fail - no open FY
    assert.throws(() => t.app.commands.postInvoice(inv.id, 'tester'), (e) => e.code === 'INVALID_STATE');
  });

  it('generates accounting events for posted sales invoice in open FY', () => {
    const fy = t.app.commands.openFiscalYear({ code: 'FY2026', name: 'FY26', startDate: '2026-01-01', endDate: '2026-12-31' }, 'tester');

    const p = t.app.commands.createProduct({ sku: 'FY-3', name: 'Test', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'FY-C3', name: 'Customer', type: 'customer', displayName: 'Customer' });
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 2, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-FY3', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');
    t.app.commands.postInvoice(inv.id, 'tester');

    const events = t.app.queries.listAccountingEvents(fy.id);
    assert.ok(events.length >= 1, 'at least one accounting event generated');
    const invEvent = events.find(e => e.eventType === 'sales_invoice_posted' && e.sourceId === inv.id);
    assert.ok(invEvent, 'sales_invoice_posted event exists for the invoice');
    assert.equal(invEvent.totalDebit, invEvent.totalCredit, 'double entry balanced');

    const lines = t.app.queries.getJournalLines(invEvent.id);
    assert.ok(lines.length >= 2, 'has journal lines');
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    assert.equal(totalDebit, totalCredit, 'journal lines balanced');
  });

  it('traces accounting event to source document', () => {
    const fy = t.app.commands.openFiscalYear({ code: 'FY2026', name: 'FY26', startDate: '2026-01-01', endDate: '2026-12-31' }, 'tester');

    const p = t.app.commands.createProduct({ sku: 'FY-4', name: 'Test', defaultSalePrice: 500 });
    const c = t.app.commands.createParty({ code: 'FY-C4', name: 'Customer', type: 'customer', displayName: 'Customer' });
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 1, unitPrice: 500 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-FY4', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 5 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');
    t.app.commands.postInvoice(inv.id, 'tester');

    const bySource = t.app.queries.listAccountingEvents ? t.app.queries.listAccountingEvents(fy.id) : [];
    const events = t.app.queries.listAccountingEvents(fy.id);
    const invEvent = events.find(e => e.sourceType === 'document' && e.sourceId === inv.id && e.eventType === 'sales_invoice_posted');
    assert.ok(invEvent, 'event traces to source document');
    assert.equal(invEvent.sourceType, 'document');
    assert.equal(invEvent.sourceId, inv.id);
  });
});
