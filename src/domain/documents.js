'use strict';
// Commercial document rules (Phase 12). Pure. Per-type lifecycles SUBSET the
// generic vocabulary transitions: a move must be allowed by BOTH. Non-posting
// types (quote, proforma) can never reach 'posted'; paid-state entries exist
// for P16 to drive on invoices. Totals are integer math over snapshots.
const { ValidationError } = require('./errors');
const { DOCUMENT_TYPES, DOCUMENT_TRANSITIONS } = require('./vocabulary');
const { validateDateString } = require('./dates');
const { assertMinorUnits } = require('./money');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateDocType(type) {
  const t = cleanText(type);
  if (!Object.values(DOCUMENT_TYPES).includes(t)) throw new ValidationError(`unknown document type: ${type}`);
  return t;
}

// Allowed (from → [tos]) per type. Every pair must also exist in the generic
// DOCUMENT_TRANSITIONS (pinned by test); omissions are deliberate restrictions.
const TYPE_TRANSITIONS = Object.freeze({
  sales_quote: Object.freeze({ draft: ['confirmed', 'cancelled'], confirmed: ['cancelled'] }),
  sales_order: Object.freeze({ draft: ['confirmed', 'cancelled'], confirmed: ['posted', 'cancelled'], posted: ['cancelled'] }),
  delivery_note: Object.freeze({ draft: ['confirmed', 'cancelled'], confirmed: ['posted', 'cancelled'], posted: ['cancelled'] }),
  sales_invoice: Object.freeze({ draft: ['confirmed', 'cancelled'], confirmed: ['posted', 'cancelled'], posted: ['partially_paid', 'paid', 'cancelled'], partially_paid: ['paid', 'cancelled'] }),
  proforma_invoice: Object.freeze({ draft: ['confirmed', 'cancelled'], confirmed: ['cancelled'] }),
  purchase_order: Object.freeze({ draft: ['confirmed', 'cancelled'], confirmed: ['posted', 'cancelled'], posted: ['cancelled'] }),
  purchase_receipt: Object.freeze({ posted: ['cancelled'] }),
  customer_return: Object.freeze({ draft: ['confirmed', 'cancelled'], confirmed: ['posted', 'cancelled'], posted: ['cancelled'] }),
  supplier_return: Object.freeze({ draft: ['confirmed', 'cancelled'], confirmed: ['posted', 'cancelled'], posted: ['cancelled'] }),
});

// Lifecycle permission per action. All keys pre-exist in the P04 catalog;
// delivery posting maps to deliveries.complete (fulfillment authority).
const TYPE_PERMISSIONS = Object.freeze({
  sales_quote: Object.freeze({ create: 'sales.create', post: 'sales.create', cancel: 'sales.cancel' }),
  sales_order: Object.freeze({ create: 'sales.create', post: 'sales.post', cancel: 'sales.cancel' }),
  delivery_note: Object.freeze({ create: 'deliveries.create', post: 'deliveries.complete', cancel: 'deliveries.complete' }),
  sales_invoice: Object.freeze({ create: 'sales.create', post: 'sales.post', cancel: 'sales.cancel' }),
  proforma_invoice: Object.freeze({ create: 'sales.create', post: 'sales.create', cancel: 'sales.cancel' }),
  purchase_order: Object.freeze({ create: 'purchases.create', post: 'purchases.post', cancel: 'purchases.cancel' }),
  purchase_receipt: Object.freeze({ create: 'purchases.create', post: 'purchases.post', cancel: 'purchases.cancel' }),
  customer_return: Object.freeze({ create: 'sales.create', post: 'sales.post', cancel: 'sales.cancel' }),
  supplier_return: Object.freeze({ create: 'purchases.create', post: 'purchases.post', cancel: 'purchases.cancel' }),
});

const DOC_PREFIXES = Object.freeze({
  sales_quote: 'SQ', sales_order: 'SO', delivery_note: 'DN', sales_invoice: 'SI',
  proforma_invoice: 'PF', purchase_order: 'PO', purchase_receipt: 'PR',
  customer_return: 'CR', supplier_return: 'SR',
});

function allowedTransition(type, from, to) {
  const perType = TYPE_TRANSITIONS[type];
  if (!perType) throw new ValidationError(`unknown document type: ${type}`);
  const generic = DOCUMENT_TRANSITIONS[from] || [];
  const specific = perType[from] || [];
  return generic.includes(to) && specific.includes(to);
}

function assertTransition(type, from, to) {
  if (!allowedTransition(type, from, to)) {
    throw new ValidationError(`${type} cannot move from ${from} to ${to}`);
  }
}

function validateDocDate(d) {
  return validateDateString(d, 'doc_date') || todayString();
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function validateLineInput(raw = {}) {
  if (!raw || typeof raw !== 'object') throw new ValidationError('line is invalid');
  const qty = raw.qty;
  if (!Number.isInteger(qty) || qty <= 0) throw new ValidationError('line qty must be a positive integer');
  if (qty > 1_000_000_000) throw new ValidationError('line qty is unreasonably large');
  const unitPrice = raw.unitPrice ?? raw.unit_price ?? 0;
  if (typeof unitPrice === 'string') throw new ValidationError('line price must be an integer in minor units');
  assertMinorUnits(unitPrice);
  const discount = raw.discountAmount ?? raw.discount_amount ?? 0;
  if (typeof discount === 'string') throw new ValidationError('line discount must be an integer in minor units');
  assertMinorUnits(discount);
  if (discount > qty * unitPrice) throw new ValidationError('line discount cannot exceed the line gross');
  return {
    productId: raw.productId ?? raw.product_id ?? null,
    description: cleanText(raw.description ?? '').slice(0, 500),
    qty,
    unitCode: cleanText(raw.unitCode ?? raw.unit_code ?? 'PCS').slice(0, 16) || 'PCS',
    packId: raw.packId ?? raw.pack_id ?? null,
    unitPrice,
    discountAmount: discount,
    taxClass: cleanText(raw.taxClass ?? raw.tax_class ?? 'standard').slice(0, 32) || 'standard',
    lotId: raw.lotId ?? raw.lot_id ?? null,
    notes: cleanText(raw.notes ?? '').slice(0, 1000),
  };
}

// Integer totals over snapshots: subtotal = Σ qty×price, discounts explicit
// (line + document), tax 0 until P25 computes rates (column reserved, never
// inferred). Document discount must fit inside the discounted subtotal.
function computeTotals(lines, docDiscount = 0) {
  if (typeof docDiscount === 'string') throw new ValidationError('document discount must be an integer in minor units');
  assertMinorUnits(docDiscount);
  let subtotal = 0;
  let discountTotal = 0;
  for (const l of lines) {
    subtotal += l.qty * l.unit_price;
    discountTotal += l.discount_amount;
  }
  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(discountTotal)) {
    throw new ValidationError('document totals overflow');
  }
  const grandTotal = subtotal - discountTotal - docDiscount;
  if (grandTotal < 0) throw new ValidationError('discounts cannot exceed the subtotal');
  return { subtotal, discountTotal, taxTotal: 0, grandTotal };
}

function validateDocDiscount(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'string') throw new ValidationError('document discount must be an integer in minor units');
  return assertMinorUnits(v);
}

module.exports = {
  validateDocType,
  TYPE_TRANSITIONS,
  TYPE_PERMISSIONS,
  DOC_PREFIXES,
  allowedTransition,
  assertTransition,
  validateDocDate,
  validateDocDiscount,
  validateLineInput,
  computeTotals,
};
