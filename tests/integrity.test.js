'use strict';
// Integrity gate: PRAGMA checks, audit append-only, transaction rollback.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { integrityCheck } = require('../src/db');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('integrity', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('passes PRAGMA integrity + foreign-key checks after workload', () => {
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' });
    const r = t.app.commands.receiveStock({ lines: [{ productId: a.id, qty: 6 }] });
    t.app.commands.cancelReceipt(r.id, 'test cancel');
    const check = integrityCheck(t.app.db);
    assert.equal(check.ok, true);
    assert.deepEqual(check.fkViolations, []);
  });

  it('keeps audit append-only (no update/delete API, rows survive workload)', () => {
    const before = t.app.queries.recentAudit({ limit: 1000 }).length;
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' }, 'alice');
    t.app.commands.receiveStock({ lines: [{ productId: a.id, qty: 1 }] }, 'alice');
    const after = t.app.queries.recentAudit({ limit: 1000 });
    assert.ok(after.length >= before + 2);
    assert.ok(after.some((r) => r.actor === 'alice' && r.operation === 'stock.receive'));
    const cols = t.app.db.prepare('PRAGMA table_info(audit_log)').all().map((c) => c.name);
    assert.ok(cols.includes('operation') && cols.includes('entity_type'));
  });

  it('rolls back all rows when a transaction fails midway', () => {
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' });
    const { withTransaction } = require('../src/db');
    assert.throws(() => withTransaction(t.app.db, () => {
      t.app.db.prepare(
        "INSERT INTO stock_movements (product_id, warehouse_id, qty, movement_type, reference_type, reference_id) VALUES (?, 1, 5, 'adjustment', 'test', 0)"
      ).run(a.id);
      throw new Error('simulated failure');
    }));
    assert.equal(t.app.queries.getStock(a.id, 1), 0);
  });

  it('nests transactions via savepoints: inner failure spares the outer work', () => {
    const a = t.app.commands.createProduct({ sku: 'P-A', name: 'A' });
    const { withTransaction } = require('../src/db');
    withTransaction(t.app.db, () => {
      t.app.db.prepare("INSERT INTO warehouses (code, name) VALUES ('NEST-1', 'n')").run();
      assert.throws(() => withTransaction(t.app.db, () => {
        t.app.db.prepare("INSERT INTO warehouses (code, name) VALUES ('NEST-2', 'n')").run();
        throw new Error('inner failure');
      }));
    });
    const codes = t.app.db.prepare("SELECT code FROM warehouses WHERE code LIKE 'NEST-%' ORDER BY code").all().map((r) => r.code);
    assert.deepEqual(codes, ['NEST-1']); // outer committed, inner rolled back
    assert.throws(() => withTransaction(t.app.db, () => {
      t.app.db.prepare("INSERT INTO warehouses (code, name) VALUES ('NEST-3', 'n')").run();
      withTransaction(t.app.db, () => {
        t.app.db.prepare("INSERT INTO warehouses (code, name) VALUES ('NEST-4', 'n')").run();
      });
      throw new Error('outer failure');
    }));
    assert.equal(t.app.db.prepare("SELECT COUNT(*) n FROM warehouses WHERE code LIKE 'NEST-%' AND code != 'NEST-1'").get().n, 0);
  });
});
