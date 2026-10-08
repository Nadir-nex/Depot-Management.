'use strict';
// Phase 27: Performance benchmarks (quick sanity checks, not full load test)
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTestApp, closeTestApp } = require('./helpers');

describe('performance sanity checks', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('product lookup by barcode is fast', () => {
    const p = t.app.commands.createProduct({ sku: 'PERF-1', name: 'Perf Item', defaultSalePrice: 1000 });
    t.app.commands.addBarcode(p.id, { code: '1234567890123' }, 'tester');
    
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) {
      t.app.queries.resolveBarcode('1234567890123');
    }
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    assert.ok(ms < 100, `100 barcode lookups took ${ms}ms, expected < 100ms`);
  });

  it('customer search is fast', () => {
    const c = t.app.commands.createParty({ code: 'PERF-C1', name: 'Performance Customer', type: 'customer', displayName: 'Performance Customer' });
    
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) {
      t.app.queries.listParties({ search: 'Performance' });
    }
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    assert.ok(ms < 100, `100 customer searches took ${ms}ms, expected < 100ms`);
  });

  it('stock list is fast', () => {
    const p = t.app.commands.createProduct({ sku: 'PERF-2', name: 'Stock Perf', defaultSalePrice: 1000 });
    t.app.commands.receiveStock({ receiptNo: 'R-PERF', warehouseCode: 'MAIN', lines: [{ productId: p.id, qty: 100 }] }, 'tester');
    
    const start = process.hrtime.bigint();
    for (let i = 0; i < 50; i++) {
      t.app.queries.listStock('MAIN');
    }
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    assert.ok(ms < 200, `50 stock lists took ${ms}ms, expected < 200ms`);
  });

  it('document creation throughput', () => {
    const p = t.app.commands.createProduct({ sku: 'PERF-3', name: 'Doc Perf', defaultSalePrice: 1000 });
    const c = t.app.commands.createParty({ code: 'PERF-C2', name: 'Cust', type: 'customer', displayName: 'Cust' });
    
    const start = process.hrtime.bigint();
    for (let i = 0; i < 20; i++) {
      t.app.commands.createDocument({
        type: 'sales_quote',
        partyId: c.id,
        lines: [{ productId: p.id, qty: 1, unitPrice: 1000 }],
      }, 'tester');
    }
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;
    assert.ok(ms < 500, `20 document creates took ${ms}ms, expected < 500ms`);
  });
});
