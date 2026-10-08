'use strict';
// Phase 06 gate: categories, units, packs, single barcode system, backfill.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toBasePieces, toPacksExact } = require('../src/domain/catalog');
const { openDatabase } = require('../src/db');
const { migrate } = require('../src/db/migrate');
const productsApp = require('../src/application/products');
const { makeTestApp, closeTestApp } = require('./helpers');

const REPO_ROOT = path.join(__dirname, '..');
const SRC_MIGRATIONS = path.join(REPO_ROOT, 'src', 'db', 'migrations');

describe('catalog', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('ships PCS/BOX/KG and registers new units by normalized code', () => {
    const codes = t.app.queries.listUnits().map((u) => u.code);
    assert.ok(codes.includes('PCS') && codes.includes('BOX') && codes.includes('KG'));
    const u = t.app.commands.createUnit({ code: 'carton', name: 'Carton' });
    assert.equal(u.code, 'CARTON');
    assert.throws(() => t.app.commands.createUnit({ code: 'BOX', name: 'dup' }), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createUnit({ code: '!!', name: 'bad' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createUnit({ code: 'X1', name: 'x' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
  });

  it('nests categories, rejects duplicate siblings, guards parents', () => {
    const root = t.app.commands.createCategory({ name: 'Food' });
    const sub = t.app.commands.createCategory({ name: 'Pasta', parentId: root.id });
    assert.equal(sub.parent_id, root.id);
    assert.throws(() => t.app.commands.createCategory({ name: 'Food' }), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createCategory({ name: 'Pasta', parentId: root.id }), (e) => e.code === 'CONFLICT');
    const other = t.app.commands.createCategory({ name: 'Drinks' });
    const ok = t.app.commands.createCategory({ name: 'Pasta', parentId: other.id });
    assert.ok(ok.id); // same name under a different parent is fine
    assert.throws(() => t.app.commands.createCategory({ name: '' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createCategory({ name: 'Ghost', parentId: 99999 }), (e) => e.code === 'NOT_FOUND');
    const tree = t.app.queries.getCategoryTree();
    const food = tree.find((c) => c.name === 'Food');
    assert.equal(food.children.map((c) => c.name).join(','), 'Pasta');
    assert.throws(() => t.app.commands.createCategory({ name: 'x' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
  });

  it('deletes only empty leaf categories', () => {
    const root = t.app.commands.createCategory({ name: 'Food' });
    t.app.commands.createCategory({ name: 'Pasta', parentId: root.id });
    assert.throws(() => t.app.commands.deleteCategory(root.id), (e) => e.code === 'CONFLICT');
    const p = t.app.commands.createProduct({ sku: 'C-1', name: 'C' });
    t.app.commands.updateProduct(p.id, { categoryId: root.id });
    const leaf = t.app.queries.listCategories().find((c) => c.name === 'Pasta');
    assert.equal(t.app.commands.deleteCategory(leaf.id), true);
    assert.throws(() => t.app.commands.deleteCategory(root.id), (e) => e.code === 'CONFLICT'); // product linked
    t.app.commands.updateProduct(p.id, { categoryId: null });
    assert.equal(t.app.queries.getProduct(p.id).categoryId, null);
    assert.equal(t.app.commands.deleteCategory(root.id), true);
    assert.throws(() => t.app.commands.updateProduct(p.id, { categoryId: 99999 }), (e) => e.code === 'NOT_FOUND');
  });

  it('converts packs by exact integer math, never fractions', () => {
    assert.equal(toBasePieces(3, 12), 36);
    assert.equal(toPacksExact(36, 12), 3);
    assert.throws(() => toPacksExact(35, 12), (e) => e.code === 'VALIDATION');
    assert.throws(() => toBasePieces(0, 12), (e) => e.code === 'VALIDATION');
    assert.throws(() => toBasePieces(2, 0), (e) => e.code === 'VALIDATION');
  });

  it('creates packs per product with validated units and quantities', () => {
    const p = t.app.commands.createProduct({ sku: 'P-1', name: 'P' });
    const box = t.app.commands.createPack(p.id, { name: 'Box 12', unitCode: 'box', qtyPerPack: 12 });
    assert.equal(box.qty_per_pack, 12);
    assert.equal(box.unit_code, 'BOX');
    assert.throws(() => t.app.commands.createPack(p.id, { name: 'Box 12', unitCode: 'PCS', qtyPerPack: 1 }), (e) => e.code === 'CONFLICT');
    const q = t.app.commands.createProduct({ sku: 'P-2', name: 'Q' });
    assert.ok(t.app.commands.createPack(q.id, { name: 'Box 12', unitCode: 'BOX', qtyPerPack: 12 })); // same name, other product
    assert.throws(() => t.app.commands.createPack(p.id, { name: 'Bad', unitCode: 'CRATE', qtyPerPack: 2 }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.createPack(p.id, { name: 'Bad', unitCode: 'BOX', qtyPerPack: 0 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createPack(99999, { name: 'Bad', unitCode: 'BOX', qtyPerPack: 1 }), (e) => e.code === 'NOT_FOUND');
    assert.equal(t.app.queries.listPacks(p.id).length, 1);
  });

  it('resolves every barcode through one lookup; duplicates rejected', () => {
    const p = t.app.commands.createProduct({ sku: 'B-1', name: 'B', barcode: 'PRIMARY-1' });
    const box = t.app.commands.createPack(p.id, { name: 'Box 12', unitCode: 'BOX', qtyPerPack: 12 });
    t.app.commands.addBarcode(p.id, { code: 'BOX-1', packId: box.id });
    const byPrimary = t.app.queries.resolveBarcode('PRIMARY-1');
    assert.equal(byPrimary.product_sku, 'B-1');
    assert.equal(byPrimary.pack_id, null);
    const byPack = t.app.queries.resolveBarcode('BOX-1');
    assert.equal(byPack.pack_name, 'Box 12');
    assert.equal(byPack.qty_per_pack, 12);
    assert.equal(t.app.queries.resolveBarcode('NOPE'), null);
    assert.equal(t.app.queries.resolveBarcode(''), null);
    const q = t.app.commands.createProduct({ sku: 'B-2', name: 'B2' });
    assert.throws(() => t.app.commands.addBarcode(q.id, { code: 'BOX-1' }), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.addBarcode(q.id, { code: 'BOX-1' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    const other = t.app.commands.createProduct({ sku: 'B-3', name: 'B3' });
    assert.throws(() => t.app.commands.addBarcode(other.id, { code: 'X', packId: box.id }), (e) => e.code === 'VALIDATION'); // pack of another product
  });

  it('keeps exactly one preferred barcode with oldest-survivor promotion', () => {
    const p = t.app.commands.createProduct({ sku: 'PR-1', name: 'P', barcode: 'FIRST' });
    t.app.commands.addBarcode(p.id, { code: 'SECOND' });
    let rows = t.app.queries.listBarcodes(p.id);
    assert.deepEqual(rows.map((r) => [r.code, r.is_preferred]), [['FIRST', 1], ['SECOND', 0]]);
    t.app.commands.removeBarcode(rows[0].id); // drop preferred
    rows = t.app.queries.listBarcodes(p.id);
    assert.deepEqual(rows.map((r) => [r.code, r.is_preferred]), [['SECOND', 1]]);
    t.app.commands.updateProduct(p.id, { barcode: 'THIRD' }); // replace via product edit
    rows = t.app.queries.listBarcodes(p.id);
    assert.deepEqual(rows.map((r) => r.code), ['THIRD']);
    assert.equal(t.app.queries.resolveBarcode('SECOND'), null);
    t.app.commands.updateProduct(p.id, { barcode: null }); // clear
    assert.equal(t.app.queries.listBarcodes(p.id).length, 0);
    assert.throws(() => t.app.commands.removeBarcode(99999), (e) => e.code === 'NOT_FOUND');
  });

  it('receives whole packs into base-piece stock with an exact paper trail', () => {
    const p = t.app.commands.createProduct({ sku: 'PK-1', name: 'P' });
    const box = t.app.commands.createPack(p.id, { name: 'Box 12', unitCode: 'BOX', qtyPerPack: 12 });
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, packId: box.id, packs: 3, unitCost: 10 }] });
    assert.equal(t.app.queries.getStock(p.id, 1), 36);
    const mov = t.app.queries.listMovements({ productId: p.id });
    assert.equal(mov.length, 1);
    assert.equal(mov[0].qty, 36);
    assert.match(mov[0].notes, /Box 12/);
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, packId: box.id, packs: 0 }] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, packId: box.id, packs: 1, qty: 5 }] }), (e) => e.code === 'VALIDATION');
    const q = t.app.commands.createProduct({ sku: 'PK-2', name: 'Q' });
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: q.id, packId: box.id, packs: 1 }] }), (e) => e.code === 'VALIDATION');
  });

  it('backfills the legacy barcode column into preferred rows, then drops it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-backfill-'));
    for (const f of ['001_core.sql', '002_stock.sql', '003_audit_fields.sql', '004_product_master.sql']) {
      fs.copyFileSync(path.join(SRC_MIGRATIONS, f), path.join(dir, f));
    }
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'depot-backfill-db-')), 'old.sqlite');
    const db = openDatabase(dbPath);
    try {
      migrate(db, { dbPath, backup: false, migrationsDir: dir });
      // Raw legacy-shape insert (pre-005 columns, incl. barcode).
      db.prepare(`INSERT INTO products (sku, name, barcode, product_type, is_active, default_unit_cost,
        default_sale_price, tax_class, min_stock, notes, created_at, updated_at)
        VALUES ('LEG-1', 'Legacy', 'LEGACY-BC', 'goods', 1, 0, 0, 'standard', 0, '', ?, ?)`)
        .run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      fs.copyFileSync(path.join(SRC_MIGRATIONS, '005_catalog_units.sql'), path.join(dir, '005_catalog_units.sql'));
      const out = migrate(db, { dbPath, backup: false, migrationsDir: dir });
      assert.deepEqual(out.ran, ['005_catalog_units.sql']);
      const cols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
      assert.ok(!cols.includes('barcode'), 'legacy column must be gone: single barcode system');
      assert.ok(cols.includes('category_id'));
      const row = db.prepare('SELECT * FROM product_barcodes WHERE code = ?').get('LEGACY-BC');
      assert.ok(row && row.is_preferred === 1, 'backfilled code must be preferred');
      // New API works on the migrated database:
      const found = productsApp.listProducts(db, { search: 'LEGACY-BC' });
      assert.equal(found.length, 1);
      assert.equal(found[0].sku, 'LEG-1');
    } finally {
      db.close();
    }
  });

  it('searches products by any registered barcode', () => {
    const p = t.app.commands.createProduct({ sku: 'S-1', name: 'Searchable', barcode: 'SEARCH-9' });
    assert.equal(t.app.queries.listProducts({ search: 'SEARCH-9' }).length, 1);
    assert.equal(t.app.queries.listProducts({ search: 'SEARCH-9' })[0].id, p.id);
    assert.equal(t.app.queries.listProducts({ search: 'NO-MATCH-XYZ' }).length, 0);
  });
});
