'use strict';
// Logistics validation (Phase 19). Pure. Codes normalize uppercase like the
// other registries; fail reasons are a closed set for reporting.
const { ValidationError } = require('./errors');
const { STOP_FAIL_REASONS } = require('./vocabulary');
const { validateDateString } = require('./dates');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateRegistryCode(code, field) {
  const c = cleanText(code).toUpperCase();
  if (!c) throw new ValidationError(`${field} is required`);
  if (c.length > 16) throw new ValidationError(`${field} must be at most 16 characters`);
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(c)) throw new ValidationError(`${field} must be alphanumeric with . _ - separators`);
  return c;
}

function validatePersonName(name, field = 'name') {
  const n = cleanText(name);
  if (!n) throw new ValidationError(`${field} is required`);
  if (n.length > 100) throw new ValidationError(`${field} must be at most 100 characters`);
  return n;
}

function validateRouteDate(d) {
  return validateDateString(d, 'route_date');
}

function validateFailReason(reason) {
  const r = cleanText(reason);
  if (!r) throw new ValidationError('a failure reason is required');
  if (!Object.values(STOP_FAIL_REASONS).includes(r)) {
    throw new ValidationError(`unknown failure reason: ${reason}`);
  }
  return r;
}

function validateCollectedAmount(a) {
  if (a === undefined || a === null || a === '') return 0;
  if (typeof a === 'string') throw new ValidationError('collected amount must be an integer in minor units');
  if (!Number.isInteger(a)) throw new ValidationError('collected amount must be an integer in minor units');
  if (a < 0) throw new ValidationError('collected amount cannot be negative');
  if (a > 1_000_000_000_000) throw new ValidationError('collected amount is unreasonably large');
  return a;
}

module.exports = {
  validateRegistryCode,
  validatePersonName,
  validateRouteDate,
  validateFailReason,
  validateCollectedAmount,
};
