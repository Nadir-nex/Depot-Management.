'use strict';
// Phase 04 gate: permission catalog, service-side enforcement, anti-bypass,
// and audit events with before/after/reason/reference.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PERMISSIONS, normalizeAuth, requirePermission } = require('../src/domain/permissions');
const { makeTestApp, closeTestApp } = require('./helpers');

const REPO_ROOT = path.join(__dirname, '..');
const NOBODY = () => ({ actor: 'mallory', grants: [] });

describe('auth', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('freezes a permission catalog covering every capability family', () => {
    assert.ok(Object.isFrozen(PERMISSIONS));
    for (const k of ['products.edit', 'purchases.post', 'purchases.cancel', 'warehouses.edit', 'sales.post',
      'payments.record', 'customers.edit', 'deliveries.complete', 'reports.view',
      'admin.backup', 'stock.transfer', 'pricing.edit', 'credit.override']) {
      assert.ok(PERMISSIONS[k], `missing permission ${k}`);
    }
    assert.throws(() => requirePermission(normalizeAuth('x'), 'nope.nothing'), (e) => e.code === 'VALIDATION');
  });

  it('denies every protected command to a grant-less caller without changing state', () => {
    const p = t.app.commands.createProduct({ sku: 'P-A', name: 'A' }, 'seed');
    const before = t.app.queries.listProducts({}).length;
    assert.throws(() => t.app.commands.createProduct({ sku: 'P-X', name: 'X' }, NOBODY()), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.updateProduct(p.id, { name: 'Hack' }, NOBODY()), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.setProductActive(p.id, false, NOBODY()), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.deleteProduct(p.id, NOBODY()), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1 }] }, NOBODY()), (e) => e.code === 'FORBIDDEN');
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1 }] }, 'seed');
    assert.throws(() => t.app.commands.cancelReceipt(r.id, 'nope', NOBODY()), (e) => e.code === 'FORBIDDEN');
    assert.equal(t.app.queries.listProducts({}).length, before);
    assert.equal(t.app.queries.getStock(p.id, 1), 1); // denied writes left nothing
    assert.equal(t.app.queries.getReceipt(r.id).status, 'posted');
  });

  it('allows the exact permission and rejects a merely adjacent one', () => {
    const editor = { actor: 'ed', grants: ['products.edit'] };
    const p = t.app.commands.createProduct({ sku: 'P-A', name: 'A' }, editor);
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1 }] }, editor), (e) => e.code === 'FORBIDDEN');
    const receiver = { actor: 'recv', grants: ['purchases.post', 'purchases.cancel'] };
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 2 }] }, receiver);
    assert.equal(t.app.commands.cancelReceipt(r.id, 'ok', receiver).status, 'cancelled');
  });

  it('keeps the trusted string shorthand working (seed/bootstrap/tests)', () => {
    const p = t.app.commands.createProduct({ sku: 'P-A', name: 'A' }, 'seed-script');
    assert.ok(p.id > 0);
    const audit = t.app.queries.recentAudit({ limit: 3 });
    assert.equal(audit[0].actor, 'seed-script');
  });

  it('records sensitive operations with reason and document reference', () => {
    const p = t.app.commands.createProduct({ sku: 'P-A', name: 'A' }, 'alice');
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 5 }] }, 'alice');
    t.app.commands.setProductActive(p.id, false, 'alice');
    t.app.commands.cancelReceipt(r.id, 'wrong supplier', 'alice');
    const byOp = Object.fromEntries(t.app.queries.recentAudit({ limit: 20 }).map((a) => [a.operation, a]));
    assert.equal(byOp['stock.receive'].reference_no, r.receipt_no);
    assert.equal(byOp['stock.receipt_cancel'].reason, 'wrong supplier');
    assert.equal(byOp['stock.receipt_cancel'].reference_no, r.receipt_no);
    assert.match(byOp['product.deactivate'].before_summary, /isActive=true/);
    assert.match(byOp['product.deactivate'].after_summary, /isActive=false/);
    for (const a of Object.values(byOp)) {
      assert.ok(a.occurred_at && a.actor && a.entity_type, 'audit event must carry who/what/when');
    }
  });

  it('gives the renderer no privilege channel: grants never cross IPC', () => {
    const main = fs.readFileSync(path.join(REPO_ROOT, 'src', 'infrastructure', 'electron', 'main.js'), 'utf8');
    const preload = fs.readFileSync(path.join(REPO_ROOT, 'src', 'infrastructure', 'electron', 'preload.js'), 'utf8');
    assert.ok(!/\(\[.*\bgrants\b/.test(main), 'no IPC handler may accept grants from the renderer');
    assert.ok(!/\bgrants\b/.test(preload), 'preload must not expose grants');
    assert.ok(main.includes("grants: ['*']"), 'server-side auth is built in the main process');
    // The exact object IPC handlers call still denies grant-less callers:
    assert.throws(() => t.app.commands.receiveStock({ lines: [] }, NOBODY()), (e) => e.code === 'FORBIDDEN');
  });
});
