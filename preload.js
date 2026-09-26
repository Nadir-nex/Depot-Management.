const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listItems: (search, catId, compId) => ipcRenderer.invoke('items:list', search, catId, compId),
  addItem: (payload) => ipcRenderer.invoke('items:add', payload),
  addShipment: (payload) => ipcRenderer.invoke('shipments:add', payload),
  listShipments: (itemId) => ipcRenderer.invoke('shipments:list', itemId),
  listShipmentsDetailed: (search, catId, compId, expiringOnly, sort) => ipcRenderer.invoke('shipments:detailed', search, catId, compId, expiringOnly, sort),
  overview: () => ipcRenderer.invoke('inventory:overview'),
  listCategories: () => ipcRenderer.invoke('categories:list'),
  addCategory: (payload) => ipcRenderer.invoke('categories:add', payload),
  listCompanies: () => ipcRenderer.invoke('companies:list'),
  addCompany: (payload) => ipcRenderer.invoke('companies:add', payload),
  listDistricts: () => ipcRenderer.invoke('districts:list'),
  addDistrict: (payload) => ipcRenderer.invoke('districts:add', payload),
  listCustomers: (opts) => ipcRenderer.invoke('customers:list', opts),
  getCustomer: (id) => ipcRenderer.invoke('customers:get', id),
  addCustomer: (payload) => ipcRenderer.invoke('customers:add', payload),
  updateCustomer: (payload) => ipcRenderer.invoke('customers:update', payload),
  deleteCustomer: (id) => ipcRenderer.invoke('customers:delete', id),
  restoreCustomer: (id) => ipcRenderer.invoke('customers:restore', id),
  addCustomerPhone: (payload) => ipcRenderer.invoke('customers:phones:add', payload),
  deleteCustomerPhone: (id) => ipcRenderer.invoke('customers:phones:delete', id),
  checkPhoneOwners: (phone, excludeId) => ipcRenderer.invoke('customers:phones:check', phone, excludeId ?? null)
});
