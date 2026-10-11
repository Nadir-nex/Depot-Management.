'use strict';
// Batch 5 gate: inventory truth — stock derived, ledger auditable, counts
// counted≠expected, transfers atomic, warehouses guarded. No fake quantities.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTestApp, closeTestApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');

describe('batch5 inventory contract', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('stock is derived SUM, ledger reconciles, reverse guards hold', () => {
    const p = t.app.commands.createProduct({ sku: 'B5-P', name: 'b5', minStock: 5 });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10 }] });
    t.app.commands.issueStock({ productId: p.id, qty: 3, reason: 'damaged' });
    assert.equal(t.app.queries.getStock(p.id, 1), 7);
    const rows = t.app.queries.listStock('MAIN').rows;
    assert.equal(rows.find((r) => r.sku === 'B5-P').stock, 7);
    const led = t.app.queries.getStockLedger({ productId: p.id, warehouseId: 1 });
    assert.equal(led[led.length - 1].balance_after, 7);
    const movs = t.app.queries.listMovements({ productId: p.id });
    const issue = movs.find((m) => m.movement_type === 'issue');
    const rev = t.app.commands.reverseStockMovement(issue.id, 'correction');
    assert.equal(t.app.queries.getStock(p.id, 1), 10);
    assert.throws(() => t.app.commands.reverseStockMovement(rev.id, 'correction'), (e) => e.code === 'INVALID_STATE');
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 2 }] });
    const rm = t.app.db.prepare("SELECT id FROM stock_movements WHERE reference_type='purchase_receipt' AND reference_id=? LIMIT 1").get(r.id);
    assert.throws(() => t.app.commands.reverseStockMovement(rm.id, 'correction'), (e) => e.code === 'INVALID_STATE');
  });

  it('transfer is one atomic pair with duplicate-no guard; receipts cancel via reversal', () => {
    const p = t.app.commands.createProduct({ sku: 'B5-T', name: 't' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10 }] });
    const w = t.app.commands.createWarehouse({ code: 'B5W', name: 'B5' });
    const tr = t.app.commands.transferStock({ productId: p.id, qty: 4, fromWarehouseCode: 'MAIN', toWarehouseCode: 'B5W' });
    assert.ok(tr.transfer_no);
    assert.equal(t.app.queries.getStock(p.id, 1), 6);
    assert.equal(t.app.queries.getStock(p.id, w.id), 4);
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, qty: 4, fromWarehouseCode: 'MAIN', toWarehouseCode: 'B5W', transferNo: tr.transfer_no }), (e) => e.code === 'CONFLICT');
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 5 }] });
    t.app.commands.cancelReceipt(r.id, 'oops');
    assert.equal(t.app.queries.getReceipt(r.id).status, 'cancelled');
  });

  it('counts separate counted/expected/variance with reason + post effects', () => {
    const p = t.app.commands.createProduct({ sku: 'B5-C', name: 'c' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10 }] });
    const c = t.app.commands.createCount({ warehouseCode: 'MAIN' });
    t.app.commands.addCountLine(c.id, { productId: p.id, countedQty: 7 });
    t.app.commands.submitCount(c.id);
    const got = t.app.queries.getCount(c.id);
    assert.equal(got.lines[0].expected_qty, 10);
    assert.equal(got.lines[0].variance, -3);
    assert.throws(() => t.app.commands.approveCount(c.id), (e) => e.code === 'VALIDATION');
    t.app.commands.updateCountLine(got.lines[0].id, { reasonCode: 'damaged' });
    t.app.commands.approveCount(c.id);
    t.app.commands.postCount(c.id);
    assert.equal(t.app.queries.getStock(p.id, 1), 7);
    assert.equal(t.app.queries.getCount(c.id).status, 'posted');
  });

  it('warehouses guard MAIN + references; frontend wires ledger/reverse/cancel/counts', () => {
    const w = t.app.commands.createWarehouse({ code: 'B5X', name: 'x' });
    t.app.commands.setWarehouseActive(w.id, false);
    assert.throws(() => t.app.commands.createCount({ warehouseCode: 'B5X' }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.deleteWarehouse(1), (e) => e.code === 'CONFLICT');
    const must = [
      'api.getStockLedger', 'api.listMovements', 'api.reverseStockMovement',
      'api.cancelReceipt', 'api.getReceipt', 'api.getAvailableStock',
      'api.updateCountLine', 'api.removeCountLine', 'api.cancelCount',
      'api.createWarehouse', 'api.setWarehouseActive', 'api.deleteWarehouse',
      'balance_after', 'counted', 'expected', 'variance',
    ];
    for (const m of must) assert.ok(FRONT.includes(m), `frontend must use ${m}`);
  });

  it('renderer stays display-only after batch 5', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
  });
});
