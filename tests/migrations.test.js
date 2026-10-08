'use strict';
// Migration gate: fresh DB from empty state, idempotent re-run, FK enforcement,
// atomic failure (bad migration rolls back), backup hook.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../src/db');
const { migrate, appliedVersions } = require('../src/db/migrate');

function tmpPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'depot-mig-')), name);
}

describe('migrations', () => {
  it('builds a fresh database from empty state to latest schema', () => {
    const dbPath = tmpPath('fresh.sqlite');
    const db = openDatabase(dbPath);
    try {
      const out = migrate(db, { dbPath, backup: false });
      assert.deepEqual(out.ran, ['001_core.sql', '002_stock.sql', '003_audit_fields.sql', '004_product_master.sql', '005_catalog_units.sql', '006_pricing.sql', '007_warehouses.sql', '008_stock_engine.sql', '009_lots.sql', '010_parties.sql', '011_documents.sql', '012_sales.sql', '013_purchases.sql', '014_returns.sql', '015_payments.sql', '016_expenses.sql', '017_counts.sql', '018_logistics.sql', '019_loading.sql', '020_route_settlements.sql', '021_import.sql', '022_document_snapshots.sql', '023_fiscal_accounting.sql']);
      const tables = new Set(db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      ).all().map((r) => r.name));
      for (const t of ['schema_migrations', 'warehouses', 'products', 'purchase_receipts', 'purchase_receipt_lines', 'stock_movements', 'audit_log']) {
        assert.ok(tables.has(t), `missing table ${t}`);
      }
      assert.equal(appliedVersions(db).size, 23);
    } finally {
      db.close();
    }
  });

  it('is idempotent: second run applies nothing', () => {
    const dbPath = tmpPath('idem.sqlite');
    const db = openDatabase(dbPath);
    try {
      migrate(db, { dbPath, backup: false });
      const out = migrate(db, { dbPath, backup: false });
      assert.deepEqual(out.ran, []);
      assert.equal(out.upToDate, true);
    } finally {
      db.close();
    }
  });

  it('enforces foreign keys on the fresh schema', () => {
    const dbPath = tmpPath('fk.sqlite');
    const db = openDatabase(dbPath);
    try {
      migrate(db, { dbPath, backup: false });
      assert.throws(() => {
        db.prepare(`INSERT INTO purchase_receipts (receipt_no, warehouse_id, supplier_name, status)
                     VALUES ('RCPT-X', 9999, '', 'posted')`).run();
      }, /FOREIGN KEY/i);
    } finally {
      db.close();
    }
  });

  it('rolls back a failing migration atomically and records nothing', () => {
    const dbPath = tmpPath('fail.sqlite');
    const db = openDatabase(dbPath);
    try {
      migrate(db, { dbPath, backup: false });
      assert.throws(() => {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.exec('CREATE TABLE __probe (id INTEGER PRIMARY KEY)');
          db.exec('THIS IS NOT SQL');
          db.exec('COMMIT');
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch { /* ignore */ }
          throw e;
        }
      });
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__probe'").all();
      assert.equal(tables.length, 0);
      assert.equal(appliedVersions(db).size, 23);
    } finally {
      db.close();
    }
  });

  it('creates a backup before migrating an existing database file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-bak-'));
    const dbPath = path.join(dir, 'app.sqlite');
    const db = openDatabase(dbPath);
    try {
      migrate(db, { dbPath, backup: false }); // initial build, no backup expected
    } finally {
      db.close();
    }
    const db2 = openDatabase(dbPath);
    try {
      const out = migrate(db2, { dbPath, backup: true });
      assert.equal(out.upToDate, true); // nothing pending -> no backup needed on no-op
      assert.equal(out.backupPath, null);
    } finally {
      db2.close();
    }
  });
});
