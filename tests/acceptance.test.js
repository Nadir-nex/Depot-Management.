'use strict';
// Phase 28: Acceptance scenarios (realistic full-business flows)
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('acceptance scenarios', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  // Scenario A — Purchase to sale
  it('Scenario A: Purchase to Sale (supplier -> receipt -> stock -> order -> BL -> invoice -> payment)', () => {
    // Create cash account
    t.app.commands.createCashAccount({ code: 'TILL', name: 'Main till' }, 'tester');
    // 1. Create supplier
    const supplier = t.app.commands.createParty({ code: 'ACC-SUP1', name: 'Acme Supplies', type: 'supplier', displayName: 'Acme Supplies' }, 'tester');
    // 2. Create product
    const product = t.app.commands.createProduct({ sku: 'ACC-P1', name: 'Acceptance Widget', defaultUnitCost: 500, defaultSalePrice: 1000 }, 'tester');
    // 3. Create customer
    const customer = t.app.commands.createParty({ code: 'ACC-CUST1', name: 'Best Buyer', type: 'customer', displayName: 'Best Buyer' }, 'tester');
    // 4. Purchase receipt (receive stock)
    t.app.commands.receiveStock({ receiptNo: 'PR-001', warehouseCode: 'MAIN', lines: [{ productId: product.id, qty: 100, unitCost: 500 }] }, 'tester');
    // 4b. Verify stock received
    const stock1 = t.app.queries.listStock('MAIN').rows.find(r => r.sku === 'ACC-P1');
    assert.equal(stock1.stock, 100);
    // 5. Sales quote
    const quote = t.app.commands.createDocument({ type: 'sales_quote', partyId: customer.id, lines: [{ productId: product.id, qty: 10, unitPrice: 1000 }] }, 'tester');
    // 6. Quote -> Order
    t.app.commands.confirmDocument(quote.id, 'tester');
    const order = t.app.commands.convertDocument(quote.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(order.id, 'tester');
    t.app.commands.postDocument(order.id, 'tester');
    // 7. Order -> Delivery Note (BL)
    const dn = t.app.commands.convertDocument(order.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    // 7b. Verify stock reduced
    const stock2 = t.app.queries.listStock('MAIN').rows.find(r => r.sku === 'ACC-P1');
    assert.equal(stock2.stock, 90);
    // 8. Delivery Note -> Invoice
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');
    t.app.commands.postInvoice(inv.id, 'tester');
    // 9. Payment
    t.app.commands.recordPayment({ direction: 'in', method: 'cash', amount: 10000, paymentDate: '2026-10-08', partyId: customer.id, cashAccountCode: 'TILL', allocations: [{ targetType: 'sales_invoice', targetId: inv.id, amount: 10000 }] }, 'tester');
    // 10. Verify receivable settled
    const bal = t.app.queries.partyBalance(customer.id);
    assert.equal(bal.net, 0);
    // 11. Verify audit trail
    const audit = t.app.queries.recentAudit({ limit: 50 });
    assert.ok(audit.some(a => a.operation === 'stock.receive'));
    assert.ok(audit.some(a => a.operation === 'document.post'));
    assert.ok(audit.some(a => a.operation === 'payment.record'));
  });

  // Scenario B — Partial fulfillment
  it('Scenario B: Partial fulfillment (large order -> partial delivery -> remaining order -> final invoice)', () => {
    const customer = t.app.commands.createParty({ code: 'ACC-CUST2', name: 'Partial Buyer', type: 'customer', displayName: 'Partial Buyer' }, 'tester');
    const product = t.app.commands.createProduct({ sku: 'ACC-P2', name: 'Bulk Item', defaultSalePrice: 1000 }, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'PR-002', warehouseCode: 'MAIN', lines: [{ productId: product.id, qty: 100, unitCost: 500 }] }, 'tester');
    
    const quote = t.app.commands.createDocument({ type: 'sales_quote', partyId: customer.id, lines: [{ productId: product.id, qty: 50, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(quote.id, 'tester');
    const order = t.app.commands.convertDocument(quote.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(order.id, 'tester');
    t.app.commands.postDocument(order.id, 'tester');
    
    // Partial delivery: 30 of 50
    const dn1 = t.app.commands.convertDocument(order.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester', quantities: [{ sourceLineId: order.lines[0].id, qty: 30 }] }, 'tester');
    t.app.commands.confirmDocument(dn1.id, 'tester');
    t.app.commands.postDeliveryNote(dn1.id, 'tester');
    
    const stockAfter1 = t.app.queries.listStock('MAIN').rows.find(r => r.sku === 'ACC-P2');
    assert.equal(stockAfter1.stock, 70); // 100 - 30
    
    // Remaining delivery: 20 of 50
    const dn2 = t.app.commands.convertDocument(order.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester', quantities: [{ sourceLineId: order.lines[0].id, qty: 20 }] }, 'tester');
    t.app.commands.confirmDocument(dn2.id, 'tester');
    t.app.commands.postDeliveryNote(dn2.id, 'tester');
    
    const stockAfter2 = t.app.queries.listStock('MAIN').rows.find(r => r.sku === 'ACC-P2');
    assert.equal(stockAfter2.stock, 50); // 100 - 30 - 20
    
    // Convert both deliveries to one invoice
    const inv = t.app.commands.convertDeliveriesToInvoice([dn1.id, dn2.id], { actor: 'tester' });
    t.app.commands.confirmDocument(inv.id, 'tester');
    const invPosted = t.app.commands.postInvoice(inv.id, 'tester');
    
    // Invoice should cover 50 units
    assert.equal(invPosted.grandTotal, 50000); // 50 * 1000
  });

  // Scenario C — Return
  it('Scenario C: Return (sale -> delivery -> return -> stock restoration -> financial adjustment)', () => {
    const customer = t.app.commands.createParty({ code: 'ACC-CUST3', name: 'Return Buyer', type: 'customer', displayName: 'Return Buyer' }, 'tester');
    const product = t.app.commands.createProduct({ sku: 'ACC-P3', name: 'Returnable Item', defaultSalePrice: 1000 }, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'PR-003', warehouseCode: 'MAIN', lines: [{ productId: product.id, qty: 50, unitCost: 500 }] }, 'tester');
    
    const quote = t.app.commands.createDocument({ type: 'sales_quote', partyId: customer.id, lines: [{ productId: product.id, qty: 10, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(quote.id, 'tester');
    const order = t.app.commands.convertDocument(quote.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(order.id, 'tester');
    t.app.commands.postDocument(order.id, 'tester');
    const dn = t.app.commands.convertDocument(order.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    
    const stockAfterSale = t.app.queries.listStock('MAIN').rows.find(r => r.sku === 'ACC-P3');
    assert.equal(stockAfterSale.stock, 40);
    
    // Create return (3 units back) BEFORE invoicing - delivery line still has remaining qty
    const ret = t.app.commands.createCustomerReturn(dn.id, { lines: [{ sourceLineId: dn.lines[0].id, qty: 3, unitPrice: 1000, reason: 'Damaged' }] }, 'tester');
    const retConfirmed = t.app.commands.confirmDocument(ret.id, 'tester');
    const retPosted = t.app.commands.postCustomerReturn(ret.id, { warehouseCode: 'MAIN', reason: 'damaged' }, 'tester');
    
    const stockAfterReturn = t.app.queries.listStock('MAIN').rows.find(r => r.sku === 'ACC-P3');
    assert.equal(stockAfterReturn.stock, 43); // 40 + 3 returned
    
    // Return creates credit note (customer_return doc)
    assert.equal(retPosted.docType, 'customer_return');
    assert.equal(retPosted.status, 'posted');
    assert.ok(retPosted.grandTotal > 0);
    
    // Now invoice the remaining 7 units
    const inv = t.app.commands.convertDocument(dn.id, 'sales_invoice', { actor: 'tester', quantities: [{ sourceLineId: dn.lines[0].id, qty: 7 }] });
    t.app.commands.confirmDocument(inv.id, 'tester');
    const invPosted = t.app.commands.postInvoice(inv.id, 'tester');
    assert.equal(invPosted.grandTotal, 7000); // 7 * 1000
  });

  // Scenario D — Route operation
  it('Scenario D: Route operation (warehouse -> loading -> route -> delivery -> collection -> settlement)', () => {
    const customer = t.app.commands.createParty({ code: 'ACC-CUST4', name: 'Route Buyer', type: 'customer', displayName: 'Route Buyer' }, 'tester');
    const driver = t.app.commands.createDriver({ code: 'DRV-ACC1', name: 'Alex Driver' }, 'tester');
    const vehicle = t.app.commands.createVehicle({ code: 'VEH-ACC1', registration: 'ABC-123' }, 'tester');
    const product = t.app.commands.createProduct({ sku: 'ACC-P4', name: 'Route Item', defaultSalePrice: 1000 }, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'PR-004', warehouseCode: 'MAIN', lines: [{ productId: product.id, qty: 100, unitCost: 500 }] }, 'tester');
    
    const quote = t.app.commands.createDocument({ type: 'sales_quote', partyId: customer.id, lines: [{ productId: product.id, qty: 20, unitPrice: 1000 }] }, 'tester');
    t.app.commands.confirmDocument(quote.id, 'tester');
    const order = t.app.commands.convertDocument(quote.id, 'sales_order', { actor: 'tester' });
    t.app.commands.confirmDocument(order.id, 'tester');
    t.app.commands.postDocument(order.id, 'tester');
    const dn = t.app.commands.convertDocument(order.id, 'delivery_note', { warehouseCode: 'MAIN', actor: 'tester' });
    t.app.commands.confirmDocument(dn.id, 'tester');
    t.app.commands.postDeliveryNote(dn.id, 'tester');
    
    // Create route
    const route = t.app.commands.createRoute({ routeNo: 'ACC-RT-001', name: 'Acceptance Route', routeDate: '2026-10-08' }, 'tester');
    t.app.commands.addStop(route.id, { partyId: customer.id, deliveryDocId: dn.id }, 'tester');
    t.app.commands.assignRoute(route.id, { driverId: driver.id, vehicleId: vehicle.id }, 'tester');
    t.app.commands.loadRoute(route.id, 'tester');
    t.app.commands.reserveStock(route.id, { productId: product.id, qty: 20, warehouseCode: 'MAIN' }, 'tester');
    t.app.commands.dispatchRoute(route.id, 'tester');
    
    // Complete stop with collection
    const stopId = t.app.queries.getRoute(route.id).stops[0].id;
    t.app.commands.completeStop(stopId, { collectedAmount: 20000, proofRef: 'SIGN-001' }, 'tester');
    t.app.commands.completeRoute(route.id, 'delivered', 'tester');
    
    // Verify stop completed with collection
    const routeAfter = t.app.queries.getRoute(route.id);
    const stop = routeAfter.stops[0];
    assert.equal(stop.collected_amount, 20000);
    assert.equal(stop.status, 'delivered');
  });

  // Scenario E — Inventory discrepancy
  it('Scenario E: Inventory discrepancy (expected -> physical count -> variance -> approval -> adjustment)', () => {
    const product = t.app.commands.createProduct({ sku: 'ACC-P5', name: 'Count Item', defaultUnitCost: 500 }, 'tester');
    t.app.commands.receiveStock({ receiptNo: 'PR-005', warehouseCode: 'MAIN', lines: [{ productId: product.id, qty: 100, unitCost: 500 }] }, 'tester');
    
    // System shows 100
    const stockBefore = t.app.queries.listStock('MAIN').rows.find(r => r.sku === 'ACC-P5');
    assert.equal(stockBefore.stock, 100);
    
    // Physical count finds 97 (3 missing)
    const count = t.app.commands.createCount({ warehouseCode: 'MAIN', name: 'Discrepancy Count' }, 'tester');
    const line = t.app.commands.addCountLine(count.id, { productId: product.id, countedQty: 97 }, 'tester');
    t.app.commands.updateCountLine(line.id, { reasonCode: 'damaged' }, 'tester');
    t.app.commands.submitCount(count.id, 'tester');
    t.app.commands.approveCount(count.id, 'tester');
    t.app.commands.postCount(count.id, 'tester');
    
    // Stock adjusted to 97
    const stockAfter = t.app.queries.listStock('MAIN').rows.find(r => r.sku === 'ACC-P5');
    assert.equal(stockAfter.stock, 97);
    
    // Movement recorded as adjustment
    const movements = t.app.queries.listMovements({ productId: product.id, limit: 5 });
    assert.ok(movements.some(m => m.movement_type === 'adjustment' && m.qty === -3));
  });

  // Scenario F — Failure safety
  it('Scenario F: Failure safety (duplicate clicks/interrupted process -> no duplicates)', () => {
    const product = t.app.commands.createProduct({ sku: 'ACC-P6', name: 'Safety Item', defaultUnitCost: 500, defaultSalePrice: 1000 });
    const customer = t.app.commands.createParty({ code: 'ACC-CUST5', name: 'Safety Buyer', type: 'customer', displayName: 'Safety Buyer' });
    const key = 'acc-fail-safe-00000000-0000-0000-0000-000000000001';
    
    // Rapid double-click on receiveStock with same key
    const r1 = t.app.commands.receiveStock({ receiptNo: 'PR-F1', warehouseCode: 'MAIN', lines: [{ productId: product.id, qty: 10, unitCost: 500 }], operationKey: key }, 'tester');
    assert.throws(() => t.app.commands.receiveStock({ receiptNo: 'PR-F2', warehouseCode: 'MAIN', lines: [{ productId: product.id, qty: 5, unitCost: 500 }], operationKey: key }, 'tester'), (e) => e.code === 'CONFLICT');
    
    // Verify only one receipt was created (the first one)
    assert.ok(r1.id);
    assert.equal(r1.receipt_no, 'PR-F1');
    assert.equal(r1.lines[0].qty, 10);
  });
});
