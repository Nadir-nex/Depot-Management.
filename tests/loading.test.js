'use strict';
// Phase 20 gate: reservations guard planning/loading with zero movements.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

const DISPATCH = { actor: 'd', grants: ['deliveries.create', 'deliveries.complete'] };
const SALES = { actor: 's', grants: ['sales.create', 'sales.post', 'sales.cancel', 'deliveries.create', 'deliveries.complete'] };

describe('loading', () => {
  let t, p, c1, c2;
  beforeEach(() => {
    t = makeTestApp();
    p = t.app.commands.createProduct({ sku: 'LD-1', name: 'L' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 100, unitCost: 10 }] });
    c1 = t.app.commands.createParty({ displayName: 'Shop 1', roles: ['customer'] });
    c2 = t.app.commands.createParty({ displayName: 'Shop 2', roles: ['customer'] });
  });
  afterEach(() => { closeTestApp(t); });

  let crewNo = 0;
  function routeWith() {
    crewNo += 1;
    const driver = t.app.commands.createDriver({ code: `D${crewNo}`, name: 'D' }, DISPATCH);
    const vehicle = t.app.commands.createVehicle({ code: `V${crewNo}` }, DISPATCH);
    const r = t.app.commands.createRoute({}, DISPATCH);
    t.app.commands.assignRoute(r.id, { driverId: driver.id, vehicleId: vehicle.id }, DISPATCH);
    return r;
  }

  function postedDelivery(customerId, qty = 10) {
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: customerId, lines: [{ productId: p.id, qty, unitPrice: 50 }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(dn.id, SALES);
    return t.app.commands.postDeliveryNote(dn.id, { actor: SALES });
  }

  it('claims stock for planning and blocks over-commitment by others', () => {
    const a = routeWith();
    const b = routeWith();
    t.app.commands.reserveStock(a.id, { productId: p.id, qty: 90 }, DISPATCH);
    assert.throws(() => t.app.commands.reserveStock(b.id, { productId: p.id, qty: 20 }, DISPATCH), (e) => e.code === 'INVALID_STATE');
    t.app.commands.reserveStock(b.id, { productId: p.id, qty: 10 }, DISPATCH);
    assert.equal(t.app.queries.availableStock({ productId: p.id, warehouseId: 1 }), 0);
    assert.equal(t.app.queries.availableStock({ productId: p.id, warehouseId: 1, excludeRouteIds: [a.id] }), 90); // ignoring A's own claim
    assert.throws(() => t.app.commands.reserveStock(a.id, { productId: p.id, qty: 0 }, DISPATCH), (e) => e.code === 'VALIDATION');
    assert.throws(() => t.app.commands.reserveStock(99999, { productId: p.id, qty: 1 }, DISPATCH), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => t.app.commands.reserveStock(a.id, { productId: p.id, qty: 1 }, { actor: 'm', grants: [] }), (e) => e.code === 'FORBIDDEN');
  });

  it('loads with coverage, consumes own claims, releases on completion', () => {
    const d1 = postedDelivery(c1.id, 30);
    const r = routeWith();
    t.app.commands.addStop(r.id, { partyId: c1.id, deliveryDocId: d1.id }, DISPATCH);
    t.app.commands.reserveStock(r.id, { productId: p.id, qty: 30 }, DISPATCH);
    t.app.commands.loadRoute(r.id, DISPATCH);
    assert.equal(t.app.queries.listReservations(r.id).length, 0); // consumed
    assert.equal(t.app.queries.getStock(p.id, 1), 70); // delivery posted earlier; load moves nothing
    t.app.commands.dispatchRoute(r.id, DISPATCH);
    for (const s of t.app.queries.getRoute(r.id).stops) t.app.commands.completeStop(s.id, {}, DISPATCH);
    t.app.commands.completeRoute(r.id, 'delivered', DISPATCH);
    assert.equal(t.app.queries.getStock(p.id, 1), 70); // completion moves nothing either
  });

  it('returns availability when routes cancel before dispatch', () => {
    const a = routeWith();
    const b = routeWith();
    t.app.commands.reserveStock(a.id, { productId: p.id, qty: 100 }, DISPATCH);
    assert.throws(() => t.app.commands.reserveStock(b.id, { productId: p.id, qty: 1 }, DISPATCH), (e) => e.code === 'INVALID_STATE');
    t.app.commands.cancelRoute(a.id, 'no driver', DISPATCH);
    t.app.commands.reserveStock(b.id, { productId: p.id, qty: 100 }, DISPATCH); // freed
    assert.equal(t.app.queries.availableStock({ productId: p.id, warehouseId: 1 }), 0);
    assert.throws(() => t.app.commands.reserveStock(a.id, { productId: p.id, qty: 1 }, DISPATCH), (e) => e.code === 'INVALID_STATE'); // cancelled frozen
  });

  it('blocks delivery posting against other routes claims', () => {
    const a = routeWith();
    t.app.commands.reserveStock(a.id, { productId: p.id, qty: 95 }, DISPATCH);
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: c2.id, lines: [{ productId: p.id, qty: 10, unitPrice: 50 }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(dn.id, SALES);
    assert.throws(() => t.app.commands.postDeliveryNote(dn.id, { actor: SALES }), (e) => e.code === 'INVALID_STATE'); // only 5 free
    t.app.commands.releaseReservations(a.id, DISPATCH);
    t.app.commands.postDeliveryNote(dn.id, { actor: SALES }); // freed: posts
    assert.equal(t.app.queries.getStock(p.id, 1), 90);
  });

  it('scopes claims per lot pool and validates inputs', () => {
    const lot = t.app.commands.createLot(p.id, { lotNo: 'LX' });
    t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 20, lotId: lot.id }] });
    const a = routeWith();
    t.app.commands.reserveStock(a.id, { productId: p.id, lotId: lot.id, qty: 20 }, DISPATCH);
    assert.equal(t.app.queries.availableStock({ productId: p.id, warehouseId: 1, lotId: lot.id }), 0);
    assert.equal(t.app.queries.availableStock({ productId: p.id, warehouseId: 1 }), 100); // untracked pool free
    assert.throws(() => t.app.commands.reserveStock(a.id, { productId: p.id, lotId: 99999, qty: 1 }, DISPATCH), (e) => e.code === 'NOT_FOUND');
    const svc = t.app.commands.createProduct({ sku: 'SVC', name: 'S', productType: 'service' });
    assert.throws(() => t.app.commands.reserveStock(a.id, { productId: svc.id, qty: 1 }, DISPATCH), (e) => e.code === 'INVALID_STATE');
    const o = t.app.commands.createDocument({ type: 'sales_order', partyId: c1.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1 }] }, SALES);
    t.app.commands.confirmDocument(o.id, SALES);
    t.app.commands.postDocument(o.id, SALES);
    const dn = t.app.commands.convertDocument(o.id, 'delivery_note', { warehouseCode: 'MAIN', actor: SALES });
    t.app.commands.confirmDocument(dn.id, SALES);
    t.app.commands.postDeliveryNote(dn.id, { actor: SALES });
    t.app.commands.addStop(a.id, { partyId: c1.id, deliveryDocId: dn.id }, DISPATCH);
    t.app.commands.loadRoute(a.id, DISPATCH);
    t.app.commands.dispatchRoute(a.id, DISPATCH);
    assert.throws(() => t.app.commands.reserveStock(a.id, { productId: p.id, qty: 1 }, DISPATCH), (e) => e.code === 'INVALID_STATE'); // dispatched frozen
  });
});
