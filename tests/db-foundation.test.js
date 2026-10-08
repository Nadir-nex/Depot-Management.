'use strict';
// Phase 03 adversarial suite: locking, legacy migration, failure atomicity,
// backup-on-upgrade, timestamp policy, audit retention surface.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase, utcNowIso } = require('../src/db');
const { migrate, appliedVersions } = require('../src/db/migrate');
const { makeTestApp, closeTestApp } = require('./helpers');

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REPO_ROOT = path.join(__dirname, '..');

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'depot-p03-')), name);
}

describe('db foundation', () => {
  it('emits UTC ISO-8601 timestamps from the single choke point', () => {
    assert.match(utcNowIso(), ISO_RE);
  });

  it('stores conforming timestamps on every written table', () => {
    const t = makeTestApp();
    try {
      const p = t.app.commands.createProduct({ sku: 'TS-1', name: 'Ts' });
      const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 2 }] });
      t.app.commands.cancelReceipt(r.id, 'ts check');
      for (const [table, col] of [['products', 'created_at'], ['purchase_receipts', 'posted_at'], ['stock_movements', 'created_at'], ['audit_log', 'occurred_at']]) {
        const row = t.app.db.prepare(`SELECT ${col} AS v FROM ${table} LIMIT 1`).get();
        assert.match(row.v, ISO_RE, `${table}.${col} = ${row.v}`);
      }
    } finally {
      closeTestApp(t);
    }
  });

  it('fails fast and cleanly when a second connection holds the write lock', () => {
    const dbPath = tmpFile('lock.sqlite');
    const a = openDatabase(dbPath);
    const b = openDatabase(dbPath, { busyTimeoutMs: 50 });
    try {
      migrate(a, { dbPath, backup: false });
      a.exec('BEGIN IMMEDIATE');
      a.prepare("INSERT INTO warehouses (code, name) VALUES ('LOCK-A', 'x')").run();
      const start = Date.now();
      assert.throws(() => {
        b.prepare("INSERT INTO warehouses (code, name) VALUES ('LOCK-B', 'y')").run();
      }, /locked|busy/i); // node:sqlite surfaces contention as "database is locked"
      assert.ok(Date.now() - start < 4000, 'must fail fast, not hang past the busy timeout');
      a.exec('COMMIT');
      b.prepare("INSERT INTO warehouses (code, name) VALUES ('LOCK-B', 'y')").run();
      assert.equal(a.prepare("SELECT COUNT(*) n FROM warehouses WHERE code LIKE 'LOCK-%'").get().n, 2);
    } finally {
      try { a.exec('ROLLBACK'); } catch { /* already committed */ }
      a.close(); b.close();
    }
  });

  it('migrates a copy of the frozen legacy baseline without losing rows', () => {
    const legacy = path.join(REPO_ROOT, 'db', 'database.sqlite');
    const copy = tmpFile('legacy-copy.sqlite');
    fs.copyFileSync(legacy, copy);
    const db = openDatabase(copy);
    try {
      const itemsBefore = db.prepare('SELECT COUNT(*) n FROM items').get().n;
      assert.ok(itemsBefore > 0, 'legacy copy must contain catalog rows');
      const out = migrate(db, { dbPath: copy, backup: false });
      assert.deepEqual(out.ran, ['001_core.sql', '002_stock.sql', '003_audit_fields.sql', '004_product_master.sql', '005_catalog_units.sql', '006_pricing.sql', '007_warehouses.sql', '008_stock_engine.sql', '009_lots.sql', '010_parties.sql', '011_documents.sql']);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM items').get().n, itemsBefore);
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get());
      assert.deepEqual(migrate(db, { dbPath: copy, backup: false }).ran, []);
    } finally {
      db.close();
    }
  });

  it('rolls back a bad migration file atomically and records nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-migdir-'));
    fs.writeFileSync(path.join(dir, '001_ok.sql'), 'CREATE TABLE p03_probe (id INTEGER PRIMARY KEY);');
    fs.writeFileSync(path.join(dir, '002_bad.sql'), 'THIS IS NOT SQL;');
    const dbPath = tmpFile('badmig.sqlite');
    const db = openDatabase(dbPath);
    try {
      assert.throws(() => migrate(db, { dbPath, backup: false, migrationsDir: dir }), /002_bad\.sql failed/);
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='p03_probe'").get());
      assert.ok(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='p03_bad'").all().length);
      assert.deepEqual([...appliedVersions(db)], ['001_ok.sql']);
    } finally {
      db.close();
    }
  });

  it('backs up an UPGRADED database but not a fresh build', () => {
    const srcDir = path.join(REPO_ROOT, 'src', 'db', 'migrations');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-upg-'));
    for (const f of fs.readdirSync(srcDir)) fs.copyFileSync(path.join(srcDir, f), path.join(dir, f));
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'depot-upgdb-')), 'app.sqlite');
    const fresh = openDatabase(dbPath);
    try {
      const first = migrate(fresh, { dbPath, backup: true, migrationsDir: dir });
      assert.equal(first.backupPath, null); // fresh build: nothing to protect
      fs.writeFileSync(path.join(dir, '003_extra.sql'), 'CREATE TABLE p03_extra (id INTEGER PRIMARY KEY);');
      const second = migrate(fresh, { dbPath, backup: true, migrationsDir: dir });
      assert.deepEqual(second.ran, ['003_extra.sql']);
      assert.ok(second.backupPath && fs.existsSync(second.backupPath), 'upgrade must leave a backup file');
    } finally {
      fresh.close();
    }
  });

  it('exposes no application path that edits or deletes audit history', () => {
    const t = makeTestApp();
    try {
      const names = [...Object.keys(t.app.commands), ...Object.keys(t.app.queries)];
      const bad = names.filter((n) => /audit/i.test(n) && /delet|remov|updat|clear|purge/i.test(n));
      assert.deepEqual(bad, []);
      assert.equal(typeof t.app.queries.recentAudit, 'function');
    } finally {
      closeTestApp(t);
    }
  });

  it('never collides with frozen legacy table names (expand-migrate-verify-cutover)', () => {
    // Every new table must coexist with the legacy prototype schema until P22
    // proves the migration. A collision (like categories in P06) breaks
    // migrating the legacy database. Derived live — no hardcoded lists.
    const namesOf = (dbPath) => {
      const db = openDatabase(dbPath);
      try {
        return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
      } finally {
        db.close();
      }
    };
    const freshPath = tmpFile('collision-fresh.sqlite');
    const fresh = openDatabase(freshPath);
    try {
      migrate(fresh, { dbPath: freshPath, backup: false });
    } finally {
      fresh.close();
    }
    const ours = namesOf(freshPath);
    const legacy = namesOf(path.join(REPO_ROOT, 'db', 'database.sqlite'));
    const clash = ours.filter((t) => legacy.includes(t));
    assert.deepEqual(clash, [], `new tables collide with legacy: ${clash.join(', ')}`);
  });
});
