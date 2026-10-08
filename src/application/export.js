'use strict';
// Canonical data export (Phase 22). A portable JSON snapshot of the
// business data for backups, audits and interop — counts derive from the
// same queries the import report reconciles against. Read-only.
const { utcNowIso } = require('../db');
const productsApp = require('./products');
const catalogApp = require('./catalog');
const partiesApp = require('./parties');
const pricingApp = require('./pricing');
const warehousesApp = require('./warehouses');
const inventoryApp = require('./inventory');

const EXPORT_VERSION = 1;
const LARGE = 1_000_000;

function exportSnapshot(db) {
  const products = productsApp.listProducts(db, { limit: LARGE });
  const categories = catalogApp.listCategories(db);
  const parties = partiesApp.listParties(db, { limit: LARGE });
  const warehouses = warehousesApp.listWarehouses(db);
  const priceLists = pricingApp.listPriceLists(db);
  const stock = warehouses.map((w) => ({ warehouse: w.code, rows: inventoryApp.listStock(db, w.id).rows }));
  const receipts = inventoryApp.listReceipts(db, { limit: LARGE });
  const stockQty = stock.reduce(
    (n, s) => n + s.rows.reduce((m, r) => m + (Number(r.stock) || 0), 0), 0
  );
  const counts = {
    products: products.length,
    categories: categories.length,
    parties: parties.length,
    priceLists: priceLists.length,
    warehouses: warehouses.length,
    receipts: receipts.length,
    stockQty,
  };
  return {
    version: EXPORT_VERSION,
    generatedAt: utcNowIso(),
    counts,
    products,
    categories,
    parties,
    priceLists,
    warehouses,
    stock,
  };
}

module.exports = { exportSnapshot };
