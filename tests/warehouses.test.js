'use strict';
// Phase 08 gate: warehouses as first-class entities, guarded deletion,
// per-warehouse stock scoping, inactive-warehouse rules, MAIN protection.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('warehouses', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('creates warehouses with normalized codes and lists MAIN by default', () => {
    const codes = t.app.queries.listWarehouses().map((w) => w.code);
    assert.deepEqual(codes, ['MAIN']);
    const w = t.app.commands.createWarehouse({ code: 'south', name: 'South depot' });
    assert.equal(w.code, 'SOUTH');
    assert.equal(w.is_active, 1);
    assert.throws(() => t.app.commands.createWarehouse({ code: 'SOUTH', name: 'dup' }), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createWarehouse({ code: '', name: 'x' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createWarehouse({ code: 'S2', name: '' }), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createWarehouse({ code: 'S2', name: 'x' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    assert.equal(t.app.queries.getWarehouse(w.id).name, 'South depot');
  });

  it('scopes stock per warehouse independently', () => {
    const p = t.app.commands.createProduct({ sku: 'W-1', name: 'W' });
    const s = t.app.commands.createWarehouse({ code: 'SOUTH', name: 'South' });
    t.app.commands.receiveStock({ warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] });
    t.app.commands.receiveStock({ warehouseCode: 'SOUTH', lines: [{ productId: p.id, qty: 4 }] });
    assert.equal(t.app.queries.getStock(p.id, 1), 10);
    assert.equal(t.app.queries.getStock(p.id, s.id), 4);
    assert.equal(t.app.queries.listStock('SOUTH').rows.find((r) => r.sku === 'W-1').stock, 4);
    assert.equal(t.app.queries.listStock(1).rows.find((r) => r.sku === 'W-1').stock, 10);
  });

  it('blocks receipts to inactive warehouses and unknown destinations', () => {
    const p = t.app.commands.createProduct({ sku: 'W-1', name: 'W' });
    const s = t.app.commands.createWarehouse({ code: 'SOUTH', name: 'South' });
    t.app.commands.setWarehouseActive(s.id, false);
    assert.throws(() => t.app.commands.receiveStock({ warehouseCode: 'SOUTH', lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'INVALID_STATE');
    assert.equal(t.app.queries.getStock(p.id, s.id), 0);
    t.app.commands.setWarehouseActive(s.id, true);
    t.app.commands.receiveStock({ warehouseCode: 'SOUTH', lines: [{ productId: p.id, qty: 2 }] });
    assert.equal(t.app.queries.getStock(p.id, s.id), 2);
    assert.throws(() => t.app.commands.receiveStock({ warehouseCode: 'NOPE', lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.receiveStock({ warehouseId: 99999, lines: [{ productId: p.id, qty: 1 }] }), (e) => e.code === 'NOT_FOUND');
  });

  it('deletes only unreferenced non-MAIN warehouses', () => {
    const p = t.app.commands.createProduct({ sku: 'W-1', name: 'W' });
    const s = t.app.commands.createWarehouse({ code: 'SOUTH', name: 'South' });
    assert.equal(t.app.commands.deleteWarehouse(s.id), true);
    assert.throws(() => t.app.commands.deleteWarehouse(s.id), (e) => e.code === 'NOT_FOUND');
    const s2 = t.app.commands.createWarehouse({ code: 'SOUTH', name: 'South again' });
    t.app.commands.receiveStock({ warehouseCode: 'SOUTH', lines: [{ productId: p.id, qty: 3 }] });
    assert.throws(() => t.app.commands.deleteWarehouse(s2.id), (e) => e.code === 'CONFLICT');
    // deactivation still allowed with history; stock untouched
    assert.equal(t.app.commands.setWarehouseActive(s2.id, false).is_active, 0);
    assert.equal(t.app.queries.getStock(p.id, s2.id), 3);
    assert.throws(() => t.app.commands.deleteWarehouse(s2.id, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
  });

  it('protects the MAIN bootstrap depot', () => {
    const main = t.app.queries.listWarehouses().find((w) => w.code === 'MAIN');
    assert.throws(() => t.app.commands.setWarehouseActive(main.id, false), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.deleteWarehouse(main.id), (e) => e.code === 'CONFLICT');
    assert.equal(t.app.commands.ensureMainWarehouse('re-seed').code, 'MAIN');
    assert.equal(t.app.queries.listWarehouses().filter((w) => w.code === 'MAIN').length, 1);
  });
});
