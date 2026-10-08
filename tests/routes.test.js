'use strict';
// Phase 19 gate: delivery as a business process (crew, stops, completion).
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

const DISPATCH = { actor: 'd', grants: ['deliveries.create', 'deliveries.complete'] };
const PLANNER = { actor: 'p', grants: ['deliveries.create'] };
const SALES = { actor: 's', grants: ['sales.create', 'sales.post', 'sales.cancel', 'deliveries.create', 'deliveries.complete'] };

describe('routes', () => {
  let t, p, c1, c2, driver, vehicle;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'T-1', name: 'T' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 100, unitCost: 10 }] });
    c1 = t.app.commands.createParty({ displayName: 'Shop 1', roles: ['customer'] });
    c2 = t.app.commands.createParty({ displayName: 'Shop 2', roles: ['customer'] });
    driver = t.app.commands.createDriver({ code: 'DRV-1', name: 'Karim' }, DISPATCH);
    vehicle = t.app.commands.createVehicle({ code: 'TRK-1', plate: '1234' }, DISPATCH);
  });
  afterEach(() => { closeTestApp(t); });

  function postedDelivery(customerId, qty = 5) {
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customerId, lines: [{ productId: p.id, qty, unitPrice: 100 }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(dn.id, SALES);
    return t.app.commands.postDeliveryNote(dn.id, { actor: SALES });
  }

  function readyRoute() {
    const r = t.app.commands.createRoute({}, DISPATCH);
    t.app.commands.assignRoute(r.id, { driverId: driver.id, vehicleId: vehicle.id }, DISPATCH);
    return r;
  }

  it('registers crew with validation and activity gates', () => {
    assert.throws(() => t.app.commands.createDriver({ code: 'DRV-1', name: 'dup' }, DISPATCH), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createDriver({ code: '', name: 'x' }, DISPATCH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createVehicle({ code: 'TRK-1' }, DISPATCH), (e) => e.code === 'CONFLICT');
    assert.throws(() => t.app.commands.createDriver({ code: 'X', name: 'x' }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    t.app.commands.setDriverActive(driver.id, false, DISPATCH);
    const r = t.app.commands.createRoute({}, DISPATCH);
    assert.throws(() => t.app.commands.assignRoute(r.id, { driverId: driver.id, vehicleId: vehicle.id }, DISPATCH), (e) => e.code === 'INVALID_STATE');
    t.app.commands.setDriverActive(driver.id, true, DISPATCH);
    t.app.commands.assignRoute(r.id, { driverId: driver.id, vehicleId: vehicle.id }, DISPATCH);
    assert.equal(t.app.queries.getRoute(r.id).driver.code, 'DRV-1');
  });

  it('builds routes with customer stops and posted delivery links', () => {
    const d1 = postedDelivery(c1.id);
    const r = readyRoute();
    const s1 = t.app.commands.addStop(r.id, { partyId: c1.id, deliveryDocId: d1.id }, DISPATCH);
    assert.equal(s1.stop_no, 1);
    const s2 = t.app.commands.addStop(r.id, { partyCode: c2.code }, DISPATCH);
    assert.equal(s2.stop_no, 2);
    assert.throws(() => t.app.commands.addStop(r.id, { partyId: c1.id, deliveryDocId: d1.id }, DISPATCH), (e) => e.code === 'CONFLICT');
    const supplier = t.app.commands.createParty({ displayName: 'Sup', roles: ['supplier'] });
    assert.throws(() => t.app.commands.addStop(r.id, { partyId: supplier.id }, DISPATCH), (e) => e.code === 'INVALID_STATE');
    const unfinished = t.app.commands.createDocument({ type: 'sales_order', partyId: c1.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }, SALES);
    t.app.commands.confirmDocument(unfinished.id, SALES);
    t.app.commands.postDocument(unfinished.id, SALES);
    const draftDn = t.app.commands.convertDocument(unfinished.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    assert.throws(() => t.app.commands.addStop(r.id, { partyId: c1.id, deliveryDocId: draftDn.id }, DISPATCH), (e) => e.code === 'INVALID_STATE'); // unposted
    assert.throws(() => t.app.commands.addStop(r.id, { partyId: c1.id }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.addStop(99999, { partyId: c1.id }, DISPATCH), (e) => e.code === 'NOT_FOUND');
  });

  it('loads only crewed routes with committed goods', () => {
    const r = t.app.commands.createRoute({}, DISPATCH);
    assert.throws(() => t.app.commands.loadRoute(r.id, DISPATCH), (e) => e.code === 'INVALID_STATE'); // no crew, no stops
    t.app.commands.assignRoute(r.id, { driverId: driver.id, vehicleId: vehicle.id }, DISPATCH);
    assert.throws(() => t.app.commands.loadRoute(r.id, DISPATCH), (e) => e.code === 'INVALID_STATE'); // no stops
    const d1 = postedDelivery(c1.id);
    t.app.commands.addStop(r.id, { partyId: c1.id, deliveryDocId: d1.id }, DISPATCH);
    const loaded = t.app.commands.loadRoute(r.id, DISPATCH);
    assert.equal(loaded.status, 'loaded');
    assert.throws(() => t.app.commands.assignRoute(r.id, { driverId: driver.id, vehicleId: vehicle.id }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.loadRoute(r.id, DISPATCH), (e) => e.code === 'VALIDATION'); // already loaded
  });

  it('dispatches, completes stops, and closes by outcome mix', () => {
    const d1 = postedDelivery(c1.id);
    const d2 = postedDelivery(c2.id);
    const r = readyRoute();
    const s1 = t.app.commands.addStop(r.id, { partyId: c1.id, deliveryDocId: d1.id }, DISPATCH);
    const s2 = t.app.commands.addStop(r.id, { partyId: c2.id, deliveryDocId: d2.id }, DISPATCH);
    assert.throws(() => t.app.commands.completeStop(s1.id, {}, DISPATCH), (e) => e.code === 'INVALID_STATE'); // not dispatched
    t.app.commands.loadRoute(r.id, DISPATCH);
    t.app.commands.dispatchRoute(r.id, DISPATCH);
    assert.throws(() => t.app.commands.assignRoute(r.id, { driverId: driver.id }, DISPATCH), (e) => e.code === 'INVALID_STATE'); // crew locked at dispatch
    assert.throws(() => t.app.commands.dispatchRoute(r.id, DISPATCH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.completeRoute(r.id, 'delivered', DISPATCH), (e) => e.code === 'INVALID_STATE'); // pending stops
    t.app.commands.completeStop(s1.id, { collectedAmount: 500 }, DISPATCH);
    assert.throws(() => t.app.commands.failStop(s2.id, {}, DISPATCH), (e) => e.code === 'VALIDATION'); // reason required
    t.app.commands.failStop(s2.id, { reason: 'customer_absent' }, DISPATCH);
    assert.throws(() => t.app.commands.completeRoute(r.id, 'delivered', DISPATCH), (e) => e.code === 'INVALID_STATE'); // mixed ≠ delivered
    assert.throws(() => t.app.commands.completeRoute(r.id, 'failed', DISPATCH), (e) => e.code === 'INVALID_STATE'); // one delivered
    const partial = t.app.commands.completeRoute(r.id, 'partial', DISPATCH);
    assert.equal(partial.status, 'partial');
    const full = t.app.queries.getRoute(r.id);
    assert.equal(full.stops.find((s) => s.id === s1.id).collected_amount, 500);
    // route ops move no stock: deliveries already posted it earlier
    assert.equal(t.app.queries.getStock(p.id, 1), 90);
  });

  it('closes clean and failed runs and cancels planned work', () => {
    const r = readyRoute();
    const d1 = postedDelivery(c1.id);
    t.app.commands.addStop(r.id, { partyId: c1.id, deliveryDocId: d1.id }, DISPATCH);
    t.app.commands.loadRoute(r.id, DISPATCH);
    t.app.commands.dispatchRoute(r.id, DISPATCH);
    const stop = t.app.queries.getRoute(r.id).stops[0];
    t.app.commands.completeStop(stop.id, {}, DISPATCH);
    assert.equal(t.app.commands.completeRoute(r.id, 'delivered', DISPATCH).status, 'delivered');
    const r2 = readyRoute();
    const dd = postedDelivery(c2.id);
    t.app.commands.addStop(r2.id, { partyId: c2.id, deliveryDocId: dd.id }, DISPATCH);
    t.app.commands.loadRoute(r2.id, DISPATCH);
    t.app.commands.dispatchRoute(r2.id, DISPATCH);
    const stop2 = t.app.queries.getRoute(r2.id).stops[0];
    t.app.commands.failStop(stop2.id, { reason: 'refused' }, DISPATCH);
    assert.equal(t.app.commands.completeRoute(r2.id, 'failed', DISPATCH).status, 'failed');
    const r3 = t.app.commands.createRoute({}, DISPATCH);
    t.app.commands.cancelRoute(r3.id, 'no driver today', DISPATCH);
    assert.equal(t.app.queries.getRoute(r3.id).status, 'cancelled');
    assert.throws(() => t.app.commands.cancelRoute(r.id, 'too late', DISPATCH), (e) => e.code === 'VALIDATION'); // delivered terminal
    assert.throws(() => t.app.commands.cancelRoute(r2.id, 'x', DISPATCH), (e) => e.code === 'VALIDATION');
  });

  it('rejects illegal jumps and missing prerequisites', () => {
    const r = t.app.commands.createRoute({}, DISPATCH);
    assert.throws(() => t.app.commands.dispatchRoute(r.id, PLANNER), (e) => e.code === 'FORBIDDEN');
    assert.throws(() => t.app.commands.dispatchRoute(r.id, DISPATCH), (e) => e.code === 'VALIDATION'); // planned→out illegal
    assert.throws(() => t.app.commands.completeRoute(r.id, 'delivered', DISPATCH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.createRoute({ routeDate: 'yesterday' }, DISPATCH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.completeRoute(r.id, 'teleported', DISPATCH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.cancelRoute(r.id, '', DISPATCH), (e) => e.code === 'VALIDATION');
  });
});
