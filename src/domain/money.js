'use strict';
// Money representation policy (Phase 03, plan §45 groundwork).
// Every amount in the database is an INTEGER in minor units (centimes).
// Binary floating point is NEVER valid money: conversion takes exact decimal
// STRINGS only. Anything needing sub-cent rounding must round explicitly
// BEFORE calling into the domain — silent rounding is a defect.
const { ValidationError } = require('./errors');
const { MONEY } = require('./vocabulary');

const MAX_MINOR_UNITS = 1_000_000_000;

function assertMinorUnits(v, { allowZero = true } = {}) {
  if (!Number.isInteger(v)) throw new ValidationError('money must be an integer in minor units');
  if (v < 0) throw new ValidationError('money cannot be negative');
  if (!allowZero && v === 0) throw new ValidationError('money must be positive');
  if (v > MAX_MINOR_UNITS) throw new ValidationError('money amount is unreasonably large');
  return v;
}

// Exact decimal-string → minor units. "19.99" → 1999, "19.9" → 1990.
// Rejects numbers (19.99 as a float is already imprecise), excess precision,
// signs, and garbage. No rounding happens here by design.
function toMinorUnitsFromMajor(major, precision = MONEY.MINOR_UNIT_PRECISION) {
  if (typeof major !== 'string') {
    throw new ValidationError('major-unit amounts must be exact decimal strings, never binary floats');
  }
  const m = major.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(m);
  if (!match) throw new ValidationError(`invalid money amount: ${major}`);
  if (match[1]) throw new ValidationError('money cannot be negative');
  const frac = match[3] || '';
  if (frac.length > precision) {
    throw new ValidationError(`amount ${major} exceeds ${precision}-digit precision; round explicitly first`);
  }
  const minor = Number(match[2] + frac.padEnd(precision, '0'));
  if (!Number.isSafeInteger(minor)) throw new ValidationError(`amount ${major} is out of range`);
  return assertMinorUnits(minor);
}

module.exports = { MAX_MINOR_UNITS, assertMinorUnits, toMinorUnitsFromMajor };
