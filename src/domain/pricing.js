'use strict';
// Pricing validation (Phase 07). Pure. Money reuses the minor-units policy;
// dates are inclusive YYYY-MM-DD ranges; scopes are vocabulary enums.
const { ValidationError } = require('./errors');
const { LIST_SCOPES } = require('./vocabulary');
const { assertMinorUnits } = require('./money');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateListCode(code) {
  const c = cleanText(code).toUpperCase();
  if (!c) throw new ValidationError('price list code is required');
  if (c.length > 32) throw new ValidationError('price list code must be at most 32 characters');
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(c)) throw new ValidationError('price list code must be alphanumeric with . _ - separators');
  return c;
}

function validateListName(name) {
  const n = cleanText(name);
  if (!n) throw new ValidationError('price list name is required');
  if (n.length > 100) throw new ValidationError('price list name must be at most 100 characters');
  return n;
}

function validateScope(scopeType, scopeKey) {
  const t = cleanText(scopeType) || 'general';
  if (!Object.values(LIST_SCOPES).includes(t)) throw new ValidationError(`unknown price scope: ${scopeType}`);
  if (t === 'general') {
    if (scopeKey !== undefined && scopeKey !== null && cleanText(scopeKey) !== '') {
      throw new ValidationError('general price lists take no scope key');
    }
    return { scopeType: t, scopeKey: null };
  }
  const k = cleanText(scopeKey);
  if (!k) throw new ValidationError(`scoped price lists require a scope key (${t})`);
  if (k.length > 64) throw new ValidationError('scope key must be at most 64 characters');
  return { scopeType: t, scopeKey: k };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(d, field) {
  if (d === undefined || d === null || d === '') return null;
  const s = cleanText(d);
  if (!DATE_RE.test(s)) throw new ValidationError(`${field} must be YYYY-MM-DD`);
  const [y, m, day] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) {
    throw new ValidationError(`${field} is not a real calendar date`);
  }
  return s;
}

function validateValidity(validFrom, validTo) {
  const from = validateDate(validFrom, 'valid_from');
  const to = validateDate(validTo, 'valid_to');
  if (from && to && from > to) throw new ValidationError('valid_from cannot be after valid_to');
  return { validFrom: from, validTo: to };
}

function validatePriority(p) {
  if (p === undefined || p === null || p === '') return 0;
  if (typeof p === 'string' && p.trim() !== '') {
    if (!/^-?\d+$/.test(p.trim())) throw new ValidationError('priority must be an integer');
    p = Number(p.trim());
  }
  if (!Number.isInteger(p) || p < 0 || p > 1000) throw new ValidationError('priority must be an integer 0..1000');
  return p;
}

function validateLinePrice(v) {
  if (typeof v === 'string' && v.trim() !== '') {
    if (!/^-?\d+$/.test(v.trim())) throw new ValidationError('price must be an integer in minor units');
    v = Number(v.trim());
  }
  return assertMinorUnits(v);
}

module.exports = {
  validateListCode,
  validateListName,
  validateScope,
  validateValidity,
  validatePriority,
  validateLinePrice,
};
