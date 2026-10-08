// Preload bridge — exposes a promise-based window.depotApi over IPC.
// Browser-compatible contract: { ok:true, data } or { ok:false, code, message }.
// The future web build provides the SAME method names over fetch('/api').
const { contextBridge, ipcRenderer } = require('electron');

function call(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('depotApi', {
  createProduct: (input, actor) => call('products:create', input, actor),
  updateProduct: (id, fields, actor) => call('products:update', id, fields, actor),
  listProducts: (opts) => call('products:list', opts),
  getProduct: (id) => call('products:get', id),
  setProductActive: (id, active, actor) => call('products:set-active', id, active, actor),
  deleteProduct: (id, actor) => call('products:delete', id, actor),
  receiveStock: (payload, actor) => call('stock:receive', payload, actor),
  cancelReceipt: (id, reason, actor) => call('stock:cancel-receipt', id, reason, actor),
  listStock: (warehouse) => call('stock:list', warehouse),
  listMovements: (opts) => call('stock:movements', opts),
  listReceipts: (opts) => call('receipts:list', opts),
  getReceipt: (id) => call('receipts:get', id),
  recentAudit: (opts) => call('audit:recent', opts),
  ensureMainWarehouse: () => call('warehouse:main'),
});
