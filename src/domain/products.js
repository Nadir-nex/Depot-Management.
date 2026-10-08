'use strict';
// Pure product validation. No DB, no Electron, no filesystem.
// Money (default_unit_cost) is integer minor units (centimes) >= 0.
const { ValidationError } = require('./errors');

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateSku(sku) {
  const s = cleanText(sku);
  if (!s) throw new ValidationError('sku is required');
  if (s.length > 64) throw new ValidationError('sku must be at most 64 characters');
  if (!SKU_RE.test(s)) throw new ValidationError('sku must be alphanumeric with . _ - separators');
  return s;
}

function validateName(name) {
  const n = cleanText(name);
  if (!n) throw new ValidationError('product name is required');
  if (n.length > 200) throw new ValidationError('product name must be at most 200 characters');
  return n;
}

function validateBarcode(barcode) {
  if (barcode === undefined || barcode === null || barcode === '') return null;
  const b = cleanText(barcode);
  if (b.length === 0) return null;
  if (b.length > 64) throw new ValidationError('barcode must be at most 64 characters');
  return b;
}

function validateUnitCost(cost) {
  if (cost === undefined || cost === null || cost === '') return 0;
  if (typeof cost === 'string' && cost.trim() !== '') {
    if (!/^-?\d+$/.test(cost.trim())) throw new ValidationError('unit cost must be an integer in minor units');
    cost = Number(cost.trim());
  }
  if (!Number.isInteger(cost)) throw new ValidationError('unit cost must be an integer in minor units');
  if (cost < 0) throw new ValidationError('unit cost cannot be negative');
  if (cost > 1_000_000_000) throw new ValidationError('unit cost is unreasonably large');
  return cost;
}

function toProductInput(raw = {}) {
  return {
    sku: validateSku(raw.sku),
    name: validateName(raw.name),
    barcode: validateBarcode(raw.barcode),
    defaultUnitCost: validateUnitCost(raw.defaultUnitCost ?? raw.default_unit_cost ?? 0),
    notes: cleanText(raw.notes).slice(0, 2000),
    isActive: raw.isActive === undefined ? true : Boolean(raw.isActive),
  };
}

module.exports = { validateSku, validateName, validateBarcode, validateUnitCost, toProductInput };
