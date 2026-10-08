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
    'purchases:record-invoice': ([id, input, actor]) => appApi.commands.recordSupplierInvoice(id, input, serverAuth(actor)),
    'returns:create': ([deliveryId, input, actor]) => appApi.commands.createCustomerReturn(deliveryId, input, serverAuth(actor)),
    'returns:post': ([id, input, actor]) => appApi.commands.postCustomerReturn(id, input, serverAuth(actor)),
    'returns:to-supplier': ([input, actor]) => appApi.commands.returnToSupplier(input, serverAuth(actor)),
    'payments:record': ([input, actor]) => appApi.commands.recordPayment(input, serverAuth(actor)),
    'payments:reverse': ([id, reason, actor]) => appApi.commands.reversePayment(id, reason, serverAuth(actor)),
    'settlements:settle': ([stopId, input, actor]) => appApi.commands.settleStop(stopId, input, serverAuth(actor)),
    'settlements:get': ([stopId]) => appApi.queries.getStopSettlement(stopId),
    'settlements:reconciliation': ([routeId]) => appApi.queries.routeReconciliation(routeId),
    'payments:list': ([opts]) => appApi.queries.listPayments(opts),
    'payments:get': ([id]) => appApi.queries.getPayment(id),
    'cash:account-create': ([input, actor]) => appApi.commands.createCashAccount(input, serverAuth(actor)),
    'cash:accounts': () => appApi.queries.listCashAccounts(),
    'cash:session-open': ([accountId, input, actor]) => appApi.commands.openCashSession(accountId, input, serverAuth(actor)),
    'cash:session-close': ([id, input, actor]) => appApi.commands.closeCashSession(id, input, serverAuth(actor)),
    'cash:session-report': ([id]) => appApi.queries.sessionReport(id),
    'parties:balance': ([partyId]) => appApi.queries.partyBalance(partyId),
    'expenses:categories': () => appApi.queries.listExpenseCategories(),
    'expenses:category-create': ([input, actor]) => appApi.commands.createExpenseCategory(input, serverAuth(actor)),
    'expenses:category-delete': ([id, actor]) => appApi.commands.deleteExpenseCategory(id, serverAuth(actor)),
    'expenses:list': ([opts]) => appApi.queries.listExpenses(opts),
    'expenses:get': ([id]) => appApi.queries.getExpense(id),
    'expenses:create': ([input, actor]) => appApi.commands.createExpense(input, serverAuth(actor)),
    'expenses:reverse': ([id, reason, actor]) => appApi.commands.reverseExpense(id, reason, serverAuth(actor)),
    'expenses:report': ([opts]) => appApi.queries.expenseReport(opts),
    'counts:list': ([opts]) => appApi.queries.listCounts(opts),
    'counts:get': ([id]) => appApi.queries.getCount(id),
    'counts:create': ([input, actor]) => appApi.commands.createCount(input, serverAuth(actor)),
    'counts:line-add': ([countId, input, actor]) => appApi.commands.addCountLine(countId, input, serverAuth(actor)),
    'counts:line-update': ([lineId, input, actor]) => appApi.commands.updateCountLine(lineId, input, serverAuth(actor)),
    'counts:line-remove': ([lineId, actor]) => appApi.commands.removeCountLine(lineId, serverAuth(actor)),
    'counts:submit': ([id, actor]) => appApi.commands.submitCount(id, serverAuth(actor)),
    'counts:approve': ([id, actor]) => appApi.commands.approveCount(id, serverAuth(actor)),
    'counts:post': ([id, actor]) => appApi.commands.postCount(id, serverAuth(actor)),
    'counts:cancel': ([id, reason, actor]) => appApi.commands.cancelCount(id, reason, serverAuth(actor)),
    'drivers:list': () => appApi.queries.listDrivers(),
    'drivers:create': ([input, actor]) => appApi.commands.createDriver(input, serverAuth(actor)),
    'drivers:set-active': ([id, active, actor]) => appApi.commands.setDriverActive(id, active, serverAuth(actor)),
    'vehicles:list': () => appApi.queries.listVehicles(),
    'vehicles:create': ([input, actor]) => appApi.commands.createVehicle(input, serverAuth(actor)),
    'vehicles:set-active': ([id, active, actor]) => appApi.commands.setVehicleActive(id, active, serverAuth(actor)),
    'routes:list': ([opts]) => appApi.queries.listRoutes(opts),
    'routes:get': ([id]) => appApi.queries.getRoute(id),
    'routes:create': ([input, actor]) => appApi.commands.createRoute(input, serverAuth(actor)),
    'routes:assign': ([id, input, actor]) => appApi.commands.assignRoute(id, input, serverAuth(actor)),
    'routes:stop-add': ([routeId, input, actor]) => appApi.commands.addStop(routeId, input, serverAuth(actor)),
    'routes:stop-remove': ([id, actor]) => appApi.commands.removeStop(id, serverAuth(actor)),
    'routes:load': ([id, actor]) => appApi.commands.loadRoute(id, serverAuth(actor)),
    'routes:dispatch': ([id, actor]) => appApi.commands.dispatchRoute(id, serverAuth(actor)),
    'routes:stop-complete': ([id, input, actor]) => appApi.commands.completeStop(id, input, serverAuth(actor)),
    'routes:stop-fail': ([id, input, actor]) => appApi.commands.failStop(id, input, serverAuth(actor)),
    'routes:complete': ([id, to, actor]) => appApi.commands.completeRoute(id, to, serverAuth(actor)),
    'routes:cancel': ([id, reason, actor]) => appApi.commands.cancelRoute(id, reason, serverAuth(actor)),
    'loading:reserve': ([routeId, input, actor]) => appApi.commands.reserveStock(routeId, input, serverAuth(actor)),
    'loading:release': ([routeId, actor]) => appApi.commands.releaseReservations(routeId, serverAuth(actor)),
    'loading:list': ([routeId]) => appApi.queries.listReservations(routeId),
    'loading:available': ([args]) => appApi.queries.availableStock(args),
    'stock:list': ([warehouse]) => appApi.queries.listStock(warehouse),
    'stock:movements': ([opts]) => appApi.queries.listMovements(opts),
    'receipts:list': ([opts]) => appApi.queries.listReceipts(opts),
    'receipts:get': ([id]) => appApi.queries.getReceipt(id),
    'audit:recent': ([opts]) => appApi.queries.recentAudit(opts),
    'warehouse:main': () => appApi.commands.ensureMainWarehouse(),
    // Reports
    'reports:sales-by-date': ([opts]) => appApi.queries.getSalesByDate(opts),
    'reports:sales-by-customer': ([opts]) => appApi.queries.getSalesByCustomer(opts),
    'reports:sales-by-product': ([opts]) => appApi.queries.getSalesByProduct(opts),
    'reports:sales-by-salesperson': ([opts]) => appApi.queries.getSalesBySalesperson(opts),
    'reports:sales-by-route': ([opts]) => appApi.queries.getSalesByRoute(opts),
    'reports:sales-by-doctype': ([opts]) => appApi.queries.getSalesByDocumentType(opts),
    'reports:sales-margin': ([opts]) => appApi.queries.getSalesMargin(opts),
    'reports:customer-balances': ([opts]) => appApi.queries.getCustomerBalances(opts),
    'reports:overdue': ([opts]) => appApi.queries.getOverdueAmounts(opts),
    'reports:payment-history': ([opts]) => appApi.queries.getPaymentHistory(opts),
    'reports:aging': ([opts]) => appApi.queries.getAgingReport(opts),
    'reports:current-stock': ([opts]) => appApi.queries.getCurrentStock(opts),
    'reports:stock-valuation': ([opts]) => appApi.queries.getStockValuation(opts),
    'reports:movement-history': ([opts]) => appApi.queries.getMovementHistory(opts),
    'reports:low-stock': ([opts]) => appApi.queries.getLowStockProducts(opts),
    'reports:lot-expiry': ([opts]) => appApi.queries.getLotExpiryReport(opts),
    'reports:warehouse-comparison': ([opts]) => appApi.queries.getWarehouseComparison(opts),
    'reports:purchases-by-supplier': ([opts]) => appApi.queries.getPurchasesBySupplier(opts),
    'reports:purchases-by-product': ([opts]) => appApi.queries.getPurchasesByProduct(opts),
    'reports:purchases-by-date': ([opts]) => appApi.queries.getPurchasesByDate(opts),
    'reports:received-vs-ordered': ([opts]) => appApi.queries.getReceivedVsOrdered(opts),
    'reports:supplier-balances': ([opts]) => appApi.queries.getSupplierBalances(opts),
    'reports:route-completion': ([opts]) => appApi.queries.getRouteCompletion(opts),
    'reports:failed-deliveries': ([opts]) => appApi.queries.getFailedDeliveries(opts),
    'reports:quantity-delivered': ([opts]) => appApi.queries.getQuantityDelivered(opts),
    'reports:customer-collections': ([opts]) => appApi.queries.getCustomerCollections(opts),
    'reports:driver-vehicle': ([opts]) => appApi.queries.getDriverVehiclePerformance(opts),
    'reports:session-summary': ([opts]) => appApi.queries.getSessionSummary(opts),
    'reports:cash-receipts': ([opts]) => appApi.queries.getCashReceipts(opts),
    'reports:cash-payments': ([opts]) => appApi.queries.getCashPayments(opts),
    'reports:expenses': ([opts]) => appApi.queries.getExpensesReport(opts),
    'reports:adjustments': ([opts]) => appApi.queries.getAdjustmentsReport(opts),
    'reports:discrepancies': ([opts]) => appApi.queries.getDiscrepanciesReport(opts),
    'reports:daily-cash-position': ([opts]) => appApi.queries.getDailyCashPosition(opts),
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
