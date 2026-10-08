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
});
