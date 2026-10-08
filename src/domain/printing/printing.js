'use strict';
// Document printing domain (Phase 23). Pure rendering data for printable output.
const DOC_TYPES = Object.freeze([
  'sales_quote',
  'sales_order',
  'delivery_note',
  'sales_invoice',
  'proforma_invoice',
  'purchase_order',
  'purchase_receipt',
  'customer_return',
  'supplier_return',
]);

function isPrintable(type) {
  return DOC_TYPES.includes(type);
}

module.exports = { DOC_TYPES, isPrintable };
