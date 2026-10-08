'use strict';
// Catalog rules (Phase 06): categories, units, packs, barcodes. Pure functions.
// Stock is kept in BASE pieces everywhere; packs convert by exact integer
// math. toPacksExact() refuses non-divisible quantities instead of silently
// inventing fractions — callers split or reject explicitly.
//
// Phase 09 additions: warehouse validators + movement reason codes live here
// (master-data validation module); conversions stay exact and total.
const { ValidationError } = require('./errors');
const { MOVEMENT_REASONS } = require('./vocabulary');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateCategoryName(name) {
  const n = cleanText(name);
  if (!n) throw new ValidationError('category name is required');
  if (n.length > 100) throw new ValidationError('category name must be at most 100 characters');
  return n;
}

function validateUnitCode(code) {
  const c = cleanText(code).toUpperCase();
  if (!c) throw new ValidationError('unit code is required');
  if (c.length > 16) throw new ValidationError('unit code must be at most 16 characters');
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(c)) throw new ValidationError('unit code must be alphanumeric with . _ - separators');
  return c;
}

function validateUnitName(name) {
  const n = cleanText(name);
  if (!n) throw new ValidationError('unit name is required');
  if (n.length > 100) throw new ValidationError('unit name must be at most 100 characters');
  return n;
}

function validatePackName(name) {
  const n = cleanText(name);
  if (!n) throw new ValidationError('pack name is required');
  if (n.length > 100) throw new ValidationError('pack name must be at most 100 characters');
  return n;
}

function validateQtyPerPack(v) {
  if (typeof v === 'string' && v.trim() !== '') {
    if (!/^-?\d+$/.test(v.trim())) throw new ValidationError('qty_per_pack must be a positive integer');
    v = Number(v.trim());
  }
  if (!Number.isInteger(v)) throw new ValidationError('qty_per_pack must be a positive integer');
  if (v <= 0) throw new ValidationError('qty_per_pack must be positive');
  if (v > 1_000_000) throw new ValidationError('qty_per_pack is unreasonably large');
  return v;
}

function validateBarcodeCode(code) {
  const c = cleanText(code);
  if (!c) throw new ValidationError('barcode is required');
  if (c.length > 64) throw new ValidationError('barcode must be at most 64 characters');
  return c; // exact match semantics: codes are case-sensitive, never normalized
}

// --- Warehouses (P08): codes are normalized uppercase registry keys. ---
function validateWarehouseCode(code) {
  const c = cleanText(code).toUpperCase();
  if (!c) throw new ValidationError('warehouse code is required');
  if (c.length > 16) throw new ValidationError('warehouse code must be at most 16 characters');
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(c)) throw new ValidationError('warehouse code must be alphanumeric with . _ - separators');
  return c;
}

function validateWarehouseName(name) {
  const n = cleanText(name);
  if (!n) throw new ValidationError('warehouse name is required');
  if (n.length > 100) throw new ValidationError('warehouse name must be at most 100 characters');
  return n;
}

function validateReasonCode(reason) {
  const r = cleanText(reason);
  if (!r) throw new ValidationError('a movement reason is required');
  if (!Object.values(MOVEMENT_REASONS).includes(r)) {
    throw new ValidationError(`unknown movement reason: ${reason}`);
  }
  return r;
}
function toBasePieces(packs, qtyPerPack) {
  if (!Number.isInteger(packs) || packs <= 0) throw new ValidationError('pack count must be a positive integer');
  return packs * validateQtyPerPack(qtyPerPack);
}

// Inverse of toBasePieces. Throws unless pieces divide evenly — no fractions.
function toPacksExact(pieces, qtyPerPack) {
  const per = validateQtyPerPack(qtyPerPack);
  if (!Number.isInteger(pieces) || pieces < 0) throw new ValidationError('pieces must be a non-negative integer');
  if (pieces % per !== 0) {
    throw new ValidationError(`${pieces} pieces is not an exact multiple of pack size ${per}`);
  }
  return pieces / per;
}

module.exports = {
  validateCategoryName,
  validateUnitCode,
  validateUnitName,
  validatePackName,
  validateQtyPerPack,
  validateBarcodeCode,
  validateWarehouseCode,
  validateWarehouseName,
  validateReasonCode,
  toBasePieces,
  toPacksExact,
};
