'use strict';
// Phase 03: money representation policy — integers only, exact strings only.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertMinorUnits, toMinorUnitsFromMajor } = require('../src/domain/money');

describe('money', () => {
  it('accepts valid minor-unit integers', () => {
    assert.equal(assertMinorUnits(0), 0);
    assert.equal(assertMinorUnits(1999), 1999);
    assert.equal(assertMinorUnits(1_000_000_000), 1_000_000_000);
  });

  it('rejects floats, negatives, and huge values', () => {
    for (const bad of [1.5, -1, NaN, '1999', null, undefined, 1_000_000_001]) {
      assert.throws(() => assertMinorUnits(bad), (e) => e.code === 'VALIDATION');
    }
  });

  it('converts exact decimal strings without float error', () => {
    assert.equal(toMinorUnitsFromMajor('19.99'), 1999);
    assert.equal(toMinorUnitsFromMajor('19.9'), 1990);
    assert.equal(toMinorUnitsFromMajor('0.01'), 1);
    assert.equal(toMinorUnitsFromMajor('100'), 10000);
    assert.equal(toMinorUnitsFromMajor('  7.50 '), 750);
  });

  it('refuses binary floats and excess precision instead of rounding', () => {
    assert.throws(() => toMinorUnitsFromMajor(19.99), (e) => e.code === 'VALIDATION');
    assert.throws(() => toMinorUnitsFromMajor('19.999'), (e) => e.code === 'VALIDATION');
    assert.throws(() => toMinorUnitsFromMajor('-5.00'), (e) => e.code === 'VALIDATION');
    assert.throws(() => toMinorUnitsFromMajor('abc'), (e) => e.code === 'VALIDATION');
  });
});
