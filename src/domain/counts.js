'use strict';
// Count lifecycle (Phase 18). Pure. Transitions are explicit and narrow:
// recount returns submitted work to draft; posted is terminal (adjustments
// reverse through the stock engine, never by reopening the count).
const { ValidationError } = require('./errors');

const COUNT_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['submitted', 'cancelled']),
  submitted: Object.freeze(['draft', 'approved', 'cancelled']),
  approved: Object.freeze(['posted', 'cancelled']),
  posted: Object.freeze([]),
  cancelled: Object.freeze([]),
});

function assertCountTransition(from, to) {
  const allowed = COUNT_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) throw new ValidationError(`count cannot move from ${from} to ${to}`);
}

function validateCountedQty(qty) {
  if (typeof qty === 'string' && qty.trim() !== '') {
    if (!/^-?\d+$/.test(qty.trim())) throw new ValidationError('counted qty must be an integer');
    qty = Number(qty.trim());
  }
  if (!Number.isInteger(qty)) throw new ValidationError('counted qty must be an integer');
  if (qty < 0) throw new ValidationError('counted qty cannot be negative');
  if (qty > 1_000_000_000) throw new ValidationError('counted qty is unreasonably large');
  return qty;
}

module.exports = { COUNT_TRANSITIONS, assertCountTransition, validateCountedQty };
