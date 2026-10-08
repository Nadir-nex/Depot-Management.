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

  it('stores the full P05 master record with sane defaults', () => {
    const full = t.app.commands.createProduct({
      sku: 'FULL-1', name: 'Full', barcode: 'FULLBC', productType: 'goods',
      defaultUnitCost: 100, defaultSalePrice: 150, taxClass: 'exempt', minStock: 12,
      notes: 'fragile',
    });
    assert.equal(full.productType, 'goods');
    assert.equal(full.defaultSalePrice, 150);
    assert.equal(full.taxClass, 'exempt');
    assert.equal(full.minStock, 12);
    const minimal = t.app.commands.createProduct({ sku: 'MIN-1', name: 'Min' });
    assert.equal(minimal.productType, 'goods');
    assert.equal(minimal.defaultSalePrice, 0);
    assert.equal(minimal.taxClass, 'standard');
    assert.equal(minimal.minStock, 0);
  });

  it('rejects invalid master values (type, tax, negative price/threshold)', () => {
    assert.throws(() => t.app.commands.createProduct({ sku: 'B-1', name: 'x', productType: 'bundle' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createProduct({ sku: 'B-2', name: 'x', taxClass: 'reduced' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createProduct({ sku: 'B-3', name: 'x', defaultSalePrice: -1 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createProduct({ sku: 'B-4', name: 'x', defaultSalePrice: 9.99 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createProduct({ sku: 'B-5', name: 'x', minStock: -1 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createProduct({ sku: 'B-6', name: 'x', minStock: 2.5 }), (e) => e.code === 'VALIDATION');
  });

  it('updates the catalog with sku immutable and conflicts mapped', () => {
    const p = t.app.commands.createProduct({ sku: 'U-1', name: 'Old', barcode: 'UBC1', defaultSalePrice: 100 }, 'ed');
    const updated = t.app.commands.updateProduct(p.id, { name: 'New', defaultSalePrice: 130, minStock: 5, taxClass: 'exempt' }, 'ed');
    assert.equal(updated.name, 'New');
    assert.equal(updated.defaultSalePrice, 130);
    assert.equal(updated.sku, 'U-1');
    const audit = t.app.queries.recentAudit({ limit: 3 });
    assert.equal(audit[0].operation, 'product.update');
    assert.match(audit[0].after_summary, /name/);
    assert.throws(() => t.app.commands.updateProduct(p.id, { sku: 'U-2' }, 'ed'), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.updateProduct(p.id, {}, 'ed'), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.updateProduct(99999, { name: 'x' }, 'ed'), (e) => e.code === 'NOT_FOUND');
    t.app.commands.createProduct({ sku: 'U-2', name: 'Other', barcode: 'UBC2' });
    assert.throws(() => t.app.commands.updateProduct(p.id, { barcode: 'UBC2' }, 'ed'), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.updateProduct(p.id, { name: 'Hack' }, { actor: 'mallory', grants: [] }), (e) => e.code === 'FORBIDDEN');
  });

  it('keeps history readable after deactivation (inactive product still referenced)', () => {
    const p = t.app.commands.createProduct({ sku: 'H-1', name: 'Hist' });
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 7, unitCost: 50 }] });
    t.app.commands.setProductActive(p.id, false);
    const receipt = t.app.queries.getReceipt(r.id);
    assert.equal(receipt.lines.length, 1);
    assert.equal(t.app.queries.getProduct(receipt.lines[0].product_id).sku, 'H-1');
    const row = t.app.queries.listStock('MAIN').rows.find((x) => x.sku === 'H-1');
    assert.equal(row.stock, 7); // ledger untouched by deactivation
  });

  it('rejects stock movements for service products (no stock by definition)', () => {
    const s = t.app.commands.createProduct({ sku: 'SVC-1', name: 'Delivery fee', productType: 'service' });
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: s.id, qty: 1 }] }), (e) => e.code === 'INVALID_STATE');
    assert.equal(t.app.queries.getStock(s.id, 1), 0);
    assert.equal(t.app.queries.listMovements({ productId: s.id }).length, 0);
  });
});
