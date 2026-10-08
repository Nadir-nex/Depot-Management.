'use strict';
// Phase 07 gate: tariff CRUD, deterministic resolution hierarchy, pack prices,
// validity/priority, historical snapshot stability, explicit overrides.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('pricing', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  function product(sku = 'P-1', extra = {}) {
    return t.app.commands.createProduct({ sku, name: sku, defaultSalePrice: 100, ...extra });
  }

  it('creates scoped lists with validated codes, dates and priorities', () => {
    const g = t.app.commands.createPriceList({ code: 'retail', name: 'Retail' });
    assert.equal(g.code, 'RETAIL');
    assert.equal(g.scopeType, 'general');
    const ct = t.app.commands.createPriceList({ code: 'WHOLE', name: 'Wholesale', scopeType: 'customer_type', scopeKey: 'WS', priority: 5 });
    assert.equal(ct.scopeKey, 'WS');
    assert.throws(() => t.app.commands.createPriceList({ code: 'RETAIL', name: 'dup' }), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createPriceList({ code: 'X', name: 'x', scopeType: 'vip' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createPriceList({ code: 'X', name: 'x', scopeType: 'customer' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createPriceList({ code: 'X', name: 'x', scopeType: 'general', scopeKey: 'K' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createPriceList({ code: 'X', name: 'x', validFrom: '2026-05-01', validTo: '2026-04-01' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createPriceList({ code: 'X', name: 'x', validFrom: 'tomorrow' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createPriceList({ code: 'X', name: 'x', priority: -1 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createPriceList({ code: 'X', name: 'x' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    const renamed = t.app.commands.updatePriceList(g.id, { name: 'Retail 2', priority: 3 });
    assert.equal(renamed.name, 'Retail 2');
    assert.throws(() => t.app.commands.updatePriceList(g.id, { code: 'NEW' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.updatePriceList(g.id, {}), (e) => e.code === 'VALIDATION');
    assert.equal(t.app.commands.deletePriceList(g.id), true);
    assert.throws(() => t.app.commands.deletePriceList(g.id), (e) => e.code === 'NOT_FOUND');
  });

  it('upserts lines with integer money and validated references', () => {
    const p = product();
    const l = t.app.commands.createPriceList({ code: 'R', name: 'R' });
    const row = t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 120 });
    assert.equal(row.unit_price, 120);
    const again = t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 130 });
    assert.equal(again.id, row.id); // upsert: same row, new price
    assert.equal(t.app.queries.getPriceList(l.id).lines.length, 1);
    assert.throws(() => t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: -1 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 9.99 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.setPriceLine(l.id, { productId: 99999, unitPrice: 1 }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.setPriceLine(99999, { productId: p.id, unitPrice: 1 }), (e) => e.code === 'NOT_FOUND');
    assert.equal(t.app.commands.removePriceLine(l.id, { productId: p.id }), true);
    assert.throws(() => t.app.commands.removePriceLine(l.id, { productId: p.id }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 1 }, { actor: 'm', grants: ['products.edit'] }), (e) => e.code === 'FORBIDDEN');
  });

  it('resolves override → customer → tariff → general → default, documented', () => {
    const p = product('P-1'); // default 100
    const g = t.app.commands.createPriceList({ code: 'GEN', name: 'Gen' });
    const w = t.app.commands.createPriceList({ code: 'WS', name: 'WS', scopeType: 'customer_type', scopeKey: 'WS' });
    const c = t.app.commands.createPriceList({ code: 'C1', name: 'C1', scopeType: 'customer', scopeKey: 'CUST-1' });
    t.app.commands.setPriceLine(g.id, { productId: p.id, unitPrice: 110 });
    t.app.commands.setPriceLine(w.id, { productId: p.id, unitPrice: 90 });
    t.app.commands.setPriceLine(c.id, { productId: p.id, unitPrice: 80 });
    const anon = { productId: p.id };
    assert.deepEqual([t.app.queries.resolveSalePrice(anon).unitPrice, t.app.queries.resolveSalePrice(anon).source], [110, 'general-tariff']);
    const ws = { productId: p.id, customerTypeCode: 'WS' };
    assert.deepEqual([t.app.queries.resolveSalePrice(ws).unitPrice, t.app.queries.resolveSalePrice(ws).source], [90, 'tariff-product']);
    const cust = { productId: p.id, customerTypeCode: 'WS', customerCode: 'CUST-1' };
    const r = t.app.queries.resolveSalePrice(cust);
    assert.deepEqual([r.unitPrice, r.source, r.priceListCode], [80, 'customer-product', 'C1']);
    const ov = t.app.queries.resolveSalePrice({ ...cust, overridePrice: 75 });
    assert.deepEqual([ov.unitPrice, ov.source, ov.priceListId], [75, 'line-override', null]);
    const plain = t.app.commands.createProduct({ sku: 'P-2', name: 'P-2', defaultSalePrice: 55 });
    const d = t.app.queries.resolveSalePrice({ productId: plain.id });
    assert.deepEqual([d.unitPrice, d.source], [55, 'product-default']);
    assert.equal(r.taxClass, 'standard');
  });

  it('prefers pack lines inside a list and breaks priority ties deterministically', () => {
    const p = product();
    const box = t.app.commands.createPack(p.id, { name: 'Box 12', unitCode: 'BOX', qtyPerPack: 12 });
    const l = t.app.commands.createPriceList({ code: 'R', name: 'R' });
    t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 100 });
    t.app.commands.setPriceLine(l.id, { productId: p.id, packId: box.id, unitPrice: 1100 });
    const pack = t.app.queries.resolveSalePrice({ productId: p.id, packId: box.id });
    assert.deepEqual([pack.unitPrice, pack.pricePer, pack.packId], [1100, 'pack', box.id]);
    const base = t.app.queries.resolveSalePrice({ productId: p.id });
    assert.deepEqual([base.unitPrice, base.pricePer], [100, 'piece']);
    const q = t.app.commands.createProduct({ sku: 'Q-1', name: 'Q' });
    assert.throws(() => t.app.commands.setPriceLine(l.id, { productId: q.id, packId: box.id, unitPrice: 1 }), (e) => e.code === 'VALIDATION');
    // equal specificity: higher priority wins, then lowest list id
    const lo = t.app.commands.createPriceList({ code: 'LO', name: 'Lo', priority: 1 });
    const hi = t.app.commands.createPriceList({ code: 'HI', name: 'Hi', priority: 9 });
    t.app.commands.setPriceLine(lo.id, { productId: p.id, unitPrice: 200 });
    t.app.commands.setPriceLine(hi.id, { productId: p.id, unitPrice: 300 });
    assert.equal(t.app.queries.resolveSalePrice({ productId: p.id, packId: null }).priceListCode, 'HI');
    t.app.commands.deletePriceList(hi.id);
    t.app.commands.deletePriceList(lo.id);
    t.app.commands.removePriceLine(l.id, { productId: p.id }); // retire R's base line so A/B tiebreak is isolated
    const a = t.app.commands.createPriceList({ code: 'A', name: 'A' });
    const b = t.app.commands.createPriceList({ code: 'B', name: 'B' });
    t.app.commands.setPriceLine(a.id, { productId: p.id, unitPrice: 201 });
    t.app.commands.setPriceLine(b.id, { productId: p.id, unitPrice: 301 });
    assert.equal(t.app.queries.resolveSalePrice({ productId: p.id }).priceListCode, 'A');
  });

  it('ignores inactive and out-of-range lists', () => {
    const p = product();
    const l = t.app.commands.createPriceList({ code: 'OLD', name: 'Old', validFrom: '2020-01-01', validTo: '2020-12-31' });
    t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 10 });
    assert.equal(t.app.queries.resolveSalePrice({ productId: p.id, atDate: '2026-01-01' }).source, 'product-default');
    assert.equal(t.app.queries.resolveSalePrice({ productId: p.id, atDate: '2020-06-01' }).unitPrice, 10);
    t.app.commands.updatePriceList(l.id, { validFrom: null, validTo: null, isActive: false });
    assert.equal(t.app.queries.resolveSalePrice({ productId: p.id, atDate: '2020-06-01' }).source, 'product-default');
  });

  it('keeps posted history stable when tariffs change (snapshot rule)', () => {
    const p = product();
    const l = t.app.commands.createPriceList({ code: 'R', name: 'R' });
    t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 100 });
    const recorded = t.app.queries.resolveSalePrice({ productId: p.id }).unitPrice; // posted onto a doc line
    t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 140 });
    assert.equal(recorded, 100); // the recorded snapshot never moves
    assert.equal(t.app.queries.resolveSalePrice({ productId: p.id }).unitPrice, 140);
    t.app.commands.deletePriceList(l.id);
    assert.equal(t.app.queries.resolveSalePrice({ productId: p.id }).unitPrice, 100); // default again
  });

  it('rejects unknown products and mismatched packs in resolution', () => {
    assert.throws(() => t.app.queries.resolveSalePrice({ productId: 99999 }), (e) => e.code === 'NOT_FOUND');
    const p = product();
    const q = t.app.commands.createProduct({ sku: 'Q-9', name: 'Q' });
    const box = t.app.commands.createPack(p.id, { name: 'Box 12', unitCode: 'BOX', qtyPerPack: 12 });
    assert.throws(() => t.app.queries.resolveSalePrice({ productId: q.id, packId: box.id }), (e) => e.code === 'VALIDATION');
  });
});
