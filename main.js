const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./db/database');

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

// ---- IPC: Inventory only (v1) ----
ipcMain.handle('items:list', (_e, search = '', catId = null, compId = null) => db.listItems(search, catId, compId));
ipcMain.handle('items:add', (_e, payload) => db.addItem(payload));
ipcMain.handle('shipments:add', (_e, payload) => db.addShipment(payload));
ipcMain.handle('shipments:list', (_e, itemId) => db.listShipments(itemId));
ipcMain.handle('shipments:detailed', (_e, search = '', catId = null, compId = null, expiringOnly = false, sort = 'expiry_asc') => db.listShipmentsDetailed(search, catId, compId, expiringOnly, sort));
ipcMain.handle('inventory:overview', () => db.getOverview());
ipcMain.handle('categories:list', () => db.listCategories());
ipcMain.handle('categories:add', (_e, payload) => db.addCategory(payload));
ipcMain.handle('categories:update', (_e, payload) => db.updateCategory(payload));
ipcMain.handle('categories:delete', (_e, id) => db.deleteCategory(id));
ipcMain.handle('companies:list', () => db.listCompanies());
ipcMain.handle('companies:add', (_e, payload) => db.addCompany(payload));
ipcMain.handle('companies:update', (_e, payload) => db.updateCompany(payload));
ipcMain.handle('companies:delete', (_e, id) => db.deleteCompany(id));
ipcMain.handle('items:get', (_e, id) => db.getItem(id));
ipcMain.handle('items:update', (_e, payload) => db.updateItem(payload));
ipcMain.handle('items:delete', (_e, id) => db.deleteItem(id));
ipcMain.handle('shipments:get', (_e, id) => db.getShipment(id));
ipcMain.handle('shipments:update', (_e, payload) => db.updateShipment(payload));
ipcMain.handle('shipments:delete', (_e, id) => db.deleteShipment(id));
ipcMain.handle('districts:update', (_e, payload) => db.updateDistrict(payload));
ipcMain.handle('districts:delete', (_e, id) => db.deleteDistrict(id));

// ---- IPC: Customers (Phase A) ----
ipcMain.handle('districts:list', () => db.listDistricts());
ipcMain.handle('districts:add', (_e, payload) => db.addDistrict(payload));
ipcMain.handle('customers:list', (_e, opts) => db.listCustomers(opts || {}));
ipcMain.handle('customers:get', (_e, id) => db.getCustomer(id));
ipcMain.handle('customers:add', (_e, payload) => db.addCustomer(payload));
ipcMain.handle('customers:update', (_e, payload) => db.updateCustomer(payload));
ipcMain.handle('customers:delete', (_e, id) => db.deleteCustomer(id));
ipcMain.handle('customers:restore', (_e, id) => db.restoreCustomer(id));
ipcMain.handle('customers:phones:add', (_e, payload) => db.addCustomerPhone(payload));
ipcMain.handle('customers:phones:delete', (_e, id) => db.deleteCustomerPhone(id));
ipcMain.handle('customers:phones:check', (_e, phone, excludeId) => db.findPhoneOwners(phone, excludeId ?? null));

// ---- IPC: Customer types (Phase 1 — DB-driven) ----
ipcMain.handle('customer-types:list', () => db.listCustomerTypes());
ipcMain.handle('customer-types:add', (_e, payload) => db.addCustomerType(payload));
ipcMain.handle('customer-types:update', (_e, payload) => db.updateCustomerType(payload));
ipcMain.handle('customer-types:delete', (_e, id) => db.deleteCustomerType(id));

// ---- IPC: Orders (Phase B + persisted pricing layer) ----
ipcMain.handle('orders:list', (_e, opts) => db.listOrders(opts || {}));
ipcMain.handle('orders:get', (_e, id) => db.getOrder(id));
ipcMain.handle('orders:create', (_e, payload) => db.createOrder(payload));
ipcMain.handle('orders:update-draft', (_e, payload) => db.updateDraftOrder(payload));
ipcMain.handle('orders:confirm', (_e, id) => db.confirmOrder(id));
ipcMain.handle('orders:set-status', (_e, id, to) => db.setOrderStatus(id, to));
ipcMain.handle('orders:set-delivery-date', (_e, id, date) => db.setDeliveryDate(id, date));
ipcMain.handle('orders:delete', (_e, id) => db.deleteOrder(id));
ipcMain.handle('orders:customer-list', (_e, customerId) => db.listCustomerOrders(customerId));
ipcMain.handle('inventory:product-pricing', (_e, itemId, customerId) => db.productPricing(itemId, customerId ?? null));
ipcMain.handle('inventory:products-search', (_e, mode, query, customerId) => db.listProductsForOrder(mode, query, customerId ?? null));

// ---- IPC: Persistent pricing layer (product_costs / product_prices / history) ----
ipcMain.handle('pricing:cost:get', (_e, itemId) => db.getProductCost(Number(itemId)));
ipcMain.handle('pricing:cost:set', (_e, payload) => db.setProductCost(Number(payload.item_id), payload.current_cost));
ipcMain.handle('pricing:get', (_e, itemId) => db.getProductPrices(Number(itemId)));
ipcMain.handle('pricing:manual:set', (_e, payload) => db.setProductManualPrice(Number(payload.item_id), Number(payload.customer_type_id), payload.manual_price));
ipcMain.handle('pricing:manual:clear', (_e, payload) => db.clearProductManualPrice(Number(payload.item_id), Number(payload.customer_type_id)));
ipcMain.handle('pricing:history', (_e, itemId, typeId) => db.getProductPriceHistory(Number(itemId), typeId ?? null));

// ---- IPC: Staff & Vehicles (Phase C) ----
ipcMain.handle('employees:list', (_e, opts) => db.listEmployees(opts || {}));
ipcMain.handle('employees:get', (_e, id) => db.getEmployee(id));
ipcMain.handle('employees:add', (_e, payload) => db.addEmployee(payload));
ipcMain.handle('employees:update', (_e, payload) => db.updateEmployee(payload));
ipcMain.handle('employees:delete', (_e, id) => db.deleteEmployee(id));
ipcMain.handle('employees:restore', (_e, id) => db.restoreEmployee(id));
ipcMain.handle('employees:phones:add', (_e, payload) => db.addEmployeePhone(payload));
ipcMain.handle('employees:phones:delete', (_e, id) => db.deleteEmployeePhone(id));
ipcMain.handle('employees:roles:set', (_e, payload) => db.setEmployeeRoles(payload));
ipcMain.handle('employees:by-role', (_e, role) => db.listEmployeesByRole(role));
ipcMain.handle('vehicles:list', (_e, opts) => db.listVehicles(opts || {}));
ipcMain.handle('vehicles:get', (_e, id) => db.getVehicle(id));
ipcMain.handle('vehicles:add', (_e, payload) => db.addVehicle(payload));
ipcMain.handle('vehicles:update', (_e, payload) => db.updateVehicle(payload));
ipcMain.handle('vehicles:delete', (_e, id) => db.deleteVehicle(id));
ipcMain.handle('vehicles:restore', (_e, id) => db.restoreVehicle(id));
ipcMain.handle('vehicles:set-availability', (_e, payload) => db.setVehicleAvailability(payload));

// ---- IPC: Deliveries (Phase D) ----
ipcMain.handle('deliveries:list', (_e, opts) => db.listDeliveries(opts || {}));
ipcMain.handle('deliveries:get', (_e, id) => db.getDelivery(id));
ipcMain.handle('deliveries:create', (_e, payload) => db.createDelivery(payload));
ipcMain.handle('deliveries:update', (_e, payload) => db.updatePlannedDelivery(payload));
ipcMain.handle('deliveries:start', (_e, id) => db.startDelivery(id));
ipcMain.handle('deliveries:complete', (_e, id) => db.completeDelivery(id));
ipcMain.handle('deliveries:hide', (_e, id) => db.hideDelivery(id));
ipcMain.handle('deliveries:delete', (_e, id) => db.deleteDelivery(id));
ipcMain.handle('deliveries:add-order', (_e, payload) => db.addOrderToDelivery(payload));
ipcMain.handle('deliveries:remove-order', (_e, payload) => db.removeOrderFromDelivery(payload));
ipcMain.handle('deliveries:deliver-order', (_e, payload) => db.deliverOrder(payload));
ipcMain.handle('deliveries:reorder-stops', (_e, payload) => db.reorderStops(payload));
ipcMain.handle('deliveries:eligible-orders', (_e, opts) => db.eligibleOrders(opts || {}));
ipcMain.handle('deliveries:stock-check', (_e, id) => db.deliveryStockCheck(id));

ipcMain.handle('receipts:import', (_e, rows) => db.importReceipt(rows));

// ---- IPC: Warnings (Phase W — read-only) ----
ipcMain.handle('warnings:get', (_e, opts) => db.getWarnings(opts || {}));

// ---- IPC: Database export (manual backup only) ----
ipcMain.handle('database:export', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'تصدير قاعدة البيانات',
    defaultPath: `depot-management-backup-${stamp}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  try {
    db.exportBackup(filePath);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

app.whenReady().then(() => {
  db.init();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
