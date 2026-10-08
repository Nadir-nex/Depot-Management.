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

function createApp(dbOrPath, { migrateOnStart = true, dbPathForBackup = null } = {}) {
  const db = typeof dbOrPath === 'string' || dbOrPath === undefined
    ? openDatabase(dbOrPath || resolveDbPath())
    : dbOrPath;
  const effectivePath = typeof dbOrPath === 'string' ? dbOrPath : (dbPathForBackup || null);
  if (migrateOnStart) migrate(db, { dbPath: effectivePath, backup: Boolean(effectivePath) });

  const actorOf = (a) => (typeof a === 'string' && a.trim() ? a.trim().slice(0, 120) : 'system');

  return {
    db,
    close() { closeDatabase(db); },

    commands: {
      createProduct: (input, actor) => productsApp.createProduct(db, input, actorOf(actor)),
      setProductActive: (id, active, actor) => productsApp.setProductActive(db, id, active, actorOf(actor)),
      deleteProduct: (id, actor) => productsApp.deleteProduct(db, id, actorOf(actor)),
      receiveStock: (payload, actor) => inventoryApp.receiveStock(db, payload, actorOf(actor)),
      cancelReceipt: (id, reason, actor) => inventoryApp.cancelReceipt(db, id, reason, actorOf(actor)),
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
      recentAudit: (opts) => createAuditRepository(db).recent(opts),
    },
  };
}

module.exports = { createApp };
