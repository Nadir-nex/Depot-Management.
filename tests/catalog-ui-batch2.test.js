'use strict';
// Batch 2 gate: catalog UI contract — every control in the articles workspace
// maps to a real application API with its exact payload shape. No renderer
// persistence, no unsupported controls presented as working.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTestApp, closeTestApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');

describe('batch2 catalog UI contract', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('product full shape: create with category/type/tax/min/flags/notes, edit, toggle, delete guard', () => {
    const cat = t.app.commands.createCategory({ name: 'Food' });
    const p = t.app.commands.createProduct({
      sku: 'B2-1', name: 'Batch2 item', categoryId: cat.id,
      productType: 'goods', barcode: 'B2BC1',
      defaultUnitCost: 50, defaultSalePrice: 120, taxClass: 'exempt',
      minStock: 7, allowNegativeStock: false, serialTracking: false, notes: 'ui probe',
    });
    assert.equal(p.sku, 'B2-1');
    assert.equal(p.categoryId, cat.id);
    assert.equal(p.minStock, 7);
    const got = t.app.queries.getProduct(p.id);
    assert.equal(got.name, 'Batch2 item');
    const upd = t.app.commands.updateProduct(p.id, { name: 'Batch2 renamed', defaultSalePrice: 130, minStock: 5, taxClass: 'standard' });
    assert.equal(upd.name, 'Batch2 renamed');
    assert.throws(() => t.app.commands.updateProduct(p.id, { sku: 'NEW' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.updateProduct(p.id, {}), (e) => e.code === 'VALIDATION');
    t.app.commands.setProductActive(p.id, false);
    assert.equal(t.app.queries.getProduct(p.id).isActive, false);
    assert.equal(t.app.commands.deleteProduct(p.id), true);
    assert.throws(() => t.app.queries.getProduct(p.id), (e) => e.code === 'NOT_FOUND');
    const q = t.app.commands.createProduct({ sku: 'B2-HIST', name: 'hist' });
    t.app.commands.receiveStock({ lines: [{ productId: q.id, qty: 3 }] });
    assert.throws(() => t.app.commands.deleteProduct(q.id), (e) => e.code === 'CONFLICT');
  });

  it('categories/units/packs/barcodes round-trip with UI payloads', () => {
    const root = t.app.commands.createCategory({ name: 'B2Cat' });
    const p = t.app.commands.createProduct({ sku: 'B2-P', name: 'p' });
    t.app.commands.updateProduct(p.id, { categoryId: root.id });
    assert.throws(() => t.app.commands.deleteCategory(root.id), (e) => e.code === 'CONFLICT');
    t.app.commands.updateProduct(p.id, { categoryId: null });
    assert.equal(t.app.commands.deleteCategory(root.id), true);
    const u = t.app.commands.createUnit({ code: 'b2box', name: 'B2 box' });
    assert.equal(u.code, 'B2BOX');
    const pack = t.app.commands.createPack(p.id, { name: 'Box 6', unitCode: 'B2BOX', qtyPerPack: 6 });
    assert.equal(pack.qty_per_pack, 6);
    assert.equal(t.app.queries.listPacks(p.id).length, 1);
    const bc = t.app.commands.addBarcode(p.id, { code: 'B2-CODE-1', packId: pack.id });
    assert.equal(bc.code, 'B2-CODE-1');
    assert.ok(t.app.queries.listBarcodes(p.id).length >= 1);
    assert.ok(t.app.queries.resolveBarcode('B2-CODE-1'));
    assert.equal(t.app.commands.removeBarcode(bc.id), true);
  });

  it('price lists/lines/resolve round-trip with integer money', () => {
    const p = t.app.commands.createProduct({ sku: 'B2-PR', name: 'pr', defaultSalePrice: 100 });
    const l = t.app.commands.createPriceList({ code: 'B2R', name: 'B2 retail' });
    const row = t.app.commands.setPriceLine(l.id, { productId: p.id, unitPrice: 140 });
    assert.equal(row.unit_price, 140);
    const r = t.app.queries.resolveSalePrice({ productId: p.id });
    assert.equal(r.unitPrice, 140);
    assert.equal(t.app.commands.removePriceLine(l.id, { productId: p.id }), true);
    const back = t.app.queries.resolveSalePrice({ productId: p.id });
    assert.equal(back.unitPrice, 100);
    const renamed = t.app.commands.updatePriceList(l.id, { name: 'B2 retail 2' });
    assert.equal(renamed.name, 'B2 retail 2');
    assert.equal(t.app.commands.deletePriceList(l.id), true);
  });

  it('lots/serials: create/list/suggest use warehouse ids, no fake stock', () => {
    const p = t.app.commands.createProduct({ sku: 'B2-L', name: 'lot item' });
    const lot = t.app.commands.createLot(p.id, { lotNo: 'LOT-B2', expiryDate: '2030-01-01' });
    assert.equal(lot.lot_no, 'LOT-B2');
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 8, lotId: lot.id }] });
    const rows = t.app.queries.listLots(p.id, { warehouseId: 1 });
    assert.equal(rows.find((x) => x.lot_no === 'LOT-B2').stock, 8);
    const sug = t.app.queries.suggestLots({ productId: p.id, warehouseId: 1, qty: 5, policy: 'fefo' });
    assert.equal(sug[0].lotNo, 'LOT-B2');
    assert.throws(() => t.app.commands.deleteLot(lot.id), (e) => e.code === 'CONFLICT');
    assert.ok(Array.isArray(t.app.queries.listSerials(p.id, null)));
  });

  it('frontend wires only supported catalog methods, marks gaps honestly', () => {
    const must = [
      'api.listProducts', 'api.getProduct', 'api.createProduct', 'api.updateProduct',
      'api.setProductActive', 'api.deleteProduct',
      'api.listCategories', 'api.createCategory', 'api.deleteCategory',
      'api.listUnits', 'api.createUnit',
      'api.listPacks', 'api.createPack',
      'api.listBarcodes', 'api.addBarcode', 'api.removeBarcode', 'api.resolveBarcode',
      'api.listPriceLists', 'api.getPriceList', 'api.createPriceList',
      'api.updatePriceList', 'api.deletePriceList',
      'api.setPriceLine', 'api.removePriceLine', 'api.resolveSalePrice',
      'api.listLots', 'api.createLot', 'api.deleteLot', 'api.suggestLots', 'api.listSerials',
    ];
    for (const m of must) assert.ok(FRONT.includes(m), `frontend must call ${m}`);
    const banned = ['deleteUnit', 'updateUnit', 'deletePack', 'updatePack', 'updateCategory'];
    for (const b of banned) assert.ok(!FRONT.includes(b), `frontend must not claim ${b}`);
    assert.ok(FRONT.includes('SKU') && FRONT.includes('immutable'), 'sku immutability explained');
    assert.ok(/manualEntry|Manual|scanner|hardware/i.test(FRONT), 'barcode manual-entry scope stated');
  });

  it('renderer stays display-only after batch 2', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
  });
});
