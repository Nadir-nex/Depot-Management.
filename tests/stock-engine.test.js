'use strict';
// Phase 09 gate: the movement engine. Deltas only, atomic pairs, no-negative
// rule with explicit opt-out, linked reversals, running ledger balances.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('stock engine', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  function stocked(sku = 'E-1', qty = 20) {
    const p = t.app.commands.createProduct({ sku, name: sku });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty, unitCost: 10 }] });
    return p;
  }

  it('issues stock down and blocks over-issue unless explicitly allowed', () => {
    const p = stocked();
    const mov = t.app.commands.issueStock({ productId: p.id, qty: 6, reason: 'damaged' });
    assert.equal(mov.qty, -6);
    assert.equal(mov.movement_type, 'issue');
    assert.equal(mov.reason_code, 'damaged');
    assert.equal(t.app.queries.getStock(p.id, 1), 14);
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 15, reason: 'lost' }), (e) => e.code === 'INVALID_STATE');
    assert.equal(t.app.queries.getStock(p.id, 1), 14); // failed issue changed nothing
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 0, reason: 'lost' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 1 }), (e) => e.code === 'VALIDATION'); // reason required
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 1, reason: 'vibes' }), (e) => e.code === 'VALIDATION');
    t.app.commands.updateProduct(p.id, { allowNegativeStock: true });
    t.app.commands.issueStock({ productId: p.id, qty: 100, reason: 'correction' });
    assert.equal(t.app.queries.getStock(p.id, 1), -86);
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 1, reason: 'lost' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
  });

  it('adjusts both directions with reason and floor enforcement', () => {
    const p = stocked();
    t.app.commands.adjustStock({ productId: p.id, qty: -3, reason: 'expired' });
    assert.equal(t.app.queries.getStock(p.id, 1), 17);
    t.app.commands.adjustStock({ productId: p.id, qty: 5, reason: 'found' });
    assert.equal(t.app.queries.getStock(p.id, 1), 22);
    assert.throws(() => t.app.commands.adjustStock({ productId: p.id, qty: -23, reason: 'lost' }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.adjustStock({ productId: p.id, qty: 0, reason: 'found' }), (e) => e.code === 'VALIDATION');
    const audit = t.app.queries.recentAudit({ limit: 3 });
    assert.equal(audit[0].operation, 'stock.adjust');
    assert.match(audit[0].before_summary, /stock=17/);
    assert.match(audit[0].after_summary, /stock=22/);
  });

  it('transfers as one atomic pair and rejects duplicates by transfer_no', () => {
    const p = stocked('E-1', 20);
    const s = t.app.commands.createWarehouse({ code: 'SOUTH', name: 'South' });
    const tr = t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'SOUTH', qty: 8, reason: 'rebalance' });
    assert.ok(/^TRF-\d{8}-\d{4}$/.test(tr.transfer_no));
    assert.equal(t.app.queries.getStock(p.id, 1), 12);
    assert.equal(t.app.queries.getStock(p.id, s.id), 8);
    const legs = t.app.db.prepare("SELECT * FROM stock_movements WHERE reference_type = 'stock_transfer' ORDER BY id").all();
    assert.deepEqual(legs.map((m) => [m.warehouse_id, m.qty, m.movement_type]), [[1, -8, 'transfer_out'], [s.id, 8, 'transfer_in']]);
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'SOUTH', qty: 1, transferNo: tr.transfer_no }), (e) => e.code === 'CONFLICT');
    assert.equal(t.app.queries.getStock(p.id, 1), 12); // duplicate changed nothing
    assert.equal(t.app.queries.getStock(p.id, s.id), 8);
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'MAIN', qty: 1 }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'NOPE', qty: 1 }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'SOUTH', qty: 99 }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'SOUTH', qty: 1 }, { actor: 'm', grants: ['stock.adjust'] }), (e) => e.code === 'FORBIDDEN');
  });

  it('reverses single movements with links and refuses chains and receipt history', () => {
    const p = stocked();
    const mov = t.app.commands.issueStock({ productId: p.id, qty: 5, reason: 'damaged' });
    const rev = t.app.commands.reverseStockMovement(mov.id, 'correction');
    assert.equal(rev.qty, 5);
    assert.equal(rev.movement_type, 'reversal');
    assert.equal(rev.reverses_movement_id, mov.id);
    assert.equal(t.app.queries.getStock(p.id, 1), 20);
    assert.throws(() => t.app.commands.reverseStockMovement(rev.id, 'correction'), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.reverseStockMovement(mov.id, 'correction'), (e) => e.code === 'INVALID_STATE'); // already reversed
    const receiptMov = t.app.db.prepare("SELECT id FROM stock_movements WHERE movement_type = 'purchase_receipt' LIMIT 1").get();
    assert.throws(() => t.app.commands.reverseStockMovement(receiptMov.id, 'correction'), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.reverseStockMovement(99999, 'correction'), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.reverseStockMovement(mov.id, ''), (e) => e.code === 'VALIDATION');
  });

  it('reverses a whole transfer to preserve pair conservation', () => {
    const p = stocked('E-1', 20);
    const s = t.app.commands.createWarehouse({ code: 'SOUTH', name: 'South' });
    const tr = t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'SOUTH', qty: 8 });
    const outLeg = t.app.db.prepare("SELECT id FROM stock_movements WHERE reference_type = 'stock_transfer' AND movement_type = 'transfer_out'").get();
    const reversed = t.app.commands.reverseStockMovement(outLeg.id, 'correction');
    assert.equal(reversed.length, 2); // both legs reversed together
    assert.equal(t.app.queries.getStock(p.id, 1), 20);
    assert.equal(t.app.queries.getStock(p.id, s.id), 0);
  });

  it('exposes a ledger with running balances that reconciles to stock', () => {
    const p = stocked('E-1', 20);
    t.app.commands.issueStock({ productId: p.id, qty: 6, reason: 'damaged' });
    t.app.commands.adjustStock({ productId: p.id, qty: 2, reason: 'found' });
    const ledger = t.app.queries.getStockLedger({ productId: p.id, warehouseId: 1 });
    assert.deepEqual(ledger.map((r) => [r.qty, r.balance_after]), [[20, 20], [-6, 14], [2, 16]]);
    assert.equal(t.app.queries.getAvailableStock(p.id, 1), 16);
    assert.throws(() => t.app.queries.getAvailableStock(99999, 1), (e) => e.code === 'NOT_FOUND');
  });

  it('lets no application code assign quantities directly', () => {
    const files = fs.readdirSync('src/application').filter((f) => f.endsWith('.js'));
    assert.ok(files.length > 0);
    for (const f of files) {
      const src = fs.readFileSync(`src/application/${f}`, 'utf8');
      assert.ok(!/UPDATE\s+stock_movements/i.test(src), `${f} must not UPDATE the ledger`);
      assert.ok(!/DELETE\s+FROM\s+stock_movements/i.test(src), `${f} must not DELETE from the ledger`);
    }
    const names = [...Object.keys(t.app.commands), ...Object.keys(t.app.queries)];
    assert.ok(!names.some((n) => /movement.*(set|edit|delete|remove|update)/i.test(n)), 'no movement-mutating API may exist');
  });
});
