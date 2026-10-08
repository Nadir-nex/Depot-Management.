'use strict';
// Source-import mapping keys and rules (Phase 22). Pure functions only.
//
// Every imported record must carry EITHER a source identifier (source_links)
// OR a documented deterministic key derived here — that is what makes a re-run
// converge instead of duplicating. Source-prototype money is whole currency
// units; the canonical ledger is integer minor units (precision 2),
// converted exactly.
// Tables listed in DEFERRED_TABLES are staged raw and documented, never
// guessed into canonical rows (ambiguous source vocabulary stays ambiguous).
const { toMinorUnitsFromMajor } = require('./money');

const SOURCE_SYSTEM = 'dolisoft-pro-12-3';

// Deterministic keys (unique by construction; uppercased for the target's
// alphanumeric + . _ - code grammars). The LEG-/LGC-/LCT-/LGV-/LGS- VALUE
// prefixes are frozen: they are stored data and re-runs depend on them.
function sourceSku(id) { return `LEG-${id}`; }            // items.id
function sourceCustomerCode(id) { return `LGC-${id}`; }   // customers.id
function sourceTypeCode(id) { return `LCT-${id}`; }       // customer_types.id → price list
function sourceVehicleCode(id) { return `LGV-${id}`; }    // vehicles.id
function sourceLotNo(rowid) { return `LEG-LOT-${rowid}`; }   // shipments rowid
function sourceReceiptNo(rowid) { return `LEG-RCP-${rowid}`; } // shipments rowid

function sourceSlug(text) {
  return String(text ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Supplier free text on shipments → party code (deterministic mapping key).
// Name changes are explicit conflicts at import time, never silent merges.
function sourceSupplierCode(name, rowid) {
  const core = sourceSlug(name) || `S${rowid}`;
  return `LGS-${core.slice(0, 28)}`;
}

// Source whole-currency number → exact minor units. Throws on anything that
// is not an exact decimal (bad precision, garbage) → explicit error row.
function sourceMoneyToMinor(value) {
  if (value === null || value === undefined || value === '') return 0;
  return toMinorUnitsFromMajor(String(value));
}

// Tables present in the source but deliberately NOT imported into canonical
// rows. Each carries its reason into the migration report.
const DEFERRED_TABLES = Object.freeze({
  companies: 'brand/company has no canonical entity; raw rows staged for audit',
  product_price_history: 'price history has no append-only target; raw rows staged for audit',
  orders: 'source order status vocabulary is ambiguous; raw rows staged until documented',
  order_items: 'depends on orders (deferred with them)',
  deliveries: 'source delivery status vocabulary is ambiguous; raw rows staged until documented',
  delivery_stops: 'depends on deliveries (deferred with them)',
  delivery_orders: 'depends on deliveries (deferred with them)',
  districts: 'no geography entity in the canonical model',
  employees: 'HR belongs to Phase 26',
  employee_roles: 'HR belongs to Phase 26',
  employee_phones: 'HR belongs to Phase 26',
  product_costs: 'folded into products.default_unit_cost during item import',
});

module.exports = {
  SOURCE_SYSTEM,
  DEFERRED_TABLES,
  sourceSku,
  sourceCustomerCode,
  sourceTypeCode,
  sourceVehicleCode,
  sourceLotNo,
  sourceReceiptNo,
  sourceSlug,
  sourceSupplierCode,
  sourceMoneyToMinor,
};
