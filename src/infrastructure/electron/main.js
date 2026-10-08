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
  const routes = {
    'products:create': ([input, actor]) => appApi.commands.createProduct(input, actor),
    'products:list': ([opts]) => appApi.queries.listProducts(opts),
    'products:get': ([id]) => appApi.queries.getProduct(id),
    'products:set-active': ([id, active, actor]) => appApi.commands.setProductActive(id, active, actor),
    'products:delete': ([id, actor]) => appApi.commands.deleteProduct(id, actor),
    'stock:receive': ([payload, actor]) => appApi.commands.receiveStock(payload, actor),
    'stock:cancel-receipt': ([id, reason, actor]) => appApi.commands.cancelReceipt(id, reason, actor),
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
