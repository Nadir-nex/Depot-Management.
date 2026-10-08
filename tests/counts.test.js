'use strict';
// Phase 18 gate: counted, approved, reversible reconciliation — never edits.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

const COUNTER = { actor: 'c', grants: ['stock.adjust'] };

describe('counts', () => {
  let t, p, q;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'C-1', name: 'C' });
    q = t.app.commands.createProduct({ sku: 'C-2', name: 'C2' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 20 }, { productId: q.id, qty: 5 }] });
  });
  afterEach(() => { closeTestApp(t); });

  function draftWith(lines) {
    const c = t.app.commands.createCount({}, COUNTER);
    assert.ok(/^CNT-\d{8}-\d{4}$/.test(c.count_no));
    for (const l of lines) t.app.commands.addCountLine(c.id, l, COUNTER);
    return c;
  }

  function toPosted(countId) {
    t.app.commands.submitCount(countId, COUNTER);
    const full = t.app.queries.getCount(countId);
    for (const l of full.lines) {
      if (l.variance !== 0) t.app.commands.updateCountLine(l.id, { reasonCode: 'correction' }, COUNTER);
    }
    t.app.commands.approveCount(countId, COUNTER);
    return t.app.commands.postCount(countId, COUNTER);
  }

  it('posts nothing when counted equals expected', () => {
    const c = draftWith([{ productId: p.id, countedQty: 20 }]);
    const movBefore = t.app.queries.listMovements({}).length;
    const posted = toPosted(c.id);
    assert.equal(posted.status, 'posted');
    assert.equal(t.app.queries.listMovements({}).length, movBefore); // provable no-op
    assert.equal(t.app.queries.getStock(p.id, 1), 20);
  });

  it('adjusts down and up with reasons and frozen expectations', () => {
    const c = draftWith([{ productId: p.id, countedQty: 17 }, { productId: q.id, countedQty: 9 }]);
    t.app.commands.submitCount(c.id, COUNTER);
    const frozen = t.app.queries.getCount(c.id);
    assert.deepEqual(frozen.lines.map((l) => [l.counted_qty, l.expected_qty, l.variance]), [[17, 20, -3], [9, 5, 4]]);
    // stock moving after submit does not move the frozen expectation
    t.app.commands.issueStock({ productId: p.id, qty: 2, reason: 'damaged' }, COUNTER);
    assert.equal(t.app.queries.getCount(c.id).lines[0].expected_qty, 20);
    assert.throws(() => t.app.commands.approveCount(c.id, COUNTER), (e) => e.code === 'VALIDATION'); // reasons missing
    t.app.commands.updateCountLine(frozen.lines[0].id, { reasonCode: 'lost' }, COUNTER);
    t.app.commands.updateCountLine(frozen.lines[1].id, { reasonCode: 'found' }, COUNTER);
    t.app.commands.approveCount(c.id, COUNTER);
    assert.throws(() => t.app.commands.approveCount(c.id, COUNTER), (e) => e.code === 'VALIDATION'); // no double approval
    t.app.commands.postCount(c.id, COUNTER);
    assert.equal(t.app.queries.getStock(p.id, 1), 15); // 20 - 2 issued, then -3 adjustment
    assert.equal(t.app.queries.getStock(q.id, 1), 9);
    const movs = t.app.db.prepare("SELECT * FROM stock_movements WHERE reference_type = 'inventory_count' ORDER BY id").all();
    assert.deepEqual(movs.map((m) => [m.qty, m.reason_code]), [[-3, 'lost'], [4, 'found']]);
  });

  it('requires approval before posting and guards every transition', () => {
    const c = draftWith([{ productId: p.id, countedQty: 1 }]);
    assert.throws(() => t.app.commands.postCount(c.id, COUNTER), (e) => e.code === 'VALIDATION'); // draft→posted illegal
    assert.throws(() => t.app.commands.approveCount(c.id, COUNTER), (e) => e.code === 'VALIDATION'); // draft→approved illegal
    const empty = t.app.commands.createCount({}, COUNTER);
    assert.throws(() => t.app.commands.submitCount(empty.id, COUNTER), (e) => e.code === 'VALIDATION');
    t.app.commands.submitCount(c.id, COUNTER);
    assert.throws(() => t.app.commands.addCountLine(c.id, { productId: q.id, countedQty: 1 }, COUNTER), (e) => e.code === 'INVALID_STATE');
  });

  it('supports recount by cancelling and restarting', () => {
    const c = draftWith([{ productId: p.id, countedQty: 1 }]);
    t.app.commands.submitCount(c.id, COUNTER);
    assert.throws(() => t.app.commands.addCountLine(c.id, { productId: q.id, countedQty: 1 }, COUNTER), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.updateCountLine(t.app.queries.getCount(c.id).lines[0].id, { countedQty: 2 }, COUNTER), (e) => e.code === 'INVALID_STATE');
    // reasons stay recordable during review; quantities do not
    t.app.commands.updateCountLine(t.app.queries.getCount(c.id).lines[0].id, { reasonCode: 'lost' }, COUNTER);
    t.app.commands.cancelCount(c.id, 'recount needed', COUNTER);
    assert.equal(t.app.queries.getCount(c.id).status, 'cancelled');
    assert.throws(() => t.app.commands.submitCount(c.id, COUNTER), (e) => e.code === 'VALIDATION'); // terminal
  });

  it('counts lot pools in isolation', () => {
    const lot = t.app.commands.createLot(p.id, { lotNo: 'CL-1' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10, lotId: lot.id }] }); // lot pool 10, untracked 20
    const c = t.app.commands.createCount({}, COUNTER);
    t.app.commands.addCountLine(c.id, { productId: p.id, lotId: lot.id, countedQty: 7 }, COUNTER);
    t.app.commands.submitCount(c.id, COUNTER);
    const line = t.app.queries.getCount(c.id).lines[0];
    assert.equal(line.expected_qty, 10);
    assert.throws(() => t.app.commands.addCountLine(c.id, { productId: p.id, lotId: lot.id, countedQty: 1 }, COUNTER), (e) => e.code === 'INVALID_STATE');
    t.app.commands.updateCountLine(line.id, { reasonCode: 'damaged' }, COUNTER);
    t.app.commands.approveCount(c.id, COUNTER);
    t.app.commands.postCount(c.id, COUNTER);
    const lots = t.app.queries.listLots(p.id, { warehouseId: 1 });
    assert.equal(lots.find((l) => l.lot_no === 'CL-1').stock, 7);
    assert.equal(t.app.queries.getStock(p.id, 1), 27); // untracked 20 untouched
  });

  it('leaves audit and reversibility behind', () => {
    const c = draftWith([{ productId: p.id, countedQty: 18 }]);
    toPosted(c.id);
    const ops = t.app.queries.recentAudit({ limit: 20 }).map((a) => a.operation);
    for (const op of ['count.create', 'count.submit', 'count.approve', 'count.post']) {
      assert.ok(ops.includes(op), `missing audit: ${op}`);
    }
    const mov = t.app.db.prepare("SELECT id FROM stock_movements WHERE reference_type = 'inventory_count'").get();
    t.app.commands.reverseStockMovement(mov.id, 'correction', COUNTER); // posted counts reverse like any movement
    assert.equal(t.app.queries.getStock(p.id, 1), 20);
    assert.equal(t.app.queries.getCount(c.id).status, 'posted'); // the count stands; stock compensated
  });

  it('validates inputs and authorization', () => {
    assert.throws(() => t.app.commands.createCount({ warehouseCode: 'NOPE' }, COUNTER), (e) => e.code === 'NOT_FOUND');
    const c = draftWith([{ productId: p.id, countedQty: 1 }]);
    assert.throws(() => t.app.commands.addCountLine(c.id, { productId: p.id, countedQty: 2 }, COUNTER), (e) => e.code === 'CONFLICT'); // pool already on count
    assert.throws(() => t.app.commands.addCountLine(c.id, { productId: p.id, countedQty: -1 }, COUNTER), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.addCountLine(99999, { productId: p.id, countedQty: 1 }, COUNTER), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.createCount({}, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.submitCount(c.id, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.cancelCount(c.id, '', COUNTER), (e) => e.code === 'VALIDATION');
  });
});
