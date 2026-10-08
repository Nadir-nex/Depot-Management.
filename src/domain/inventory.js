'use strict';
// Centralized inventory rules. Stock is ALWAYS derived from stock_movements;
// nothing outside this module (and its application services) decides why
// stock changed. UI must never write quantities directly.
const { ValidationError, StateError } = require('./errors');

const MOVEMENT_TYPES = Object.freeze([
  'purchase_receipt',
  'purchase_receipt_reversal',
  'adjustment',
]);
const REVERSIBLE_RECEIPT_TYPES = Object.freeze(['purchase_receipt']);
const RECEIPT_STATUSES = Object.freeze(['posted', 'cancelled']);

function validateMovementType(t) {
  if (!MOVEMENT_TYPES.includes(t)) throw new ValidationError(`unknown movement type: ${t}`);
  return t;
}

function validateQty(qty, { allowZero = false } = {}) {
  if (typeof qty === 'string' && qty.trim() !== '') {
    if (!/^-?\d+$/.test(qty.trim())) throw new ValidationError('qty must be an integer');
    qty = Number(qty.trim());
  }
  if (!Number.isInteger(qty)) throw new ValidationError('qty must be an integer');
  if (!allowZero && qty === 0) throw new ValidationError('qty cannot be zero');
  if (qty <= 0) throw new ValidationError('receipt line qty must be positive');
  if (Math.abs(qty) > 1_000_000_000) throw new ValidationError('qty is unreasonably large');
  return qty;
}

function validateReceiptLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ValidationError('receipt must contain at least one line');
  }
  if (lines.length > 500) throw new ValidationError('receipt cannot contain more than 500 lines');
  return lines.map((l, i) => {
    if (!l || typeof l !== 'object') throw new ValidationError(`line ${i + 1}: invalid`);
    return {
      productId: l.productId ?? l.product_id ?? null,
      sku: l.sku ?? null,
      qty: validateQty(l.qty),
      unitCost: l.unitCost ?? l.unit_cost ?? 0,
    };
  });
}

function assertReceiptCancellable(status) {
  if (status !== 'posted') throw new StateError(`only a posted receipt can be cancelled (current: ${status})`);
}

function reversalOf(lineQty) {
  return -Math.abs(lineQty);
}

module.exports = {
  MOVEMENT_TYPES,
  RECEIPT_STATUSES,
  REVERSIBLE_RECEIPT_TYPES,
  validateMovementType,
  validateQty,
  validateReceiptLines,
  assertReceiptCancellable,
  reversalOf,
};
