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
