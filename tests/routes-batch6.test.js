'use strict';
// Batch 6 gate: distribution is real routes/stops/loading/settlements.
// No GPS/map, no fake positions, crew/status guards from the server.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTestApp, closeTestApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');

describe('batch6 distribution contract', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  function cust(code = 'B6C') {
    return t.app.commands.createParty({ displayName: code, roles: ['customer'] });
  }

  it('route lifecycle: crew → stops → load → dispatch → stops → complete/partial mix', () => {
    const d = t.app.commands.createDriver({ code: 'DRV-B6', name: 'B6 driver' });
    const v = t.app.commands.createVehicle({ code: 'VH-B6' });
    const c1 = cust('B6C1');
    const c2 = cust('B6C2');
    let r = t.app.commands.createRoute({ routeDate: '2026-10-09' });
    assert.equal(r.status, 'planned');
    assert.throws(() => t.app.commands.loadRoute(r.id), (e) => e.code === 'INVALID_STATE');
    t.app.commands.assignRoute(r.id, { driverId: d.id, vehicleId: v.id });
    t.app.commands.addStop(r.id, { partyCode: c1.code });
    t.app.commands.addStop(r.id, { partyCode: c2.code });
    assert.throws(() => t.app.commands.dispatchRoute(r.id), (e) => e.code === 'VALIDATION' || e.code === 'INVALID_STATE');
    t.app.commands.loadRoute(r.id);
    assert.equal(t.app.queries.getRoute(r.id).status, 'loaded');
    t.app.commands.dispatchRoute(r.id);
    const full = t.app.queries.getRoute(r.id);
    t.app.commands.completeStop(full.stops[0].id, { collectedAmount: 100 });
    t.app.commands.failStop(full.stops[1].id, { reason: 'customer_absent' });
    assert.throws(() => t.app.commands.completeRoute(r.id, 'delivered'), (e) => e.code === 'INVALID_STATE');
    const done = t.app.commands.completeRoute(r.id, 'partial');
    assert.equal(done.status, 'partial');
  });

  it('loading reservations guard coverage; settlement links a payment', () => {
    const p = t.app.commands.createProduct({ sku: 'B6-P', name: 'b6' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 20 }] });
    t.app.commands.createCashAccount({ code: 'TILL', name: 'Till' });
    const c = cust('B6S');
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: c.id, lines: [{ productId: p.id, qty: 6, unitPrice: 50 }] });
    t.app.commands.confirmDocument(o.id);
    t.app.commands.postDocument(o.id);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN' });
    t.app.commands.confirmDocument(dn.id);
    t.app.commands.postDeliveryNote(dn.id, {});
    const d = t.app.commands.createDriver({ code: 'DRV-B6B', name: 'D' });
    const v = t.app.commands.createVehicle({ code: 'VH-B6B' });
    const r = t.app.commands.createRoute({});
    t.app.commands.assignRoute(r.id, { driverId: d.id, vehicleId: v.id });
    t.app.commands.addStop(r.id, { partyCode: c.code, deliveryDocId: dn.id });
    const res = t.app.commands.reserveStock(r.id, { productId: p.id, warehouseId: 1, qty: 6 });
    assert.equal(res.qty, 6);
    const r2 = t.app.commands.createRoute({});
    assert.throws(() => t.app.commands.reserveStock(r2.id, { productId: p.id, warehouseId: 1, qty: 9 }), (e) => e.code === 'INVALID_STATE');
    t.app.commands.loadRoute(r.id);
    t.app.commands.dispatchRoute(r.id);
    const stop = t.app.queries.getRoute(r.id).stops[0];
    t.app.commands.completeStop(stop.id, { collectedAmount: 300 });
    const before = t.app.queries.routeReconciliation(r.id);
    assert.equal(before.outstanding, 300);
    const s = t.app.commands.settleStop(stop.id, { amount: 300, method: 'cash', cashAccountCode: 'TILL' });
    assert.equal(s.outstanding, 0);
    const after = t.app.queries.routeReconciliation(r.id);
    assert.equal(after.outstanding, 0);
  });

  it('crew guards: inactive crew blocks dispatch; stops lock after dispatch', () => {
    const d = t.app.commands.createDriver({ code: 'DRV-B6C', name: 'D' });
    const v = t.app.commands.createVehicle({ code: 'VH-B6C' });
    const c = cust('B6G');
    const r = t.app.commands.createRoute({});
    t.app.commands.assignRoute(r.id, { driverId: d.id, vehicleId: v.id });
    t.app.commands.addStop(r.id, { partyCode: c.code });
    t.app.commands.loadRoute(r.id);
    t.app.commands.setDriverActive(d.id, false);
    assert.throws(() => t.app.commands.dispatchRoute(r.id), (e) => e.code === 'INVALID_STATE');
    t.app.commands.setDriverActive(d.id, true);
    t.app.commands.dispatchRoute(r.id);
    assert.throws(() => t.app.commands.addStop(r.id, { partyCode: c.code }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => t.app.commands.assignRoute(r.id, { driverId: d.id }), (e) => e.code === 'INVALID_STATE');
  });

  it('frontend has no GPS/map claims and wires real distribution methods', () => {
    const must = [
      'api.assignRoute', 'api.removeStop', 'api.loadRoute', 'api.dispatchRoute',
      'api.completeStop', 'api.failStop', 'api.completeRoute', 'api.cancelRoute',
      'api.listDrivers', 'api.createDriver', 'api.setDriverActive',
      'api.listVehicles', 'api.createVehicle', 'api.setVehicleActive',
      'api.reserveStock', 'api.releaseReservations', 'api.listReservations', 'api.availableStock',
      'api.settleStop', 'api.getStopSettlement', 'api.routeReconciliation',
      'customer_absent', 'collectedAmount', 'proofRef',
    ];
    for (const m of must) assert.ok(FRONT.includes(m), `frontend must use ${m}`);
    const I18N_SRC = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'i18n.js'), 'utf8');
    assert.ok(/hNoGps/.test(I18N_SRC) && /GPS/.test(I18N_SRC), 'GPS gap stated in dictionary');
    assert.ok(/t\('hNoGps'\)/.test(FRONT), 'GPS gap rendered from dictionary');
    assert.ok(!/Mapbox|leaflet|google\.maps/i.test(FRONT), 'no map vendor integration claimed');
  });

  it('renderer stays display-only after batch 6', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
  });
});
