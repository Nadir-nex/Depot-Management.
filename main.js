const { app, BrowserWindow, ipcMain } = require('electron');
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
ipcMain.handle('companies:list', () => db.listCompanies());
ipcMain.handle('companies:add', (_e, payload) => db.addCompany(payload));

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

// ---- IPC: Orders (Phase B) ----
ipcMain.handle('orders:list', (_e, opts) => db.listOrders(opts || {}));
ipcMain.handle('orders:get', (_e, id) => db.getOrder(id));
ipcMain.handle('orders:create', (_e, payload) => db.createOrder(payload));
ipcMain.handle('orders:update-draft', (_e, payload) => db.updateDraftOrder(payload));
ipcMain.handle('orders:confirm', (_e, id) => db.confirmOrder(id));
ipcMain.handle('orders:set-status', (_e, id, to) => db.setOrderStatus(id, to));
ipcMain.handle('orders:set-delivery-date', (_e, id, date) => db.setDeliveryDate(id, date));
ipcMain.handle('orders:delete', (_e, id) => db.deleteOrder(id));
ipcMain.handle('orders:customer-list', (_e, customerId) => db.listCustomerOrders(customerId));
ipcMain.handle('inventory:product-pricing', (_e, itemId) => db.productPricing(itemId));
ipcMain.handle('inventory:products-search', (_e, mode, query) => db.listProductsForOrder(mode, query));

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
