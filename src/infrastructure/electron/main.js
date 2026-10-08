'use strict';
// Electron desktop shell — THIN adapter only. It wires the window + IPC to the
// transport-agnostic application layer (src/application/api.js). No business
// rules, no SQL, no price/stock math here. The future web mode reuses the same
// application layer behind HTTP instead of IPC.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { resolveDbPath } = require('../../config');
const { openDatabase } = require('../../db');
const { migrate } = require('../../db/migrate');
const { createApp } = require('../../application/api');

const dbPath = resolveDbPath();
const db = openDatabase(dbPath);
migrate(db, { dbPath, backup: true });
const appApi = createApp(db, { migrateOnStart: false });
appApi.commands.ensureMainWarehouse('system/bootstrap');

function serializeError(err) {
  return { ok: false, code: err && err.code ? err.code : 'INTERNAL', message: (err && err.message) || 'unknown error' };
}

function registerIpc() {
  // Server-side auth: ONLY a bare actor name is accepted from the renderer.
  // Any object (e.g. { actor, grants }) is coerced to a name — privilege NEVER
  // crosses IPC. Single-user desktop grants itself '*'; hosted mode will build
  // session grants here instead. Enforcement happens in the application layer.
  const serverAuth = (actor) => (typeof actor === 'string' && actor.trim()
    ? { actor: actor.trim().slice(0, 120), grants: ['*'] }
    : { actor: 'renderer', grants: ['*'] });
  const routes = {
    'products:create': ([input, actor]) => appApi.commands.createProduct(input, serverAuth(actor)),
    'products:update': ([id, fields, actor]) => appApi.commands.updateProduct(id, fields, serverAuth(actor)),
    'products:list': ([opts]) => appApi.queries.listProducts(opts),
    'products:get': ([id]) => appApi.queries.getProduct(id),
    'products:set-active': ([id, active, actor]) => appApi.commands.setProductActive(id, active, serverAuth(actor)),
    'products:delete': ([id, actor]) => appApi.commands.deleteProduct(id, serverAuth(actor)),
    'stock:receive': ([payload, actor]) => appApi.commands.receiveStock(payload, serverAuth(actor)),
    'stock:cancel-receipt': ([id, reason, actor]) => appApi.commands.cancelReceipt(id, reason, serverAuth(actor)),
    'categories:list': () => appApi.queries.listCategories(),
    'categories:tree': () => appApi.queries.getCategoryTree(),
    'categories:create': ([input, actor]) => appApi.commands.createCategory(input, serverAuth(actor)),
    'categories:delete': ([id, actor]) => appApi.commands.deleteCategory(id, serverAuth(actor)),
    'units:list': () => appApi.queries.listUnits(),
    'units:create': ([input, actor]) => appApi.commands.createUnit(input, serverAuth(actor)),
    'packs:list': ([productId]) => appApi.queries.listPacks(productId),
    'packs:create': ([productId, input, actor]) => appApi.commands.createPack(productId, input, serverAuth(actor)),
    'barcodes:list': ([productId]) => appApi.queries.listBarcodes(productId),
    'barcodes:add': ([productId, input, actor]) => appApi.commands.addBarcode(productId, input, serverAuth(actor)),
    'barcodes:remove': ([id, actor]) => appApi.commands.removeBarcode(id, serverAuth(actor)),
    'barcodes:resolve': ([code]) => appApi.queries.resolveBarcode(code),
    'prices:lists': () => appApi.queries.listPriceLists(),
    'prices:list-get': ([id]) => appApi.queries.getPriceList(id),
    'prices:list-create': ([input, actor]) => appApi.commands.createPriceList(input, serverAuth(actor)),
    'prices:list-update': ([id, fields, actor]) => appApi.commands.updatePriceList(id, fields, serverAuth(actor)),
    'prices:list-delete': ([id, actor]) => appApi.commands.deletePriceList(id, serverAuth(actor)),
    'prices:line-set': ([listId, input, actor]) => appApi.commands.setPriceLine(listId, input, serverAuth(actor)),
    'prices:line-remove': ([listId, input, actor]) => appApi.commands.removePriceLine(listId, input, serverAuth(actor)),
    'prices:resolve': ([args]) => appApi.queries.resolveSalePrice(args),
    'warehouses:list': () => appApi.queries.listWarehouses(),
    'warehouses:get': ([id]) => appApi.queries.getWarehouse(id),
    'warehouses:create': ([input, actor]) => appApi.commands.createWarehouse(input, serverAuth(actor)),
    'warehouses:set-active': ([id, active, actor]) => appApi.commands.setWarehouseActive(id, active, serverAuth(actor)),
    'warehouses:delete': ([id, actor]) => appApi.commands.deleteWarehouse(id, serverAuth(actor)),
    'stock:issue': ([args, actor]) => appApi.commands.issueStock(args, serverAuth(actor)),
    'stock:adjust': ([args, actor]) => appApi.commands.adjustStock(args, serverAuth(actor)),
    'stock:transfer': ([args, actor]) => appApi.commands.transferStock(args, serverAuth(actor)),
    'stock:reverse': ([id, reason, actor]) => appApi.commands.reverseStockMovement(id, reason, serverAuth(actor)),
    'stock:available': ([productId, warehouseId]) => appApi.queries.getAvailableStock(productId, warehouseId),
    'stock:ledger': ([opts]) => appApi.queries.getStockLedger(opts),
    'lots:create': ([productId, input, actor]) => appApi.commands.createLot(productId, input, serverAuth(actor)),
    'lots:delete': ([id, actor]) => appApi.commands.deleteLot(id, serverAuth(actor)),
    'lots:list': ([productId, opts]) => appApi.queries.listLots(productId, opts),
    'lots:get': ([id]) => appApi.queries.getLot(id),
    'lots:suggest': ([args]) => appApi.queries.suggestLots(args),
    'serials:list': ([productId, status]) => appApi.queries.listSerials(productId, status),
    'parties:list': ([opts]) => appApi.queries.listParties(opts),
    'parties:get': ([id]) => appApi.queries.getParty(id),
    'parties:create': ([input, actor]) => appApi.commands.createParty(input, serverAuth(actor)),
    'parties:update': ([id, fields, actor]) => appApi.commands.updateParty(id, fields, serverAuth(actor)),
    'parties:set-roles': ([id, roles, actor]) => appApi.commands.setPartyRoles(id, roles, serverAuth(actor)),
    'parties:set-active': ([id, active, actor]) => appApi.commands.setPartyActive(id, active, serverAuth(actor)),
    'parties:delete': ([id, actor]) => appApi.commands.deleteParty(id, serverAuth(actor)),
    'parties:phone-add': ([partyId, input, actor]) => appApi.commands.addPartyPhone(partyId, input, serverAuth(actor)),
    'parties:phone-remove': ([id, actor]) => appApi.commands.removePartyPhone(id, serverAuth(actor)),
    'parties:credit-check': ([args]) => appApi.queries.checkCredit(args),
    'documents:list': ([opts]) => appApi.queries.listDocuments(opts),
    'documents:get': ([id]) => appApi.queries.getDocument(id),
    'documents:create': ([input, actor]) => appApi.commands.createDocument(input, serverAuth(actor)),
    'documents:update': ([id, fields, actor]) => appApi.commands.updateDocument(id, fields, serverAuth(actor)),
    'documents:line-add': ([docId, line, actor]) => appApi.commands.addDocumentLine(docId, line, serverAuth(actor)),
    'documents:line-update': ([lineId, fields, actor]) => appApi.commands.updateDocumentLine(lineId, fields, serverAuth(actor)),
    'documents:line-remove': ([lineId, actor]) => appApi.commands.removeDocumentLine(lineId, serverAuth(actor)),
    'documents:confirm': ([id, actor]) => appApi.commands.confirmDocument(id, serverAuth(actor)),
    'documents:post': ([id, actor]) => appApi.commands.postDocument(id, serverAuth(actor)),
    'documents:cancel': ([id, reason, actor]) => appApi.commands.cancelDocument(id, reason, serverAuth(actor)),
    'sales:convert': ([sourceId, targetType, opts, actor]) => appApi.commands.convertDocument(sourceId, targetType, opts, serverAuth(actor)),
    'sales:convert-deliveries': ([ids, opts, actor]) => appApi.commands.convertDeliveriesToInvoice(ids, opts, serverAuth(actor)),
    'sales:post-delivery': ([id, opts, actor]) => appApi.commands.postDeliveryNote(id, opts, serverAuth(actor)),
    'sales:post-invoice': ([id, actor]) => appApi.commands.postInvoice(id, serverAuth(actor)),
    'stock:list': ([warehouse]) => appApi.queries.listStock(warehouse),
    'stock:movements': ([opts]) => appApi.queries.listMovements(opts),
    'receipts:list': ([opts]) => appApi.queries.listReceipts(opts),
    'receipts:get': ([id]) => appApi.queries.getReceipt(id),
    'audit:recent': ([opts]) => appApi.queries.recentAudit(opts),
    'warehouse:main': () => appApi.commands.ensureMainWarehouse(),
  };
  for (const [channel, handler] of Object.entries(routes)) {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return { ok: true, data: handler(args) };
      } catch (err) {
        return serializeError(err);
      }
    });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', '..', 'frontend', 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    try { appApi.close(); } catch { /* ignore */ }
    app.quit();
  }
});
