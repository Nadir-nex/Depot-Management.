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
      createCustomerReturn: (deliveryId, input) => post('returns:create', { deliveryId, input }),
      postCustomerReturn: (id, input) => post('returns:post', { id, input }),
      recordPayment: (input) => post('payments:record', { input }),
      listPayments: () => post('payments:list', {}),
      listExpenseCategories: () => post('expenses:categories', {}),
      createExpense: (input) => post('expenses:create', { input }),
      listExpenses: () => post('expenses:list', {}),
      listCounts: () => post('counts:list', {}),
      getCount: (id) => post('counts:get', { id }),
      createCount: (input) => post('counts:create', { input }),
      addCountLine: (countId, input) => post('counts:line-add', { countId, input }),
      updateCountLine: (lineId, input) => post('counts:line-update', { lineId, input }),
      submitCount: (id) => post('counts:submit', { id }),
      approveCount: (id) => post('counts:approve', { id }),
      postCount: (id) => post('counts:post', { id }),
      listDrivers: () => post('drivers:list', {}),
      createDriver: (input) => post('drivers:create', { input }),
      listVehicles: () => post('vehicles:list', {}),
      createVehicle: (input) => post('vehicles:create', { input }),
      listRoutes: () => post('routes:list', {}),
      getRoute: (id) => post('routes:get', { id }),
      createRoute: (input) => post('routes:create', { input }),
      assignRoute: (id, input) => post('routes:assign', { id, input }),
      addStop: (routeId, input) => post('routes:stop-add', { routeId, input }),
      loadRoute: (id) => post('routes:load', { id }),
      dispatchRoute: (id) => post('routes:dispatch', { id }),
      completeStop: (id, input) => post('routes:stop-complete', { id, input }),
      failStop: (id, input) => post('routes:stop-fail', { id, input }),
      completeRoute: (id, to) => post('routes:complete', { id, to }),
      cancelRoute: (id, reason) => post('routes:cancel', { id, reason }),
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
    await refreshPayments();
    await refreshExpenses();
    await refreshCounts();
    await refreshRoutes();
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
      fill(document.getElementById('count-warehouse'), false);
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

  function salesExtraFor(doc) {
    if (doc.status === 'posted' && doc.docType === 'delivery_note') return { action: 'return', label: 'إرجاع الكل' };
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
            const x = salesExtraFor(d);
            const btn = (t) => `<button data-sales-action="${t.action}" data-id="${d.id}">${t.label}</button>`;
            return `<tr><td>${escapeHtml(d.docNo || d.doc_no)}</td><td>${escapeHtml(d.docType || d.doc_type)}</td><td>${escapeHtml(d.status)}</td><td>${d.grandTotal ?? d.grand_total}</td><td>${a ? btn(a) : '—'}${x ? ' ' + btn(x) : ''}</td></tr>`;
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
    } else if (action === 'return') {
      if (typeof api.createCustomerReturn !== 'function') throw new Error('returns need the desktop API');
      const delivery = await unwrap(api.getDocument(id));
      const ret = await unwrap(api.createCustomerReturn(id, {
        lines: delivery.lines.map((l) => ({ sourceLineId: l.id, qty: l.qty })),
      }));
      await unwrap(api.confirmDocument(ret.id));
      await unwrap(api.postCustomerReturn(ret.id, { reason: 'customer_request' }));
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

  async function refreshPayments() {    const body = document.getElementById('payments-body');
    if (!body || typeof api.listPayments !== 'function') return;
    try {
      const rows = await unwrap(api.listPayments({}));
      body.innerHTML = rows.length
        ? rows.slice(0, 20).map((x) => `<tr><td>${escapeHtml(x.payment_no)}</td><td>${escapeHtml(x.direction)}</td><td>${x.amount}</td><td>${escapeHtml(x.status)}</td></tr>`).join('')
        : '<tr><td colspan="4">لا توجد مدفوعات بعد.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="4">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function refreshExpenses() {
    const body = document.getElementById('expenses-body');
    if (!body) return;
    try {
      if (typeof api.listExpenses !== 'function') throw new Error('expenses need the desktop API');
      const rows = await unwrap(api.listExpenses({}));
      body.innerHTML = rows.length
        ? rows.slice(0, 20).map((x) => `<tr><td>${escapeHtml(x.expense_no)}</td><td>${escapeHtml(x.category_code || x.category_id)}</td><td>${x.amount}</td><td>${escapeHtml(x.status)}</td></tr>`).join('')
        : '<tr><td colspan="4">لا توجد مصاريف بعد.</td></tr>';
      if (typeof api.listExpenseCategories === 'function') {
        const cats = await unwrap(api.listExpenseCategories());
        const sel = document.querySelector('select[name="categoryCode"]');
        if (sel && cats.length) {
          const keep = sel.value;
          sel.innerHTML = cats.map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.code)}</option>`).join('');
          sel.value = [...sel.options].some((o) => o.value === keep) ? keep : sel.options[0].value;
        }
      }
    } catch (e) {
      body.innerHTML = `<tr><td colspan="4">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function countActionFor(status) {
    if (status === 'draft') return { action: 'submit', label: 'تقديم' };
    if (status === 'submitted') return { action: 'approve', label: 'اعتماد' };
    if (status === 'approved') return { action: 'post', label: 'ترحيل الفروقات' };
    return null;
  }

  async function refreshCounts() {
    const body = document.getElementById('counts-body');
    if (!body || typeof api.listCounts !== 'function') return;
    try {
      const rows = await unwrap(api.listCounts({}));
      body.innerHTML = rows.length
        ? rows.slice(0, 20).map((c) => {
            const a = countActionFor(c.status);
            return `<tr><td>${escapeHtml(c.count_no)} (#${c.id})</td><td>${escapeHtml(c.status)}</td><td><button data-count-lines="${c.id}">السطور</button></td><td>${a ? `<button data-count-action="${a.action}" data-id="${c.id}">${a.label}</button>` : '—'}</td></tr>`;
          }).join('')
        : '<tr><td colspan="4">لا توجد جردات بعد.</td></tr>';
    } catch (e) {
      body.innerHTML = `<tr><td colspan="4">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('expense-msg');
    const fd = new FormData(e.target);
    try {
      if (typeof api.createExpense !== 'function') throw new Error('expenses need the desktop API');
      const created = await unwrap(api.createExpense({
        categoryCode: String(fd.get('categoryCode') || 'OTHER'),
        amount: Number(String(fd.get('amount') || '').trim()),
        method: String(fd.get('method') || 'cash'),
        cashAccountCode: String(fd.get('cashAccountCode') || '').trim() || null,
        notes: String(fd.get('notes') || '').trim(),
      }));
      show(msg, true, `تم تسجيل المصروف ${created.expense_no}.`);
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشل التسجيل: ${err.message}`);
    }
  });

  let selectedRouteId = null;

  function routeActionFor(status) {
    if (status === 'planned') return [{ a: 'load', l: 'تحميل' }, { a: 'cancel', l: 'إلغاء' }];
    if (status === 'loaded') return [{ a: 'dispatch', l: 'انطلاق' }, { a: 'cancel', l: 'إلغاء' }];
    if (status === 'out_for_delivery') return [{ a: 'delivered', l: 'تم التوصيل' }, { a: 'partial', l: 'جزئي' }, { a: 'failed', l: 'فشل' }];
    return [];
  }

  async function refreshRoutes() {
    const body = document.getElementById('routes-body');
    if (!body || typeof api.listRoutes !== 'function') return;
    try {
      const rows = await unwrap(api.listRoutes({}));
      body.innerHTML = rows.length
        ? rows.slice(0, 20).map((r) => {
            const acts = routeActionFor(r.status).map((a) => `<button data-route-action="${a.a}" data-id="${r.id}">${a.l}</button>`).join(' ');
            return `<tr><td><button data-route-select="${r.id}">${escapeHtml(r.route_no)}</button></td><td>${escapeHtml(r.route_date)}</td><td>${escapeHtml(r.status)}</td><td>${r.id === selectedRouteId ? '◀' : ''}</td><td>${acts || '—'}</td></tr>`;
          }).join('')
        : '<tr><td colspan="5">لا توجد طرق بعد.</td></tr>';
      if (selectedRouteId) await showRouteDetail(selectedRouteId);
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5">تعذر التحميل: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function fillCrewSelects(route) {
    const drivers = await unwrap(api.listDrivers());
    const vehicles = await unwrap(api.listVehicles());
    const dsel = document.getElementById('assign-driver');
    const vsel = document.getElementById('assign-vehicle');
    dsel.innerHTML = '<option value="">—</option>' + drivers.filter((d) => d.is_active !== 0).map((d) => `<option value="${d.id}">${escapeHtml(d.code)}</option>`).join('');
    vsel.innerHTML = '<option value="">—</option>' + vehicles.filter((v) => v.is_active !== 0).map((v) => `<option value="${v.id}">${escapeHtml(v.code)}</option>`).join('');
    if (route.driver_id) dsel.value = route.driver_id;
    if (route.vehicle_id) vsel.value = route.vehicle_id;
  }

  async function showRouteDetail(id) {
    const panel = document.getElementById('route-detail');
    const full = await unwrap(api.getRoute(id));
    panel.style.display = 'block';
    document.getElementById('route-title').textContent = `الطريق ${full.route_no} (${full.status})`;
    await fillCrewSelects(full);
    document.getElementById('stops-body').innerHTML = full.stops.length
      ? full.stops.map((s) => {
          const act = s.status === 'pending'
            ? `<button data-stop-done="${s.id}">تم</button> <button data-stop-fail="${s.id}">فشل</button>`
            : '—';
          return `<tr><td>${s.stop_no}</td><td>${escapeHtml(s.party_name || s.party_code)}</td><td>${s.delivery_doc_id || '—'}</td><td>${escapeHtml(s.status)}</td><td>${s.collected_amount}</td><td>${act}</td></tr>`;
        }).join('')
      : '<tr><td colspan="6">لا توجد توقفات.</td></tr>';
  }

  async function routeAct(action, id) {
    if (action === 'load') await unwrap(api.loadRoute(id));
    else if (action === 'dispatch') await unwrap(api.dispatchRoute(id));
    else if (action === 'cancel') await unwrap(api.cancelRoute(id, 'cancelled from UI'));
    else await unwrap(api.completeRoute(id, action));
    refresh();
  }

  document.getElementById('routes-body').addEventListener('click', async (e) => {
    const msg = document.getElementById('route-msg');
    try {
      const sel = e.target.closest('[data-route-select]');
      if (sel) { selectedRouteId = Number(sel.dataset.routeSelect); await showRouteDetail(selectedRouteId); refresh(); return; }
      const btn = e.target.closest('[data-route-action]');
      if (!btn) return;
      await routeAct(btn.dataset.routeAction, Number(btn.dataset.id));
      show(msg, true, 'تمت العملية بنجاح.');
    } catch (err) {
      show(msg, false, `فشلت العملية: ${err.message}`);
    }
  });

  document.getElementById('stops-body').addEventListener('click', async (e) => {
    const msg = document.getElementById('route-msg');
    try {
      const done = e.target.closest('[data-stop-done]');
      const fail = e.target.closest('[data-stop-fail]');
      if (done) await unwrap(api.completeStop(Number(done.dataset.stopDone), {}));
      else if (fail) {
        const reason = prompt('سبب الفشل (customer_absent/refused/wrong_address/vehicle_issue/other):', 'customer_absent');
        if (!reason) return;
        await unwrap(api.failStop(Number(fail.dataset.stopFail), { reason }));
      } else return;
      show(msg, true, 'تمت العملية بنجاح.');
      refresh();
    } catch (err) {
      show(msg, false, `فشلت العملية: ${err.message}`);
    }
  });

  document.getElementById('crew-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('route-msg');
    const fd = new FormData(e.target);
    try {
      const driverName = String(fd.get('driverName') || '').trim();
      const vehicleCode = String(fd.get('vehicleCode') || '').trim();
      if (driverName) {
        const code = 'DRV-' + driverName.slice(0, 8).replace(/\s+/g, '').toUpperCase();
        await unwrap(api.createDriver({ code, name: driverName }));
      }
      if (vehicleCode) await unwrap(api.createVehicle({ code: vehicleCode }));
      show(msg, true, 'تمت إضافة الطاقم.');
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشل: ${err.message}`);
    }
  });

  document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('route-msg');
    const fd = new FormData(e.target);
    try {
      const created = await unwrap(api.createRoute({ routeDate: String(fd.get('routeDate') || '').trim() || undefined }));
      selectedRouteId = created.id;
      show(msg, true, `أنشئ الطريق ${created.route_no}.`);
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشل الإنشاء: ${err.message}`);
    }
  });

  document.getElementById('assign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('route-msg');
    try {
      if (!selectedRouteId) throw new Error('select a route first');
      const driverId = document.getElementById('assign-driver').value;
      const vehicleId = document.getElementById('assign-vehicle').value;
      await unwrap(api.assignRoute(selectedRouteId, {
        driverId: driverId ? Number(driverId) : null,
        vehicleId: vehicleId ? Number(vehicleId) : null,
      }));
      show(msg, true, 'تم التعيين.');
      refresh();
    } catch (err) {
      show(msg, false, `فشل التعيين: ${err.message}`);
    }
  });

  document.getElementById('stop-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('route-msg');
    const fd = new FormData(e.target);
    try {
      if (!selectedRouteId) throw new Error('select a route first');
      const docRaw = String(fd.get('deliveryDocId') || '').trim();
      await unwrap(api.addStop(selectedRouteId, {
        partyCode: String(fd.get('partyCode') || '').trim(),
        deliveryDocId: docRaw ? Number(docRaw) : null,
      }));
      show(msg, true, 'أضيف التوقف.');
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشلت الإضافة: ${err.message}`);
    }
  });

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

  document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('payment-msg');
    const fd = new FormData(e.target);
    try {
      if (typeof api.recordPayment !== 'function') throw new Error('payments need the desktop API');
      const parties = await unwrap(api.listParties({ search: String(fd.get('partyCode') || '').trim() }));
      const party = parties.find((x) => x.code === String(fd.get('partyCode') || '').trim());
      if (!party) throw new Error('party not found');
      const amount = Number(String(fd.get('amount') || '').trim());
      const targetType = String(fd.get('targetType') || '').trim();
      const targetIdRaw = String(fd.get('targetId') || '').trim();
      const input = {
        direction: String(fd.get('direction') || 'in'),
        partyId: party.id,
        method: String(fd.get('method') || 'cash'),
        cashAccountCode: String(fd.get('cashAccountCode') || '').trim() || null,
        amount,
        allocations: targetType && targetIdRaw ? [{ targetType, targetId: Number(targetIdRaw), amount }] : [],
      };
      const created = await unwrap(api.recordPayment(input));
      show(msg, true, `تم تسجيل الدفع ${created.payment_no}.`);
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشل الدفع: ${err.message}`);
    }
  });

  document.getElementById('counts-body').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-count-action]');
    const linesBtn = e.target.closest('[data-count-lines]');
    const msg = document.getElementById('count-msg');
    try {
      if (linesBtn) {
        const full = await unwrap(api.getCount(Number(linesBtn.dataset.countLines)));
        const summary = full.lines.map((l) => `${l.product_sku}: counted=${l.counted_qty} expected=${l.expected_qty} var=${l.counted_qty - (l.expected_qty || 0)}`).join(' | ') || 'no lines';
        show(msg, true, `#${full.id}: ${summary}`);
        return;
      }
      if (!act) return;
      const id = Number(act.dataset.id);
      if (act.dataset.countAction === 'submit') await unwrap(api.submitCount(id));
      else if (act.dataset.countAction === 'approve') await unwrap(api.approveCount(id));
      else await unwrap(api.postCount(id));
      show(msg, true, 'تمت العملية بنجاح.');
      refresh();
    } catch (err) {
      show(msg, false, `فشلت العملية: ${err.message}`);
    }
  });

  document.getElementById('count-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('count-msg');
    try {
      if (typeof api.createCount !== 'function') throw new Error('counts need the desktop API');
      const sel = document.getElementById('count-warehouse');
      const created = await unwrap(api.createCount({ warehouseCode: (sel && sel.value) || 'MAIN' }));
      show(msg, true, `بدأ الجرد ${created.count_no} (#${created.id}). أضف السطور برقم الجرد.`);
      refresh();
    } catch (err) {
      show(msg, false, `فشل البدء: ${err.message}`);
    }
  });

  document.getElementById('countline-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('countline-msg');
    const fd = new FormData(e.target);
    try {
      if (typeof api.addCountLine !== 'function') throw new Error('counts need the desktop API');
      const products = await unwrap(api.listProducts({ search: String(fd.get('sku') || '').trim() }));
      const product = products.find((x) => x.sku === String(fd.get('sku') || '').trim());
      if (!product) throw new Error('product not found');
      await unwrap(api.addCountLine(Number(String(fd.get('countId') || '').trim()), {
        productId: product.id,
        countedQty: Number(String(fd.get('countedQty') || '').trim()),
      }));
      const reason = String(fd.get('reasonCode') || '').trim();
      if (reason && typeof api.updateCountLine === 'function') {
        const full = await unwrap(api.getCount(Number(String(fd.get('countId') || '').trim())));
        const line = full.lines.find((l) => l.product_id === product.id);
        if (line) await unwrap(api.updateCountLine(line.id, { reasonCode: reason }));
      }
      show(msg, true, 'تمت إضافة السطر.');
      e.target.reset();
      refresh();
    } catch (err) {
      show(msg, false, `فشلت الإضافة: ${err.message}`);
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
