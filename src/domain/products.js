'use strict';
// Pure product validation. No DB, no Electron, no filesystem.
// Money (default_unit_cost) is integer minor units (centimes) >= 0.
const { ValidationError } = require('./errors');
const { assertMinorUnits } = require('./money');
const { PRODUCT_TYPES, TAX_CLASSES } = require('./vocabulary');

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
  return assertMinorUnits(cost);
}

function validateProductType(t) {
  const v = cleanText(t) || 'goods';
  if (!Object.values(PRODUCT_TYPES).includes(v)) {
    throw new ValidationError(`unknown product type: ${t}`);
  }
  return v;
}

function validateTaxClass(t) {
  const v = cleanText(t) || 'standard';
  if (!Object.values(TAX_CLASSES).includes(v)) {
    throw new ValidationError(`unknown tax class: ${t}`);
  }
  return v;
}

function validateMinStock(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'string' && v.trim() !== '') {
    if (!/^-?\d+$/.test(v.trim())) throw new ValidationError('min_stock must be an integer');
    v = Number(v.trim());
  }
  if (!Number.isInteger(v)) throw new ValidationError('min_stock must be an integer');
  if (v < 0) throw new ValidationError('min_stock cannot be negative');
  if (v > 1_000_000_000) throw new ValidationError('min_stock is unreasonably large');
  return v;
}

function toProductInput(raw = {}) {
  return {
    sku: validateSku(raw.sku),
    name: validateName(raw.name),
    barcode: validateBarcode(raw.barcode),
    productType: validateProductType(raw.productType ?? raw.product_type),
    defaultUnitCost: validateUnitCost(raw.defaultUnitCost ?? raw.default_unit_cost ?? 0),
    defaultSalePrice: validateUnitCost(raw.defaultSalePrice ?? raw.default_sale_price ?? 0),
    taxClass: validateTaxClass(raw.taxClass ?? raw.tax_class),
    minStock: validateMinStock(raw.minStock ?? raw.min_stock),
    notes: cleanText(raw.notes).slice(0, 2000),
    isActive: raw.isActive === undefined ? true : Boolean(raw.isActive),
  };
}

// Updatable subset: sku is IMMUTABLE (business-key stability for history).
// Every key validated with the same rules as creation.
function toProductUpdate(raw = {}) {
  const out = {};
  if (raw.name !== undefined) out.name = validateName(raw.name);
  // barcode/categoryId are valid inputs handled by the caller (preferred-row
  // sync / FK resolution), so they never land in `out` as columns.
  if (raw.productType !== undefined || raw.product_type !== undefined) {
    out.productType = validateProductType(raw.productType ?? raw.product_type);
  }
  if (raw.defaultUnitCost !== undefined || raw.default_unit_cost !== undefined) {
    out.defaultUnitCost = validateUnitCost(raw.defaultUnitCost ?? raw.default_unit_cost);
  }
  if (raw.defaultSalePrice !== undefined || raw.default_sale_price !== undefined) {
    out.defaultSalePrice = validateUnitCost(raw.defaultSalePrice ?? raw.default_sale_price);
  }
  if (raw.taxClass !== undefined || raw.tax_class !== undefined) {
    out.taxClass = validateTaxClass(raw.taxClass ?? raw.tax_class);
  }
  if (raw.minStock !== undefined || raw.min_stock !== undefined) {
    out.minStock = validateMinStock(raw.minStock ?? raw.min_stock);
  }
  if (raw.notes !== undefined) out.notes = cleanText(raw.notes).slice(0, 2000);
  if (raw.sku !== undefined) throw new ValidationError('sku is immutable; create a new product instead');
  // `barcode`/`categoryId` are valid inputs handled by the caller, so they
  // satisfy the emptiness check without landing in `out` as columns.
  const callerHandled = raw.barcode !== undefined || raw.categoryId !== undefined || raw.category_id !== undefined;
  if (Object.keys(out).length === 0 && !callerHandled) throw new ValidationError('nothing to update');
  return out;
}

module.exports = { validateSku, validateName, validateBarcode, validateUnitCost, validateProductType, validateTaxClass, validateMinStock, toProductInput, toProductUpdate };
