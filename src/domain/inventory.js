'use strict';
// Centralized inventory rules. Stock is ALWAYS derived from stock_movements;
// nothing outside this module (and its application services) decides why
// stock changed. UI must never write quantities directly.
const { ValidationError, StateError } = require('./errors');
// Canonical enums live in ./vocabulary (single source); this module derives
// its validation views from them — never a second definition, never a
// re-export for old callers.
const { MOVEMENT_TYPES: _MOVEMENT_VALUES, RECEIPT_STATUSES: _RECEIPT_VALUES } = require('./vocabulary');

const MOVEMENT_TYPES = Object.freeze(Object.values(_MOVEMENT_VALUES));
const RECEIPT_STATUSES = Object.freeze(Object.values(_RECEIPT_VALUES));

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
    const packId = l.packId ?? l.pack_id ?? null;
    if (packId !== null && packId !== undefined) {
      // Pack presentation: quantity arrives as whole packs; the application
      // converts to base pieces via toBasePieces (exact integer math).
      if (l.qty !== undefined && l.qty !== null) {
        throw new ValidationError(`line ${i + 1}: give qty (pieces) OR packId+packs, not both`);
      }
      if (!Number.isInteger(l.packs) || l.packs <= 0) {
        throw new ValidationError(`line ${i + 1}: packs must be a positive integer`);
      }
      return {
        productId: l.productId ?? l.product_id ?? null,
        sku: l.sku ?? null,
        packId,
        packs: l.packs,
        unitCost: l.unitCost ?? l.unit_cost ?? 0,
        lotId: l.lotId ?? l.lot_id ?? null,
        lot: l.lot ?? null,
        serials: l.serials ?? null,
      };
    }
    return {
      productId: l.productId ?? l.product_id ?? null,
      sku: l.sku ?? null,
      qty: validateQty(l.qty),
      unitCost: l.unitCost ?? l.unit_cost ?? 0,
      lotId: l.lotId ?? l.lot_id ?? null,
      lot: l.lot ?? null,
      serials: l.serials ?? null,
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
  validateMovementType,
  validateQty,
  validateReceiptLines,
  assertReceiptCancellable,
  reversalOf,
};
