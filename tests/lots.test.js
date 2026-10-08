'use strict';
// Phase 10 gate: lots in the ledger, expiry policy, FEFO/FIFO hooks, serials.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('lots', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  function product(sku = 'L-1', extra = {}) {
    return t.app.commands.createProduct({ sku, name: sku, ...extra });
  }

  it('creates lots scoped per product with validated dates', () => {
    const p = product();
    const q = product('L-2');
    const lot = t.app.commands.createLot(p.id, { lotNo: 'BATCH-1', expiryDate: '2030-01-01', supplierRef: 'Sup' });
    assert.equal(lot.lot_no, 'BATCH-1');
    assert.throws(() => t.app.commands.createLot(p.id, { lotNo: 'BATCH-1' }), (e) => e.code === 'CONFLICT');
    assert.ok(t.app.commands.createLot(q.id, { lotNo: 'BATCH-1' })); // same code, other product
    assert.throws(() => t.app.commands.createLot(p.id, { lotNo: '' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createLot(p.id, { lotNo: 'X', expiryDate: 'next-friday' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createLot(p.id, { lotNo: 'X', manufacturedDate: '2031-01-01', expiryDate: '2030-01-01' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createLot(99999, { lotNo: 'X' }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.createLot(p.id, { lotNo: 'X' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    assert.equal(t.app.commands.deleteLot(lot.id), true); // empty lot deletable
    assert.throws(() => t.app.commands.deleteLot(lot.id), (e) => e.code === 'NOT_FOUND');
  });

  it('receives two lots with per-lot stock beside the untracked pool', () => {
    const p = product();
    const a = t.app.commands.createLot(p.id, { lotNo: 'A' });
    const r = t.app.commands.receiveStock({ lines: [
      { productId: p.id, qty: 10, lotId: a.id },
      { productId: p.id, qty: 5, lot: { lotNo: 'B', expiryDate: '2030-06-01' } },
      { productId: p.id, qty: 3 },
    ] });
    assert.equal(r.lines.length, 3);
    const lots = t.app.queries.listLots(p.id, { warehouseId: 1 });
    const byNo = Object.fromEntries(lots.map((l) => [l.lot_no, l.stock]));
    assert.deepEqual(byNo, { A: 10, B: 5 });
    assert.equal(t.app.queries.getStock(p.id, 1), 18);
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1, lotId: 99999 }] }), (e) => e.code === 'NOT_FOUND');
    const q = product('L-9');
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: q.id, qty: 1, lotId: a.id }] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1, lot: { lotNo: 'B', expiryDate: '2031-01-01' } }] }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.deleteLot(a.id), (e) => e.code === 'CONFLICT'); // referenced now
  });

  it('issues from the selected lot only', () => {
    const p = product();
    const a = t.app.commands.createLot(p.id, { lotNo: 'A' });
    const b = t.app.commands.createLot(p.id, { lotNo: 'B' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10, lotId: a.id }, { productId: p.id, qty: 10, lotId: b.id }] });
    const mov = t.app.commands.issueStock({ productId: p.id, qty: 4, lots: [{ lotId: a.id, qty: 4 }], reason: 'damaged' });
    assert.equal(mov.lot_id, a.id);
    const lots = t.app.queries.listLots(p.id, { warehouseId: 1 });
    assert.deepEqual(Object.fromEntries(lots.map((l) => [l.lot_no, l.stock])), { A: 6, B: 10 });
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 7, lots: [{ lotId: a.id, qty: 7 }], reason: 'lost' }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 4, lots: [{ lotId: a.id, qty: 3 }] , reason: 'lost' }), (e) => e.code === 'VALIDATION'); // sum mismatch
    const ledger = t.app.queries.getStockLedger({ productId: p.id, lotId: a.id });
    assert.ok(ledger.every((r) => r.lot_id === a.id));
    assert.equal(ledger[ledger.length - 1].lot_no, 'A');
  });

  it('blocks commercial outflows from expired lots but allows write-offs', () => {
    const p = product();
    const old = t.app.commands.createLot(p.id, { lotNo: 'OLD', expiryDate: '2001-01-01' });
    const fresh = t.app.commands.createLot(p.id, { lotNo: 'FRESH', expiryDate: '2099-01-01' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10, lotId: old.id }, { productId: p.id, qty: 10, lotId: fresh.id }] });
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 1, lots: [{ lotId: old.id, qty: 1 }], reason: 'damaged' }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'MAIN', qty: 1 }), (e) => e.code === 'VALIDATION'); // same wh first
    t.app.commands.createWarehouse({ code: 'SOUTH', name: 'South' });
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'SOUTH', qty: 1, lots: [{ lotId: old.id, qty: 1 }] }), (e) => e.code === 'INVALID_STATE');
    t.app.commands.adjustStock({ productId: p.id, qty: -10, lots: [{ lotId: old.id, qty: -10 }], reason: 'expired' }); // write-off works
    assert.equal(t.app.queries.listLots(p.id, { warehouseId: 1 }).find((l) => l.lot_no === 'OLD').stock, 0);
    const visible = t.app.queries.listLots(p.id, { warehouseId: 1, includeExpired: false }).map((l) => l.lot_no);
    assert.deepEqual(visible, ['FRESH']);
  });

  it('suggests FEFO/FIFO allocations without moving anything', () => {
    const p = product();
    const early = t.app.commands.createLot(p.id, { lotNo: 'EARLY', expiryDate: '2027-01-01' });
    const late = t.app.commands.createLot(p.id, { lotNo: 'LATE', expiryDate: '2029-01-01' });
    const old = t.app.commands.createLot(p.id, { lotNo: 'OLD', expiryDate: '2001-01-01' });
    t.app.commands.receiveStock({ lines: [
      { productId: p.id, qty: 5, lotId: late.id },
      { productId: p.id, qty: 5, lotId: early.id },
      { productId: p.id, qty: 50, lotId: old.id },
    ] });
    const fefo = t.app.queries.suggestLots({ productId: p.id, warehouseId: 1, qty: 8, policy: 'fefo' });
    assert.deepEqual(fefo.map((a) => [a.lotNo, a.qty]), [['EARLY', 5], ['LATE', 3]]); // expired skipped
    const fifo = t.app.queries.suggestLots({ productId: p.id, warehouseId: 1, qty: 8, policy: 'fifo' });
    assert.deepEqual(fifo.map((a) => [a.lotNo, a.qty]), [['LATE', 5], ['EARLY', 3]]); // receipt order
    assert.throws(() => t.app.queries.suggestLots({ productId: p.id, warehouseId: 1, qty: 999 }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.queries.suggestLots({ productId: p.id, warehouseId: 1, qty: 1, policy: 'lifo' }), (e) => e.code === 'VALIDATION');
    assert.equal(t.app.queries.getStock(p.id, 1), 60); // hook moved nothing
  });

  it('tracks serials: register once, sell once, restore on reversal', () => {
    const p = product('S-1', { serialTracking: true });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 2, serials: ['SN-1', 'SN-2'] }] });
    assert.deepEqual(t.app.queries.listSerials(p.id, 'in_stock').map((s) => s.code), ['SN-1', 'SN-2']);
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1, serials: ['SN-1'] }] }), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 2, serials: ['SN-3'] }] }), (e) => e.code === 'VALIDATION'); // count mismatch
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'VALIDATION'); // tracking requires serials
    const plain = product('S-2');
    assert.throws(() => t.app.commands.receiveStock({ lines: [{ productId: plain.id, qty: 1, serials: ['X'] }] }), (e) => e.code === 'VALIDATION');
    const mov = t.app.commands.issueStock({ productId: p.id, qty: 1, serials: ['SN-1'], reason: 'damaged' });
    assert.deepEqual(t.app.queries.listSerials(p.id, 'in_stock').map((s) => s.code), ['SN-2']);
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 1, serials: ['SN-1'], reason: 'lost' }), (e) => e.code === 'INVALID_STATE'); // double-sell
    assert.throws(() => t.app.commands.issueStock({ productId: p.id, qty: 1, reason: 'lost' }), (e) => e.code === 'VALIDATION'); // tracking requires serials
    t.app.commands.reverseStockMovement(mov.id, 'correction');
    assert.deepEqual(t.app.queries.listSerials(p.id, 'in_stock').map((s) => s.code), ['SN-1', 'SN-2']);
    assert.equal(t.app.queries.getStock(p.id, 1), 2);
  });

  it('moves serials with transfers only when untracked pools stay out of it', () => {
    const p = product('T-1', { serialTracking: true });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 1, serials: ['TS-1'] }] });
    t.app.commands.createWarehouse({ code: 'SOUTH', name: 'South' });
    assert.throws(() => t.app.commands.transferStock({ productId: p.id, fromWarehouseCode: 'MAIN', toWarehouseCode: 'SOUTH', qty: 1 }), (e) => e.code === 'INVALID_STATE');
  });

  it('restores the correct lot on reversal and receipt cancellation', () => {
    const p = product();
    const a = t.app.commands.createLot(p.id, { lotNo: 'A' });
    const r = t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 10, lotId: a.id }] });
    const mov = t.app.commands.issueStock({ productId: p.id, qty: 4, lots: [{ lotId: a.id, qty: 4 }], reason: 'damaged' });
    const rev = t.app.commands.reverseStockMovement(mov.id, 'correction');
    assert.equal(rev.lot_id, a.id);
    assert.equal(t.app.queries.listLots(p.id, { warehouseId: 1 })[0].stock, 10);
    t.app.commands.cancelReceipt(r.id, 'supplier recall');
    assert.equal(t.app.queries.listLots(p.id, { warehouseId: 1 })[0].stock, 0);
    const ledger = t.app.queries.getStockLedger({ productId: p.id });
    assert.equal(ledger[ledger.length - 1].balance_after, 0);
  });
});
