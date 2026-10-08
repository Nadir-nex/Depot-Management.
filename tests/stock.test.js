'use strict';
// Stock engine: derived stock, transactional receipts, rollback, cancellation.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('stock', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('derives stock from purchase receipts (no qty stored on product)', () => {
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' });
    const b = t.app.commands.createProduct({ sku: 'P-B', name: 'B' });
    assert.equal(t.app.queries.getStock(a.id, 1), 0);
    const r1 = t.app.commands.receiveStock({ supplierName: 'S1', lines: [{ productId: a.id, qty: 10, unitCost: 50 }, { productId: b.id, qty: 3, unitCost: 7 }] });
    assert.equal(r1.status, 'posted');
    assert.ok(/^RCPT-\d{8}-\d{4}$/.test(r1.receipt_no));
    assert.equal(t.app.queries.getStock(a.id, 1), 10);
    t.app.commands.receiveStock({ supplierName: 'S1', lines: [{ productId: a.id, qty: 4, unitCost: 55 }] });
    assert.equal(t.app.queries.getStock(a.id, 1), 14);
    const summary = t.app.queries.listStock('MAIN');
    const rowA = summary.rows.find((r) => r.sku === 'P-A');
    assert.equal(rowA.stock, 14);
  });

  it('is atomic: a bad line rolls back the whole receipt', () => {
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' });
    const before = t.app.queries.listReceipts({});
    assert.throws(() => t.app.commands.receiveStock({
      lines: [{ productId: a.id, qty: 5 }, { productId: 99999, qty: 5 }],
    }), (e) => e.code === 'NOT_FOUND');
    assert.deepEqual(t.app.queries.listReceipts({}).length, before.length);
    assert.equal(t.app.queries.getStock(a.id, 1), 0);
    assert.equal(t.app.queries.listMovements({ productId: a.id }).length, 0);
  });

  it('rejects duplicate receipt_no (double-submit safety)', () => {
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' });
    t.app.commands.receiveStock({ receiptNo: 'RCPT-DUP-1', lines: [{ productId: a.id, qty: 2 }] });
    assert.throws(() => t.app.commands.receiveStock({ receiptNo: 'RCPT-DUP-1', lines: [{ productId: a.id, qty: 2 }] }), (e) => e.code === 'CONFLICT');
    assert.equal(t.app.queries.getStock(a.id, 1), 2);
  });

  it('cancels via compensating reversal, never by editing history', () => {
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' });
    const r = t.app.commands.receiveStock({ lines: [{ productId: a.id, qty: 8, unitCost: 10 }] });
    const cancelled = t.app.commands.cancelReceipt(r.id, 'wrong supplier');
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(t.app.queries.getStock(a.id, 1), 0);
    const original = t.app.db.prepare('SELECT * FROM purchase_receipt_lines WHERE receipt_id = ?').all(r.id);
    assert.equal(original.length, 1);
    assert.equal(original[0].qty, 8); // original line untouched
    const movs = t.app.queries.listMovements({ productId: a.id });
    assert.equal(movs.length, 2);
    assert.deepEqual(movs.map((m) => m.qty).sort((x, y) => x - y), [-8, 8]);
    assert.throws(() => t.app.commands.cancelReceipt(r.id, 'again'), (e) => e.code === 'INVALID_STATE');
  });

  it('requires lines and positive integer quantities', () => {
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' });
    assert.throws(() => t.app.commands.receiveStock({ lines: [] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: a.id, qty: 0 }] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: a.id, qty: -3 }] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.cancelReceipt(1, ''), (e) => e.code === 'VALIDATION');
  });
});
