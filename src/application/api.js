'use strict';
// Application/API layer — the single entry point for ALL business operations.
// The Electron IPC handlers and the future HTTP server both call this object;
// no UI and no transport ever touches repositories or SQL directly.
// Accepts either a db path (string) or an already-open db handle, so tests can
// inject temp databases and the future web server can inject a pooled handle.
const { openDatabase, closeDatabase } = require('../db');
const { migrate } = require('../db/migrate');
const { resolveDbPath } = require('../config');
const { createWarehouseRepository, createAuditRepository } = require('../data/stockRepository');
const { withTransaction } = require('../db');
const productsApp = require('./products');
const inventoryApp = require('./inventory');
const catalogApp = require('./catalog');
const pricingApp = require('./pricing');
const warehousesApp = require('./warehouses');

function createApp(dbOrPath, { migrateOnStart = true, dbPathForBackup = null } = {}) {
  const db = typeof dbOrPath === 'string' || dbOrPath === undefined
    ? openDatabase(dbOrPath || resolveDbPath())
    : dbOrPath;
  const effectivePath = typeof dbOrPath === 'string' ? dbOrPath : (dbPathForBackup || null);
  if (migrateOnStart) migrate(db, { dbPath: effectivePath, backup: Boolean(effectivePath) });

  // Auth passes through untouched: string actor = trusted server-side shorthand
  // (full grants); { actor, grants } object = explicit grants from the session.
  // Commands normalize + enforce via requirePermission(). Transports must NEVER
  // upgrade grants here — main.js builds server-side auth from a bare name.
  return {
    db,
    close() { closeDatabase(db); },

    commands: {
      createProduct: (input, auth) => productsApp.createProduct(db, input, auth),
      updateProduct: (id, fields, auth) => productsApp.updateProduct(db, id, fields, auth),
      setProductActive: (id, active, auth) => productsApp.setProductActive(db, id, active, auth),
      deleteProduct: (id, auth) => productsApp.deleteProduct(db, id, auth),
      receiveStock: (payload, auth) => inventoryApp.receiveStock(db, payload, auth),
      cancelReceipt: (id, reason, auth) => inventoryApp.cancelReceipt(db, id, reason, auth),
      createCategory: (input, auth) => catalogApp.createCategory(db, input, auth),
      deleteCategory: (id, auth) => catalogApp.deleteCategory(db, id, auth),
      createUnit: (input, auth) => catalogApp.createUnit(db, input, auth),
      createPack: (productId, input, auth) => catalogApp.createPack(db, productId, input, auth),
      addBarcode: (productId, input, auth) => catalogApp.addBarcode(db, productId, input, auth),
      removeBarcode: (id, auth) => catalogApp.removeBarcode(db, id, auth),
      createPriceList: (input, auth) => pricingApp.createPriceList(db, input, auth),
      updatePriceList: (id, fields, auth) => pricingApp.updatePriceList(db, id, fields, auth),
      deletePriceList: (id, auth) => pricingApp.deletePriceList(db, id, auth),
      setPriceLine: (listId, input, auth) => pricingApp.setPriceLine(db, listId, input, auth),
      removePriceLine: (listId, input, auth) => pricingApp.removePriceLine(db, listId, input, auth),
      createWarehouse: (input, auth) => warehousesApp.createWarehouse(db, input, auth),
      setWarehouseActive: (id, active, auth) => warehousesApp.setWarehouseActive(db, id, active, auth),
      deleteWarehouse: (id, auth) => warehousesApp.deleteWarehouse(db, id, auth),
      // Bootstrap helper for first run (MAIN depot). Audited, idempotent.
      ensureMainWarehouse: (actor) => withTransaction(db, () => {
        const w = createWarehouseRepository(db).ensureMain();
        return w;
      }),
    },

    queries: {
      listProducts: (opts) => productsApp.listProducts(db, opts),
      getProduct: (id) => productsApp.getProduct(db, id),
      listStock: (w) => inventoryApp.listStock(db, w),
      getStock: (productId, warehouseId) => inventoryApp.getStock(db, productId, warehouseId),
      listMovements: (opts) => inventoryApp.listMovements(db, opts),
      listReceipts: (opts) => inventoryApp.listReceipts(db, opts),
      getReceipt: (id) => inventoryApp.getReceipt(db, id),
      listCategories: () => catalogApp.listCategories(db),
      getCategoryTree: () => catalogApp.getCategoryTree(db),
      listUnits: () => catalogApp.listUnits(db),
      listPacks: (productId) => catalogApp.listPacks(db, productId),
      listBarcodes: (productId) => catalogApp.listBarcodes(db, productId),
      resolveBarcode: (code) => catalogApp.resolveBarcode(db, code),
      listPriceLists: () => pricingApp.listPriceLists(db),
      getPriceList: (id) => pricingApp.getPriceList(db, id),
      resolveSalePrice: (args) => pricingApp.resolveSalePrice(db, args),
      listWarehouses: () => warehousesApp.listWarehouses(db),
      getWarehouse: (id) => warehousesApp.getWarehouse(db, id),
      recentAudit: (opts) => createAuditRepository(db).recent(opts),
    },
  };
}

module.exports = { createApp };
