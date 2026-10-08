'use strict';
// Shared date policy (plan §46): persistence is TEXT ISO-8601 UTC; business
// DAY dates (validity, expiry, manufacture) are inclusive YYYY-MM-DD strings
// validated as real calendar dates. Pure — no I/O, no database.
const { ValidationError } = require('./errors');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDateString(d, field) {
  if (d === undefined || d === null || d === '') return null;
  const s = typeof d === 'string' ? d.trim() : '';
  if (!DATE_RE.test(s)) throw new ValidationError(`${field} must be YYYY-MM-DD`);
  const [y, m, day] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) {
    throw new ValidationError(`${field} is not a real calendar date`);
  }
  return s;
}

function todayDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// Inclusive comparison on YYYY-MM-DD strings (lexicographic == chronological).
function isExpired(expiryDate, atDate) {
  if (!expiryDate) return false;
  return expiryDate < atDate;
}

module.exports = { validateDateString, todayDateString, isExpired };
