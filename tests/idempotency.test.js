'use strict';
// Phase 27: idempotency tests for critical commands
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('idempotency (critical commands)', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  function setupSupply() {
    const p = t.app.commands.createProduct({ sku: 'IDEM-1', name: 'Idem Item', defaultUnitCost: 500 });
    const c = t.app.commands.createParty({ code: 'IDEM-C1', name: 'Supplier', type: 'supplier', displayName: 'Supplier' });
    return { product: p, supplier: c };
  }

  it('receiveStock: duplicate operationKey rejected', () => {
    const { product, supplier } = setupSupply();
    const key = 'idem-recv-00000000-0000-0000-0000-000000000001';
    
    // First call succeeds
    const r1 = t.app.commands.receiveStock({
      receiptNo: 'R-1', warehouseCode: 'MAIN',
      lines: [{ productId: product.id, qty: 10, unitCost: 500 }],
      operationKey: key
    }, 'tester');
    assert.ok(r1.id);
    
    // Second call with same key fails
    assert.throws(() => t.app.commands.receiveStock({
      receiptNo: 'R-2', warehouseCode: 'MAIN',
      lines: [{ productId: product.id, qty: 5, unitCost: 500 }],
      operationKey: key
    }, 'tester'), (e) => e.code === 'CONFLICT' && e.message.includes('duplicate receive_stock'));
  });

  it('postInvoice: duplicate operationKey rejected', () => {
    const p = t.app.commands.createProduct({ sku: 'IDEM-2', name: 'Inv Item', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'IDEM-C2', name: 'Customer', type: 'customer', displayName: 'Customer' });
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-ID2', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');
    
    const key = 'idem-inv-00000000-0000-0000-0000-000000000001';
    
    // First call succeeds
    t.app.commands.postInvoice(inv.id, { operationKey: key }, 'tester');
    
    // Second call with same key fails
    assert.throws(() => t.app.commands.postInvoice(inv.id, { operationKey: key }, 'tester'), (e) => e.code === 'CONFLICT' && e.message.includes('duplicate post_invoice'));
  });

  it('postDeliveryNote: duplicate operationKey rejected', () => {
    const p = t.app.commands.createProduct({ sku: 'IDEM-3', name: 'DN Item', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'IDEM-C3', name: 'Customer', type: 'customer', displayName: 'Customer' });
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-ID3', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    
    const key = 'idem-dn-00000000-0000-0000-0000-000000000001';
    
    // First call succeeds
    t.app.commands.postDeliveryNote(dn.id, { operationKey: key }, 'tester');
    
    // Second call with same key fails
    assert.throws(() => t.app.commands.postDeliveryNote(dn.id, { operationKey: key }, 'tester'), (e) => e.code === 'CONFLICT' && e.message.includes('duplicate post_delivery'));
  });

  it('recordPayment: duplicate operationKey rejected', () => {
    const p = t.app.commands.createProduct({ sku: 'IDEM-4', name: 'Pay Item', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'IDEM-C4', name: 'Customer', type: 'customer', displayName: 'Customer' });
    t.app.commands.createCashAccount({ code: 'TILL', name: 'Test Till' }, 'tester');
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-ID4', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');
    t.app.commands.postInvoice(inv.id, 'tester');
    
    const key = 'idem-pay-00000000-0000-0000-0000-000000000001';
    
    // First call succeeds
    t.app.commands.recordPayment({
      direction: 'in', method: 'cash', amount: 1000, paymentDate: '2026-10-08',
      partyId: c.id, cashAccountCode: 'TILL',
      allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 1000 }],
      operationKey: key
    }, 'tester');
    
    // Second call with same key fails
    assert.throws(() => t.app.commands.recordPayment({
      direction: 'in', method: 'cash', amount: 500, paymentDate: '2026-10-08',
      partyId: c.id, cashAccountCode: 'TILL',
      allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 500 }],
      operationKey: key
    }, 'tester'), (e) => e.code === 'CONFLICT' && e.message.includes('duplicate record_payment'));
  });

  it('reserveStock: duplicate operationKey rejected', () => {
    const p = t.app.commands.createProduct({ sku: 'IDEM-5', name: 'Reserve Item' });
    const c = t.app.commands.createParty({ code: 'IDEM-C5', name: 'Customer', type: 'customer', displayName: 'Customer' });
    const driver = t.app.commands.createDriver({ code: 'DRV-ID5', name: 'Test Driver' }, 'tester');
    const vehicle = t.app.commands.createVehicle({ code: 'VEH-ID5', registration: 'TEST-001' }, 'tester');
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-ID5', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const route = t.app.commands.createRoute({ routeNo: 'R-ID5', name: 'Test Route', routeDate: '2026-10-08' }, 'tester');
    t.app.commands.addStop(route.id, { partyId: c.id, deliveryDocId: dn.id }, 'tester');
    t.app.commands.assignRoute(route.id, { driverId: driver.id, vehicleId: vehicle.id }, 'tester');
    t.app.commands.loadRoute(route.id, 'tester');
    // Reserve stock BEFORE dispatch (route must be planned/loaded)
    
    const key = 'idem-res-00000000-0000-0000-0000-000000000001';
    
    // First call succeeds
    t.app.commands.reserveStock(route.id, { productId: p.id, qty: 5, warehouseCode: 'MAIN', operationKey: key }, 'tester');
    
    // Second call with same key fails
    assert.throws(() => t.app.commands.reserveStock(route.id, { productId: p.id, qty: 3, warehouseCode: 'MAIN', operationKey: key }, 'tester'), (e) => e.code === 'CONFLICT' && e.message.includes('duplicate reserve_stock'));
    
    t.app.commands.dispatchRoute(route.id, 'tester');
  });

  it('completeStop: duplicate operationKey rejected', () => {
    const p = t.app.commands.createProduct({ sku: 'IDEM-6', name: 'Stop Item', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'IDEM-C6', name: 'Customer', type: 'customer', displayName: 'Customer' });
    const driver = t.app.commands.createDriver({ code: 'DRV-ID6', name: 'Test Driver' }, 'tester');
    const vehicle = t.app.commands.createVehicle({ code: 'VEH-ID6', registration: 'TEST-001' }, 'tester');
    const q = t.app.commands.createDocument({ type: 'sales_quote', partyId: c.id, lines: [{ productId: p.id, qty: 1, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(q.id, 'tester');
    const ord = t.app.commands.convertDocument(q.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(ord.id, 'tester');
    t.app.commands.postDocument(ord.id, 'tester');
    const dn = t.app.commands.convertDocument(ord.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'R-ID6', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 10 }] }, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    const route = t.app.commands.createRoute({ routeNo: 'R-ID6', name: 'Test Route', routeDate: '2026-10-08' }, 'tester');
    t.app.commands.addStop(route.id, { partyId: c.id, deliveryDocId: dn.id }, 'tester');
    t.app.commands.assignRoute(route.id, { driverId: driver.id, vehicleId: vehicle.id }, 'tester');
    t.app.commands.loadRoute(route.id, 'tester');
    t.app.commands.dispatchRoute(route.id, 'tester');
    
    const stopId = t.app.queries.getRoute(route.id).stops[0].id;
    const key = 'idem-stop-00000000-0000-0000-0000-000000000001';
    
    // First call succeeds
    t.app.commands.completeStop(stopId, { collectedAmount: 1000, operationKey: key }, 'tester');
    
    // Second call with same key fails (stop no longer pending)
    assert.throws(() => t.app.commands.completeStop(stopId, { collectedAmount: 500, operationKey: key }, 'tester'), (e) => e.code === 'CONFLICT' && e.message.includes('duplicate complete_stop'));
  });
});
