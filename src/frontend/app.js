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
      listParties: () => post('parties:list', {}),
      createParty: (input) => post('parties:create', { input }),
      listDocuments: () => post('documents:list', {}),
      createDocument: (input) => post('documents:create', { input }),
      confirmDocument: (id) => post('documents:confirm', { id }),
      postDocument: (id) => post('documents:post', { id }),
      convertDocument: (sourceId, targetType, opts) => post('sales:convert', { sourceId, targetType, opts }),
      convertDeliveriesToInvoice: (ids, opts) => post('sales:convert-deliveries', { ids, opts }),
      postDeliveryNote: (id, opts) => post('sales:post-delivery', { id, opts }),
      postInvoice: (id) => post('sales:post-invoice', { id }),
      recordSupplierInvoice: (id, input) => post('purchases:record-invoice', { id, input }),
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
    await refreshParties();
    await refreshSales();
    await refreshPOs();
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

  async function refreshParties() {
    if (typeof api.listParties !== 'function') return;
    const body = document.getElementById('parties-body');
    if (!body) return;
    try {
      const rows = await unwrap(api.listParties({}));
      body.innerHTML = rows.length
        ? rows.slice(0, 30).map((p) => `<tr><td>${escapeHtml(p.code)}</td><td>${escapeHtml(p.display_name || p.displayName)}</td><td>${escapeHtml((p.roles || []).join(','))}</td><td>${p.balance ? p.balance.payable : '—'}</td></tr>`).join('')
        : '<tr><td colspan="4">لا يوجد متعاملون بعد.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="4">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  const SALES_TYPES = ['sales_quote', 'sales_order', 'delivery_note', 'sales_invoice', 'proforma_invoice'];

  function salesActionFor(doc) {
    if (doc.status === 'draft') return { action: 'confirm', label: 'تأكيد' };
    if (doc.status === 'confirmed' && doc.docType !== 'sales_quote' && doc.docType !== 'proforma_invoice') return { action: 'post', label: 'ترحيل' };
    if (doc.status === 'posted' && doc.docType === 'sales_order') return { action: 'deliver', label: 'توصيل الكل' };
    if (doc.status === 'posted' && doc.docType === 'delivery_note') return { action: 'invoice', label: 'فوترة' };
    return null;
  }

  async function refreshSales() {
    const body = document.getElementById('sales-body');
    if (!body || typeof api.listDocuments !== 'function') return;
    try {
      const docs = await unwrap(api.listDocuments({}));
      const rows = docs.filter((d) => SALES_TYPES.includes(d.docType)).slice(0, 20);
      body.innerHTML = rows.length
        ? rows.map((d) => {
            const a = salesActionFor(d);
            return `<tr><td>${escapeHtml(d.docNo || d.doc_no)}</td><td>${escapeHtml(d.docType || d.doc_type)}</td><td>${escapeHtml(d.status)}</td><td>${d.grandTotal ?? d.grand_total}</td><td>${a ? `<button data-sales-action="${a.action}" data-id="${d.id}">${a.label}</button>` : '—'}</td></tr>`;
          }).join('')
        : '<tr><td colspan="5">لا توجد وثائق بيع بعد.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function salesAct(action, id) {
    if (action === 'confirm') await unwrap(api.confirmDocument(id));
    else if (action === 'post') await unwrap(api.postDocument(id));
    else if (action === 'deliver') {
      const dn = await unwrap(api.convertDocument(id, 'delivery_note', { warehouseCode: currentWarehouseCode() }));
      await unwrap(api.confirmDocument(dn.id));
      await unwrap(api.postDeliveryNote(dn.id, {}));
    } else if (action === 'invoice') {
      const inv = await unwrap(api.convertDeliveriesToInvoice([id], {}));
      await unwrap(api.confirmDocument(inv.id));
      await unwrap(api.postInvoice(inv.id));
    }
    refresh();
  }

  function currentWarehouseCode() {
    const sel = document.getElementById('stock-warehouse');
    return (sel && sel.value) || 'MAIN';
  }

  document.getElementById('product-form').addEventListener('submit', async (e) => {    e.preventDefault();
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
        purchaseOrderId: String(fd.get('purchaseOrderId') || '').trim() === '' ? null : Number(String(fd.get('purchaseOrderId')).trim()),
        lines: [{
          sku: String(fd.get('sku') || '').trim(),
          qty: Number(String(fd.get('qty') || '').trim()),
          unitCost: Number(String(fd.get('unitCost') || '0').trim() || 0),
        }],
      }));
      const invNo = String(fd.get('supplierInvoiceNo') || '').trim();
      if (invNo && typeof api.recordSupplierInvoice === 'function') {
        await unwrap(api.recordSupplierInvoice(receipt.id, { invoiceNo: invNo }));
      }
      show(msg, true, `تم الاستلام: ${receipt.receipt_no} (${receipt.lines.length} سطر).`);
      refresh();
    } catch (err) {
      show(msg, false, `فشل الاستلام: ${err.message}`);
    }
  });

  async function refreshPOs() {
    const body = document.getElementById('po-body');
    if (!body || typeof api.listDocuments !== 'function') return;
    try {
      const docs = await unwrap(api.listDocuments({}));
      const rows = docs.filter((d) => (d.docType || d.doc_type) === 'purchase_order').slice(0, 20);
      body.innerHTML = rows.length
        ? rows.map((d) => {
            const action = d.status === 'draft' ? { a: 'confirm', l: 'تأكيد' } : d.status === 'confirmed' ? { a: 'post', l: 'ترحيل' } : null;
            return `<tr><td>${escapeHtml(d.docNo || d.doc_no)} (#${d.id})</td><td>${escapeHtml(d.partyId ?? d.party_id ?? '')}</td><td>${escapeHtml(d.status)}</td><td>${d.grandTotal ?? d.grand_total}</td><td>${action ? `<button data-po-action="${action.a}" data-id="${d.id}">${action.l}</button>` : '—'}</td></tr>`;
          }).join('')
        : '<tr><td colspan="5">لا توجد طلبات شراء بعد.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  document.getElementById('po-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-po-action]');
    if (!btn) return;
    const msg = document.getElementById('po-msg');
    try {
      if (btn.dataset.poAction === 'confirm') await unwrap(api.confirmDocument(Number(btn.dataset.id)));
      else await unwrap(api.postDocument(Number(btn.dataset.id)));
      show(msg, true, 'تمت العملية بنجاح.');
      refresh();
    } catch (err) {
      show(msg, false, `فشلت العملية: ${err.message}`);
    }
  });

  document.getElementById('po-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('po-msg');
    const fd = new FormData(e.target);
    try {
      const sku = String(fd.get('sku') || '').trim();
      const products = await unwrap(api.listProducts({ search: sku }));
      const product = products.find((x) => x.sku === sku);
      if (!product) throw new Error('product not found');
      const parties = await unwrap(api.listParties({ search: String(fd.get('supplierCode') || '').trim() }));
      const supplier = parties.find((x) => x.code === String(fd.get('supplierCode') || '').trim());
      if (!supplier) throw new Error('supplier not found');
      const created = await unwrap(api.createDocument({
        type: 'purchase_order', partyId: supplier.id,
        lines: [{
          productId: product.id,
          qty: Number(String(fd.get('qty') || '').trim()),
          unitPrice: Number(String(fd.get('unitCost') || '0').trim() || 0),
        }],
      }));
      show(msg, true, `تم إنشاء الطلب ${created.docNo || created.doc_no} (#${created.id}).`);
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشل الإنشاء: ${err.message}`);
    }
  });

  document.getElementById('sales-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-sales-action]');
    if (!btn) return;
    const msg = document.getElementById('sales-msg');
    try {
      await salesAct(btn.dataset.salesAction, Number(btn.dataset.id));
      show(msg, true, 'تمت العملية بنجاح.');
    } catch (err) {
      show(msg, false, `فشلت العملية: ${err.message}`);
    }
  });

  document.getElementById('sales-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('sales-msg');
    const fd = new FormData(e.target);
    try {
      const sku = String(fd.get('sku') || '').trim();
      const products = await unwrap(api.listProducts({ search: sku }));
      const product = products.find((x) => x.sku === sku);
      if (!product) throw new Error('product not found');
      const parties = await unwrap(api.listParties({ search: String(fd.get('customerCode') || '').trim() }));
      const customer = parties.find((x) => x.code === String(fd.get('customerCode') || '').trim());
      if (!customer) throw new Error('customer not found');
      const qty = Number(String(fd.get('qty') || '').trim());
      const unitPrice = Number(String(fd.get('unitPrice') || '0').trim() || 0);
      const resolved = (typeof api.resolveSalePrice === 'function')
        ? await unwrap(api.resolveSalePrice({ productId: product.id, customerCode: customer.code }))
        : { unitPrice };
      const created = await unwrap(api.createDocument({
        type: 'sales_order', partyId: customer.id,
        lines: [{ productId: product.id, qty, unitPrice: unitPrice || resolved.unitPrice }],
      }));
      show(msg, true, `تم إنشاء الطلب ${created.docNo || created.doc_no}.`);
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشل الإنشاء: ${err.message}`);
    }
  });

  document.getElementById('refresh').addEventListener('click', refresh);
  document.getElementById('stock-warehouse').addEventListener('change', refresh);

  document.getElementById('party-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('party-msg');
    const fd = new FormData(e.target);
    const role = String(fd.get('role') || 'customer');
    try {
      if (typeof api.createParty !== 'function') throw new Error('party management needs the desktop API');
      const created = await unwrap(api.createParty({
        displayName: String(fd.get('displayName') || '').trim(),
        roles: role === 'both' ? ['customer', 'supplier'] : [role],
        phone: String(fd.get('phone') || '').trim(),
      }));
      show(msg, true, `تم إنشاء ${created.code}.`);
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشل الإنشاء: ${err.message}`);
    }
  });

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
