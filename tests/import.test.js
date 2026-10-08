'use strict';
// Phase 22 gate: the source database migrates without being touched —
// staged, linked, reconciled, deterministic, idempotent; export round-trips.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { makeTestApp, closeTestApp } = require('./helpers');
const { readSourceDatabase } = require('../src/infrastructure/import/sourceReader');
const { runSourceImport, IMPORT_AUTH } = require('../src/application/import');
const { exportSnapshot } = require('../src/application/export');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function buildSourceFixture(dir) {
  const file = path.join(dir, 'source.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, color TEXT);
    CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT, color TEXT);
    CREATE TABLE customer_types (id INTEGER PRIMARY KEY, name TEXT, markup_percentage REAL, created_at TEXT);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, district_id INTEGER, latitude REAL, longitude REAL,
      notes TEXT, deleted_at TEXT, created_at TEXT, updated_at TEXT, customer_type_id INTEGER);
    CREATE TABLE customer_phones (id INTEGER PRIMARY KEY, customer_id INTEGER, phone_number TEXT, created_at TEXT);
    CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, barcode TEXT, category_id INTEGER, company_id INTEGER, created_at TEXT);
    CREATE TABLE product_costs (item_id INTEGER PRIMARY KEY, current_cost REAL, updated_at TEXT);
    CREATE TABLE product_prices (id INTEGER PRIMARY KEY, item_id INTEGER, customer_type_id INTEGER,
      auto_price REAL, manual_price REAL, created_at TEXT, updated_at TEXT);
    CREATE TABLE product_price_history (id INTEGER PRIMARY KEY, item_id INTEGER, customer_type_id INTEGER,
      price_value REAL, change_type TEXT, changed_at TEXT);
    CREATE TABLE shipments (id INTEGER PRIMARY KEY, item_id INTEGER, qty INTEGER, buy_price REAL, sell_price REAL,
      expiry_date TEXT, supplier TEXT, created_at TEXT);
    CREATE TABLE vehicles (id INTEGER PRIMARY KEY, name TEXT, plate_number TEXT, notes TEXT, is_available INTEGER,
      deleted_at TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, delivery_date TEXT, status TEXT,
      discount_amount REAL, notes TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, item_id INTEGER, qty REAL, unit_price REAL,
      created_at TEXT, is_manual INTEGER);
    CREATE TABLE deliveries (id INTEGER PRIMARY KEY, district_id INTEGER, driver_id INTEGER, vehicle_id INTEGER,
      delivery_date TEXT, status TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE delivery_stops (id INTEGER PRIMARY KEY, delivery_id INTEGER, customer_id INTEGER, sequence INTEGER);
    CREATE TABLE delivery_orders (id INTEGER PRIMARY KEY, delivery_id INTEGER, order_id INTEGER);
    CREATE TABLE districts (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
    CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, notes TEXT, deleted_at TEXT);
    CREATE TABLE employee_roles (employee_id INTEGER, role TEXT);
    CREATE TABLE employee_phones (id INTEGER PRIMARY KEY, employee_id INTEGER, phone_number TEXT);

    INSERT INTO categories VALUES (1, 'milk', '#ffffff'), (2, 'bo', '#0288d1');
    INSERT INTO companies VALUES (1, 'condor', '#1b4498');
    INSERT INTO customer_types VALUES (6, 'kisq', 2.0, '2026-10-02T09:34:29Z');
    INSERT INTO customers VALUES
      (33, 'Active Shop', NULL, NULL, NULL, 'good pay', NULL, '2026-10-01T17:10:54Z', '2026-10-01T17:10:54Z', 6),
      (34, 'Gone Shop', NULL, NULL, NULL, '', '2026-10-01T19:35:11Z', '2026-10-01T17:10:54Z', '2026-10-01T19:35:11Z', NULL);
    INSERT INTO customer_phones VALUES (1, 33, '+213551234567', '2026-10-01T17:10:54Z');
    INSERT INTO items VALUES
      (31, 'LUMEX 12W BLANC', NULL, 1, 1, '2026-10-01T17:26:44Z'),
      (32, 'SUGAR 1KG', '6130000000017', 2, NULL, '2026-10-01T17:26:44Z'),
      (33, 'FLOUR 1KG', NULL, NULL, NULL, '2026-10-01T17:26:44Z');
    INSERT INTO product_costs VALUES (31, 100.0, '2026-10-02T09:57:10Z'), (32, 0.0, '2026-10-02T09:57:10Z'), (33, 0.5, '2026-10-02T09:57:10Z');
    INSERT INTO product_prices VALUES
      (18, 31, 6, 102.0, NULL, '2026-10-02T10:11:12Z', '2026-10-02T10:11:12Z'),
      (62, 32, 6, 55.5, 60.0, '2026-10-02T10:25:31Z', '2026-10-02T17:31:08Z');
    INSERT INTO product_price_history VALUES
      (266, 31, 6, 102.0, 'automatic', '2026-10-02T17:30:57Z'),
      (267, 32, 6, 55.5, 'automatic', '2026-10-02T17:31:08Z');
    INSERT INTO shipments VALUES (9, 31, 12, 90.0, 102.0, '2027-06-30', 'Condor SARL', '2026-09-01T08:00:00Z');
    INSERT INTO vehicles VALUES (7, 'Truck', '1234 AB', 'fleet unit', 1, NULL, '2026-10-01T17:00:00Z', '2026-10-01T17:00:00Z');
    INSERT INTO orders VALUES (1, 33, '2026-10-05', 'weird_unknown_state', 0, '', '2026-10-05T09:00:00Z', '2026-10-05T09:00:00Z');
    INSERT INTO order_items VALUES (1, 1, 31, 2, 102.0, '2026-10-05T09:00:00Z', 0);
    INSERT INTO districts VALUES (1, 'Center', '2026-10-01T17:00:00Z');
    INSERT INTO employees VALUES (1, 'Karim', 'driver-side', NULL);
    INSERT INTO employee_roles VALUES (1, 'driver');
  `);
  db.close();
  return file;
}

function rawCounts(dbPath) {
  const raw = new DatabaseSync(dbPath);
  try {
    const n = (sql, ...args) => Number(raw.prepare(sql).get(...args).n);
    return {
      batches: n('SELECT COUNT(*) n FROM import_batches'),
      dryRunBatches: n("SELECT COUNT(*) n FROM import_batches WHERE mode = 'dry_run'"),
      applyBatches: n("SELECT COUNT(*) n FROM import_batches WHERE mode = 'apply'"),
      stage: n('SELECT COUNT(*) n FROM import_stage'),
      links: n('SELECT COUNT(*) n FROM source_links'),
      products: n('SELECT COUNT(*) n FROM products'),
      parties: n('SELECT COUNT(*) n FROM parties'),
      receipts: n('SELECT COUNT(*) n FROM purchase_receipts'),
      stockQty: n('SELECT COALESCE(SUM(qty), 0) n FROM stock_movements'),
      priceLines: n('SELECT COUNT(*) n FROM price_list_lines'),
      priceLists: n('SELECT COUNT(*) n FROM price_lists'),
      vehicles: n('SELECT COUNT(*) n FROM fleet_vehicles'),
      categories: n('SELECT COUNT(*) n FROM product_categories'),
      documents: n('SELECT COUNT(*) n FROM documents'),
    };
  } finally { raw.close(); }
}

describe('source import', () => {
  let t, fixture, fingerprintBefore;
  beforeEach(() => {
    t = makeTestApp();
    fixture = buildSourceFixture(t.dir);
    fingerprintBefore = sha256(fixture);
  });
  afterEach(() => { closeTestApp(t); });

  it('previews without touching business data (dry-run)', () => {
    const source = readSourceDatabase(fixture);
    const report = runSourceImport(t.app.db, source, { apply: false });
    assert.equal(report.mode, 'dry_run');
    assert.equal(report.errors.length, 0);
    assert.equal(report.actions.product.create, 3);
    assert.equal(report.actions.customer.create, 1);
    assert.equal(report.actions.customer.skip, 1);
    assert.equal(report.reconciliation.products.ok, false); // nothing imported yet
    const counts = rawCounts(t.dbPath);
    assert.equal(counts.batches, 1);
    assert.equal(counts.dryRunBatches, 1);
    assert.equal(counts.stage, 0); // staging happens on apply only
    assert.equal(counts.links, 0);
    assert.equal(counts.products, 0);
    assert.equal(counts.parties, 0);
    assert.equal(sha256(fixture), fingerprintBefore);
  });

  it('refuses without the full permission set', () => {
    const source = readSourceDatabase(fixture);
    assert.throws(
      () => runSourceImport(t.app.db, source, { apply: false, actorOrAuth: { actor: 'x', grants: ['products.edit'] } }),
      (e) => e.code === 'FORBIDDEN'
    );
    assert.equal(rawCounts(t.dbPath).batches, 0); // gate fires before any write
    void IMPORT_AUTH;
  });

  it('imports master data, prices, stock and parties with traceable links', () => {
    const source = readSourceDatabase(fixture);
    const report = runSourceImport(t.app.db, source, { apply: true });
    assert.equal(report.mode, 'apply');
    assert.equal(report.errors.length, 0);
    assert.deepEqual(
      { c: report.actions.category.create, l: report.actions.price_list.create, p: report.actions.product.create,
        pl: report.actions.price_line.create, cu: report.actions.customer.create, v: report.actions.vehicle.create,
        s: report.actions.supplier.create, r: report.actions.receipt.create },
      { c: 2, l: 1, p: 3, pl: 2, cu: 1, v: 1, s: 1, r: 1 }
    );
    assert.equal(report.actions.customer.skip, 1); // soft-deleted row stays deleted
    assert.equal(report.reconciliation.products.ok, true);
    assert.equal(report.reconciliation.customers.ok, true);
    assert.equal(report.reconciliation.suppliers.ok, true);
    assert.equal(report.reconciliation.openingStock.ok, true);
    assert.equal(report.reconciliation.orders.deferred, true);
    assert.equal(report.customerTypes[0].markupPercentage, 2); // markup: report-only, documented

    const app = t.app;
    const bySku = (sku) => app.queries.listProducts({ search: sku }).find((p) => p.sku === sku);
    const p31 = bySku('LEG-31');
    assert.ok(p31, 'LEG-31 imported');
    assert.equal(p31.defaultUnitCost, 10000); // 100 → minor units
    assert.equal(p31.notes, 'brand: condor'); // company folded into notes
    const p32 = bySku('LEG-32');
    assert.ok(app.queries.listProducts({ search: '6130000000017' }).some((p) => p.sku === 'LEG-32')); // barcode searchable
    const p33 = bySku('LEG-33');
    assert.equal(p33.defaultUnitCost, 50); // 0.5 → exact minor units

    const lists = app.queries.listPriceLists();
    const lct6 = lists.find((l) => l.code === 'LCT-6');
    assert.equal(lct6.scopeType, 'customer_type');
    const lines = app.queries.getPriceList(lct6.id).lines;
    const line31 = lines.find((l) => l.product_id === p31.id);
    assert.equal(line31.unit_price, 10200); // 102 whole → 10200 minor
    const line32 = lines.find((l) => l.product_id === p32.id);
    assert.equal(line32.unit_price, 6000); // manual 60 beats auto 55.5

    const parties = app.queries.listParties({});
    const cust = parties.find((p) => p.code === 'LGC-33');
    assert.ok(cust, 'active customer imported');
    assert.equal(cust.customerTypeCode, 'LCT-6');
    assert.equal(cust.phone, '+213551234567');
    assert.ok(cust.roles.includes('customer'));
    assert.ok(!parties.some((p) => p.code === 'LGC-34'), 'deleted customer not imported');
    const supp = parties.find((p) => p.code === 'LGS-CONDOR-SARL');
    assert.ok(supp.roles.includes('supplier'));

    assert.ok(app.queries.listVehicles().some((v) => v.code === 'LGV-7'));
    const receipts = app.queries.listReceipts({ limit: 50 });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].receipt_no, 'LEG-RCP-9');
    assert.equal(app.queries.getStock(p31.id, 1), 12); // opening stock landed once

    const counts = rawCounts(t.dbPath);
    assert.equal(counts.stage, 24); // every source row staged
    assert.equal(counts.products, 3);
    assert.equal(counts.parties, 2); // customer + supplier
    assert.equal(counts.priceLines, 2);
    assert.equal(counts.vehicles, 1);
    assert.equal(counts.documents, 0); // orders deferred, never guessed
    assert.equal(counts.links, 2 + 1 + 3 + 2 + 1 + 1 + 1); // category/list/product/line/customer/vehicle/receipt
    assert.ok(report.deferred.some((d) => d.table === 'orders' && d.rows === 1));
    assert.ok(report.deferred.some((d) => d.table === 'product_price_history' && d.rows === 2));
    assert.equal(report.staged.orders, 1);
    assert.equal(sha256(fixture), fingerprintBefore); // source never written
  });

  it('is idempotent on re-run and deterministic across fresh targets', () => {
    const source = readSourceDatabase(fixture);
    const first = runSourceImport(t.app.db, source, { apply: true });
    const afterFirst = rawCounts(t.dbPath);
    const second = runSourceImport(t.app.db, source, { apply: true });
    assert.equal(second.errors.length, 0);
    assert.equal(second.actions.product.create, 0);
    assert.equal(second.actions.product.linked, 3);
    assert.equal(second.actions.receipt.linked, 1);
    assert.equal(second.actions.supplier.adopt, 1);
    const businessOnly = (c) => ({ ...c, batches: 0, dryRunBatches: 0, applyBatches: 0, stage: 0 }); // staging accumulates per batch
    assert.deepEqual(businessOnly(rawCounts(t.dbPath)), businessOnly(afterFirst)); // no duplicates of any business record
    assert.deepEqual(second.reconciliation, first.reconciliation);
    assert.deepEqual(second.source.inventory, first.source.inventory);
    assert.equal(second.source.fingerprint, first.source.fingerprint);

    // A second fresh target produces the same plan and reconciliation.
    const t2 = makeTestApp();
    try {
      const other = runSourceImport(t2.app.db, source, { apply: true });
      assert.deepEqual(other.actions, first.actions);
      assert.deepEqual(other.reconciliation, first.reconciliation);
      assert.equal(sha256(fixture), fingerprintBefore);
    } finally { closeTestApp(t2); }
    assert.equal(sha256(fixture), fingerprintBefore);
  });

  it('adopts deterministic keys when source links are lost', () => {
    const source = readSourceDatabase(fixture);
    runSourceImport(t.app.db, source, { apply: true });
    const raw = new DatabaseSync(t.dbPath);
    raw.exec('DELETE FROM source_links');
    raw.close();
    const rerun = runSourceImport(t.app.db, source, { apply: true });
    if (rerun.errors.length) console.log('DEBUG ERRORS', JSON.stringify(rerun.errors, null, 2), JSON.stringify(rerun.actions));
    assert.equal(rerun.errors.length, 0);
    assert.equal(rerun.actions.product.adopt, 3);
    assert.equal(rerun.actions.product.create, 0);
    assert.equal(rerun.actions.receipt.adopt, 1);
    assert.equal(rerun.actions.customer.adopt, 1);
    const counts = rawCounts(t.dbPath);
    assert.equal(counts.products, 3);
    assert.equal(counts.parties, 2);
    assert.equal(counts.receipts, 1); // adoption never re-receives stock
    assert.equal(counts.stockQty, 12);
    assert.equal(counts.links, 2 + 1 + 3 + 2 + 1 + 1 + 1); // links rebuilt
    assert.equal(sha256(fixture), fingerprintBefore);
  });

  it('exports a canonical snapshot that round-trips', () => {
    const source = readSourceDatabase(fixture);
    runSourceImport(t.app.db, source, { apply: true });
    const snap = exportSnapshot(t.app.db);
    assert.deepEqual(snap.counts, {
      products: 3, categories: 2, parties: 2, priceLists: 1,
      warehouses: 1, receipts: 1, stockQty: 12,
    });
    const back = JSON.parse(JSON.stringify(snap));
    assert.deepEqual(back.counts, snap.counts);
    assert.ok(back.products.some((p) => p.sku === 'LEG-32'));
    assert.ok(back.parties.some((p) => p.code === 'LGS-CONDOR-SARL'));
  });
});
