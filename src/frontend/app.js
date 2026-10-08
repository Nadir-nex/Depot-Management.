'use strict';
/* Browser-compatible frontend. No Electron imports, no Node imports, no SQL.
 * Transport resolution (works in Electron AND in a future hosted browser build):
 *  - Electron desktop: window.depotApi (injected by preload, IPC -> local app layer)
 *  - Future web:       fetch('/api/<method>') (hosted app layer) — same method names.
 */
(function () {
  const api = window.depotApi || httpApi();

  function httpApi() {
    async function post(method, body) {
      const res = await fetch(`/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      return res.json();
    }
    return {
      _transport: 'http:/api (future hosted backend)',
      createProduct: (input) => post('products:create', { input }),
      receiveStock: (payload) => post('stock:receive', { payload }),
      listStock: (w) => post('stock:list', { warehouse: w }),
      listReceipts: () => post('receipts:list', {}),
      listCategories: () => post('categories:list', {}),
      listWarehouses: () => post('warehouses:list', {}),
    };
  }

  const transportEl = document.getElementById('transport');
  transportEl.textContent = window.depotApi ? 'desktop · local API' : (api._transport || 'unknown transport');

  function show(el, ok, text) {
    el.textContent = text;
    el.className = `msg ${ok ? 'ok' : 'err'}`;
  }

  async function unwrap(promise) {
    const res = await promise;
    if (!res || res.ok !== true) throw new Error((res && (res.message || res.code)) || 'request failed');
    return res.data;
  }

  async function refresh() {
    await refreshCategories();
    await refreshWarehouses();
    const stockWh = document.getElementById('stock-warehouse');
    const warehouse = stockWh && stockWh.value ? stockWh.value : 'MAIN';
    const stockBody = document.getElementById('stock-body');
    const receiptsBody = document.getElementById('receipts-body');
    try {
      const stock = await unwrap(api.listStock(warehouse));
      const rows = stock.rows || stock;
      stockBody.innerHTML = rows.length
        ? rows.map((r) => `<tr><td>${escapeHtml(r.sku)}</td><td>${escapeHtml(r.name)}</td><td>${r.stock}</td><td>${r.default_sale_price}</td></tr>`).join('')
        : '<tr><td colspan="4">لا يوجد مخزون بعد.</td></tr>';
    } catch (e) {
      stockBody.innerHTML = `<tr><td colspan="4">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
    try {
      const receipts = await unwrap(api.listReceipts({}));
      receiptsBody.innerHTML = receipts.length
        ? receipts.slice(0, 20).map((r) => `<tr><td>${escapeHtml(r.receipt_no)}</td><td>${escapeHtml(r.supplier_name || '')}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.posted_at || '')}</td></tr>`).join('')
        : '<tr><td colspan="4">لا توجد سندات بعد.</td></tr>';
    } catch (e) {
      receiptsBody.innerHTML = `<tr><td colspan="4">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function refreshCategories() {
    if (typeof api.listCategories !== 'function') return;
    try {
      const cats = await unwrap(api.listCategories());
      const sel = document.querySelector('select[name="categoryId"]');
      if (!sel) return;
      const keep = sel.value;
      sel.innerHTML = '<option value="">— بدون فئة —</option>' + cats.map((c) =>
        `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      sel.value = keep;
    } catch (e) { /* categories stay empty; form still submits */ }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function refreshWarehouses() {
    if (typeof api.listWarehouses !== 'function') return;
    try {
      const list = await unwrap(api.listWarehouses());
      const active = list.filter((w) => w.is_active === 1 || w.is_active === undefined);
      const fill = (sel, keepFirst) => {
        if (!sel || active.length === 0) return;
        const keep = sel.value;
        sel.innerHTML = (keepFirst ? '<option value="">—</option>' : '') + active.map((w) =>
          `<option value="${escapeHtml(w.code)}">${escapeHtml(w.code)}</option>`).join('');
        const stillThere = [...sel.options].some((o) => o.value === keep);
        sel.value = stillThere ? keep : sel.options[0].value;
      };
      fill(document.querySelector('select[name="warehouseCode"]'), false);
      fill(document.getElementById('stock-warehouse'), false);
    } catch (e) { /* warehouse selects keep their MAIN default */ }
  }

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('product-msg');
    const fd = new FormData(e.target);
    try {
      const created = await unwrap(api.createProduct({
        sku: String(fd.get('sku') || '').trim(),
        name: String(fd.get('name') || '').trim(),
        barcode: String(fd.get('barcode') || '').trim() || null,
        categoryId: String(fd.get('categoryId') || '').trim() === '' ? null : Number(String(fd.get('categoryId')).trim()),
        defaultUnitCost: Number(String(fd.get('defaultUnitCost') || '0').trim() || 0),
        defaultSalePrice: Number(String(fd.get('defaultSalePrice') || '0').trim() || 0),
        minStock: Number(String(fd.get('minStock') || '0').trim() || 0),
      }));
      show(msg, true, `تم إنشاء المنتج #${created.id} (${created.sku}).`);
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشل الإنشاء: ${err.message}`);
    }
  });

  document.getElementById('receipt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('receipt-msg');
    const fd = new FormData(e.target);
    try {
      const receipt = await unwrap(api.receiveStock({
        warehouseCode: String(fd.get('warehouseCode') || 'MAIN').trim() || 'MAIN',
        supplierName: String(fd.get('supplierName') || ''),
        lines: [{
          sku: String(fd.get('sku') || '').trim(),
          qty: Number(String(fd.get('qty') || '').trim()),
          unitCost: Number(String(fd.get('unitCost') || '0').trim() || 0),
        }],
      }));
      show(msg, true, `تم الاستلام: ${receipt.receipt_no} (${receipt.lines.length} سطر).`);
      refresh();
    } catch (err) {
      show(msg, false, `فشل الاستلام: ${err.message}`);
    }
  });

  document.getElementById('refresh').addEventListener('click', refresh);
  document.getElementById('stock-warehouse').addEventListener('change', refresh);

  document.getElementById('stockop-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('stockop-msg');
    const fd = new FormData(e.target);
    const op = String(fd.get('op') || 'issue');
    const base = {
      sku: String(fd.get('sku') || '').trim(),
      warehouseCode: String(fd.get('warehouseCode') || 'MAIN').trim() || 'MAIN',
      reason: String(fd.get('reason') || 'correction'),
    };
    const qty = Number(String(fd.get('qty') || '').trim());
    try {
      if (typeof api.issueStock !== 'function') throw new Error('stock operations need the desktop API');
      if (op === 'issue') await unwrap(api.issueStock({ ...base, qty }));
      else if (op === 'adjust') await unwrap(api.adjustStock({ ...base, qty }));
      else await unwrap(api.transferStock({ ...base, toWarehouseCode: String(fd.get('toWarehouseCode') || '').trim(), qty: Math.abs(qty) }));
      show(msg, true, 'تمت العملية بنجاح.');
      refresh();
    } catch (err) {
      show(msg, false, `فشلت العملية: ${err.message}`);
    }
  });
  refresh();
})();
