'use strict';
// Canonical domain vocabulary (Phase 02). SINGLE SOURCE for every business noun
// and lifecycle enum. Other modules must import from here, never redefine.
// Rules: enums are frozen; transitions are DATA (the P12 document engine will
// enforce them, this file only names them); glossary DEFINITIONS give each core
// concept one explicit meaning. Anything marked "reserved" is named here but
// fully defined in its own phase — do not invent its behavior early.
//
// Key distinctions (normative):
// - An ORDER is not an INVOICE. An order promises goods; an invoice claims money.
// - A DOCUMENT is a generic commercial record with (type, status). Type says what
//   it is, status says where it is in its lifecycle. Never overload one field.
// - A STOCK MOVEMENT is the inventory ledger event. A sales/purchase document is
//   NOT the ledger: posting a document APPENDS movements; the SUM explains stock.
const { ValidationError } = require('./errors');

function freezeValues(obj) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') Object.freeze(v);
  }
  return Object.freeze(obj);
}

// --- Commercial document types (behavior arrives P12–P15; names frozen now) ---
const DOCUMENT_TYPES = freezeValues({
  SALES_QUOTE: 'sales_quote',
  SALES_ORDER: 'sales_order',
  DELIVERY_NOTE: 'delivery_note',
  SALES_INVOICE: 'sales_invoice',
  PROFORMA_INVOICE: 'proforma_invoice',
  PURCHASE_ORDER: 'purchase_order',
  PURCHASE_RECEIPT: 'purchase_receipt',
  CUSTOMER_RETURN: 'customer_return',
  SUPPLIER_RETURN: 'supplier_return',
});

// Generic commercial lifecycle. Terminal states accept no outgoing transition;
// corrections after posting happen via reversal documents (P15), never edits.
const DOCUMENT_STATUSES = freezeValues({
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  POSTED: 'posted',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  CANCELLED: 'cancelled',
});

const DOCUMENT_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['confirmed', 'cancelled']),
  confirmed: Object.freeze(['posted', 'cancelled']),
  posted: Object.freeze(['partially_paid', 'paid', 'cancelled']),
  partially_paid: Object.freeze(['paid', 'cancelled']),
  paid: Object.freeze([]),
  cancelled: Object.freeze([]),
});

// --- Parties: one party record, roles decide what it can do (P11 owns roles) ---
const PARTY_ROLES = freezeValues({
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
});

// --- Inventory: canonical movement + receipt states (P09 owns the engine) ---
// Must stay in sync with the CHECK in src/db/migrations/002_stock.sql.
const MOVEMENT_TYPES = freezeValues({
  PURCHASE_RECEIPT: 'purchase_receipt',
  PURCHASE_RECEIPT_REVERSAL: 'purchase_receipt_reversal',
  ADJUSTMENT: 'adjustment',
});

// Minimal receipt lifecycle used by the v0.2 slice; the generic engine (P12)
// adopts DOCUMENT_STATUSES, of which these two are the posted/cancelled subset.
const RECEIPT_STATUSES = freezeValues({
  POSTED: 'posted',
  CANCELLED: 'cancelled',
});

// --- Product master data (P05 owns the catalog; values frozen here) ---
// 'service' products describe billable non-storables and NEVER appear in the
// stock ledger. tax_class is classification only until P25 computes fiscal
// amounts. min_stock is a stored alert threshold (alerting itself is P24).
const PRODUCT_TYPES = freezeValues({
  GOODS: 'goods',
  SERVICE: 'service',
});

const TAX_CLASSES = freezeValues({
  STANDARD: 'standard',
  EXEMPT: 'exempt',
});

// --- Pricing (P07 owns tariffs; the resolver contract is frozen here) ---
// Resolution hierarchy (most specific wins; documented + tested in P07):
//   line-override → customer-product → tariff-product → general-tariff → product-default
// Within ONE list a pack line beats the base-product line. Between lists of
// equal specificity: higher priority wins, then lowest id. Always deterministic.
const PRICE_SOURCES = freezeValues({
  LINE_OVERRIDE: 'line-override',
  CUSTOMER_PRODUCT: 'customer-product',
  TARIFF_PRODUCT: 'tariff-product',
  GENERAL_TARIFF: 'general-tariff',
  PRODUCT_DEFAULT: 'product-default',
});

// Tariff scopes. customer_type/customer keys are plain codes until P11 owns
// parties — the resolver matches them as strings, no FKs, no behavior change.
const LIST_SCOPES = freezeValues({
  GENERAL: 'general',
  CUSTOMER_TYPE: 'customer_type',
  CUSTOMER: 'customer',
});

// --- Money: integer minor units, one currency until P16 says otherwise ---
const MONEY = Object.freeze({
  CURRENCY: 'DZD',
  MINOR_UNIT_PRECISION: 2, // centimes; every amount column is an INTEGER
});

// --- Time: single persistence convention (plan §46) ---
const TIME = Object.freeze({
  STORAGE: 'TEXT ISO-8601 UTC (e.g. 2026-10-08T12:00:00.000Z)',
});

// --- Audit operation naming convention: "<area>.<action>" ---
const AUDIT_OPERATION_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;

function isAuditOperation(s) {
  return typeof s === 'string' && AUDIT_OPERATION_PATTERN.test(s);
}

// --- Transition query (data lookup; enforcement lives in P12/P15 services) ---
function canTransition(from, to) {
  const allowed = DOCUMENT_TRANSITIONS[from];
  if (!allowed) throw new ValidationError(`unknown document status: ${from}`);
  if (!Object.prototype.hasOwnProperty.call(DOCUMENT_TRANSITIONS, to)) {
    throw new ValidationError(`unknown document status: ${to}`);
  }
  return allowed.includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new ValidationError(`document cannot move from ${from} to ${to}`);
  }
}

// --- Glossary: one canonical meaning per core concept ---
const CORE_CONCEPTS = Object.freeze([
  'product', 'product_category', 'unit', 'barcode', 'price_list', 'supplier',
  'customer', 'party', 'warehouse', 'lot', 'document', 'document_line', 'sale',
  'purchase', 'quote', 'order', 'delivery_note', 'invoice', 'proforma',
  'return', 'payment', 'cash_account', 'expense', 'driver', 'vehicle', 'route',
  'route_stop', 'delivery', 'inventory_count', 'stock_movement', 'audit_event',
]);

const DEFINITIONS = Object.freeze({
  product: 'Sellable/storable item master record. Describes the item only; quantities live in the stock ledger.',
  product_category: 'Catalog grouping for products (family/subfamily). Classification only, never stock. (P06)',
  unit: 'Unit of measure for a quantity (piece, box, kg). Conversions explicit, never silent. (P06)',
  barcode: 'Scannable identifier resolving deterministically to one product representation. (P06)',
  price_list: 'Named tariff mapping products to selling prices per customer scope. Product holds no price. (P07)',
  supplier: 'Party role that sells to the depot; source of purchase documents. (P11)',
  customer: 'Party role that buys from the depot; holder of receivables and credit terms. (P11)',
  party: 'Generic third party (person/company). Roles (customer/supplier) attach capabilities. (P11)',
  warehouse: 'Stock location. Every movement belongs to exactly one warehouse; MAIN is the default depot. (P08)',
  lot: 'Batch with shared origin/expiry used for traceability and FEFO/FIFO. (P10)',
  document: 'Generic commercial record with (type, status). Type is fixed at creation; status follows DOCUMENT_TRANSITIONS.',
  document_line: 'One item line of a document: product + qty + price snapshot. Posted lines are immutable.',
  sale: 'Commercial outflow process (quote → order → delivery → invoice → payment), not a single record.',
  purchase: 'Commercial inflow process (order → receipt → supplier invoice → payment), not a single record.',
  quote: 'Non-binding price offer (sales_quote). Never moves stock, never claims money.',
  order: 'Commitment to buy/sell: reserves intent, moves NO stock and claims NO money by itself.',
  delivery_note: 'Proof that goods moved to/from the customer. Posting appends stock movements.',
  invoice: 'Claim for money. Posting creates a receivable; it never moves stock by itself.',
  proforma: 'Proforma invoice: informational pre-invoice. Non-posting: no stock, no receivable.',
  return: 'Compensating document reversing a delivery/invoice effect via new lines, never edits. (P15)',
  payment: 'Money event settling a receivable/payable. Exactly one balance effect; reversals append. (P16)',
  cash_account: 'Named money store (till, bank). Every payment/expense references one. (P16/P17)',
  expense: 'Operational cash outflow that is not a supplier payment (fuel, wages). (P17)',
  driver: 'Employee role executing routes and collecting cash/proof. (P19)',
  vehicle: 'Truck/motorcycle asset assigned to routes; may act as mobile stock location. (P19/P20)',
  route: 'Ordered set of delivery stops assigned to a driver/vehicle. (P19)',
  route_stop: 'One customer visit within a route, with delivery + collection outcome. (P19)',
  delivery: 'Distributor fulfillment operation: loading → stops → completion → settlement. (P19–P21)',
  inventory_count: 'Physical count record; differences post as adjustments after approval. (P18)',
  stock_movement: 'Atomic inventory ledger event (product, warehouse, signed qty, type, reference). SUM explains stock.',
  audit_event: 'Append-only trace of who did what to which entity and when. Never business state. (P04)',
});

module.exports = {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_TRANSITIONS,
  PARTY_ROLES,
  MOVEMENT_TYPES,
  RECEIPT_STATUSES,
  PRODUCT_TYPES,
  TAX_CLASSES,
  PRICE_SOURCES,
  LIST_SCOPES,
  MONEY,
  TIME,
  CORE_CONCEPTS,
  DEFINITIONS,
  canTransition,
  assertTransition,
  isAuditOperation,
};
