'use strict';
// Product catalog rules: create/list/validation, uniqueness, retention policy.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('products', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('creates and retrieves a product with audit trail', () => {
    const created = t.app.commands.createProduct({ sku: 'SUGAR-1KG', name: 'سكر 1كغ', defaultUnitCost: 120 }, 'test/user');
    assert.equal(created.sku, 'SUGAR-1KG');
    assert.equal(created.isActive, true);
    const got = t.app.queries.getProduct(created.id);
    assert.equal(got.name, 'سكر 1كغ');
    const audit = t.app.queries.recentAudit({ limit: 5 });
    assert.ok(audit.some((a) => a.operation === 'product.create' && a.entity_id === created.id));
  });

  it('rejects duplicate sku and duplicate barcode', () => {
    t.app.commands.createProduct({ sku: 'A-1', name: 'Alpha', barcode: 'BC1' });
    assert.throws(() => t.app.commands.createProduct({ sku: 'A-1', name: 'Alpha 2' }), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createProduct({ sku: 'A-2', name: 'Alpha 3', barcode: 'BC1' }), (e) => e.code === 'CONFLICT');
  });

  it('rejects invalid input (empty name, bad sku, negative cost)', () => {
    assert.throws(() => t.app.commands.createProduct({ sku: '', name: 'x' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createProduct({ sku: 'A-1', name: '' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createProduct({ sku: 'A-1', name: 'x', defaultUnitCost: -5 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createProduct({ sku: 'A-1', name: 'x', defaultUnitCost: 1.5 }), (e) => e.code === 'VALIDATION');
  });

  it('deactivates instead of deleting history-bearing products', () => {
    const p = t.app.commands.createProduct({ sku: 'FLOUR-1KG', name: 'فارينا' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 5, unitCost: 100 }] });
    assert.throws(() => t.app.commands.deleteProduct(p.id), (e) => e.code === 'CONFLICT');
    const off = t.app.commands.setProductActive(p.id, false);
    assert.equal(off.isActive, false);
    // inactive product still readable (history preserved) but cannot receive stock
    assert.equal(t.app.queries.getProduct(p.id).isActive, false);
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'INVALID_STATE');
  });

  it('hard-deletes products with no history', () => {
    const p = t.app.commands.createProduct({ sku: 'TMP-1', name: 'Temp' });
    assert.equal(t.app.commands.deleteProduct(p.id), true);
    assert.throws(() => t.app.queries.getProduct(p.id), (e) => e.code === 'NOT_FOUND');
  });
});
