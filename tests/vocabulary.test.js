'use strict';
// Phase 02 gate: one canonical vocabulary, no competing enum systems.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../src/domain/vocabulary');
const inventory = require('../src/domain/inventory');

function assertFrozenEnum(obj, name) {
  assert.ok(Object.isFrozen(obj), `${name} must be frozen`);
  const values = Object.values(obj);
  assert.equal(new Set(values).size, values.length, `${name} must have unique values`);
  for (const v of values) assert.equal(typeof v, 'string', `${name} values must be strings`);
}

describe('vocabulary', () => {
  it('freezes every enum with unique string values', () => {
    assertFrozenEnum(V.DOCUMENT_TYPES, 'DOCUMENT_TYPES');
    assertFrozenEnum(V.DOCUMENT_STATUSES, 'DOCUMENT_STATUSES');
    assertFrozenEnum(V.PARTY_ROLES, 'PARTY_ROLES');
    assertFrozenEnum(V.MOVEMENT_TYPES, 'MOVEMENT_TYPES');
    assertFrozenEnum(V.MOVEMENT_REASONS, 'MOVEMENT_REASONS');
    assertFrozenEnum(V.RECEIPT_STATUSES, 'RECEIPT_STATUSES');
    assertFrozenEnum(V.PRODUCT_TYPES, 'PRODUCT_TYPES');
    assertFrozenEnum(V.TAX_CLASSES, 'TAX_CLASSES');
    assertFrozenEnum(V.PRICE_SOURCES, 'PRICE_SOURCES');
    assertFrozenEnum(V.LIST_SCOPES, 'LIST_SCOPES');
    assert.ok(Object.isFrozen(V.DOCUMENT_TRANSITIONS), 'transitions must be frozen');
    assert.ok(Object.isFrozen(V.MONEY) && Object.isFrozen(V.TIME), 'money/time must be frozen');
  });

  it('has a single source: inventory validates against vocabulary values', () => {
    // inventory derives its validation views from vocabulary — proven
    // behaviorally instead of by re-exporting enums to old call sites.
    for (const t of Object.values(V.MOVEMENT_TYPES)) {
      assert.equal(inventory.validateMovementType(t), t);
    }
    assert.throws(() => inventory.validateMovementType('not_a_movement'), /unknown movement type/);
  });

  it('stays in sync with the SQL CHECK in 014_returns.sql', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'migrations', '014_returns.sql'), 'utf8');
    for (const t of Object.values(V.MOVEMENT_TYPES)) {
      assert.ok(sql.includes(`'${t}'`), `migration must list movement type ${t}`);
    }
  });

  it('keeps order, invoice and delivery as distinct document types', () => {
    const { SALES_ORDER, SALES_INVOICE, DELIVERY_NOTE, SALES_QUOTE, PROFORMA_INVOICE } = V.DOCUMENT_TYPES;
    assert.equal(new Set([SALES_ORDER, SALES_INVOICE, DELIVERY_NOTE, SALES_QUOTE, PROFORMA_INVOICE]).size, 5);
  });

  it('allows only the documented lifecycle transitions', () => {
    assert.equal(V.canTransition('draft', 'confirmed'), true);
    assert.equal(V.canTransition('draft', 'posted'), false);
    assert.equal(V.canTransition('posted', 'paid'), true);
    assert.equal(V.canTransition('paid', 'draft'), false);
    assert.equal(V.canTransition('cancelled', 'draft'), false); // terminal
    assert.throws(() => V.canTransition('draft', 'shipped'), (e) => e.code === 'VALIDATION');
    assert.throws(() => V.assertTransition('draft', 'posted'), (e) => e.code === 'VALIDATION');
    V.assertTransition('confirmed', 'posted'); // must not throw
    // every transition target is a known status, every status has an entry
    for (const [from, tos] of Object.entries(V.DOCUMENT_TRANSITIONS)) {
      assert.ok(Object.values(V.DOCUMENT_STATUSES).includes(from), `unknown status key ${from}`);
      for (const to of tos) assert.ok(Object.values(V.DOCUMENT_STATUSES).includes(to), `unknown target ${to}`);
    }
  });

  it('defines every core concept exactly once', () => {
    assert.equal(new Set(V.CORE_CONCEPTS).size, V.CORE_CONCEPTS.length);
    for (const c of V.CORE_CONCEPTS) {
      assert.ok(typeof V.DEFINITIONS[c] === 'string' && V.DEFINITIONS[c].length > 20, `missing definition: ${c}`);
    }
  });

  it('fixes money and time conventions', () => {
    assert.equal(V.MONEY.CURRENCY, 'DZD');
    assert.equal(V.MONEY.MINOR_UNIT_PRECISION, 2);
    assert.match(V.TIME.STORAGE, /ISO-8601 UTC/);
  });

  it('enforces the audit operation naming convention', () => {
    assert.equal(V.isAuditOperation('product.create'), true);
    assert.equal(V.isAuditOperation('stock.receipt_cancel'), true);
    assert.equal(V.isAuditOperation('Bad Name'), false);
    for (const op of ['product.create', 'product.reactivate', 'product.deactivate', 'product.delete', 'stock.receive', 'stock.receipt_cancel']) {
      assert.equal(V.isAuditOperation(op), true, op);
    }
  });
});
