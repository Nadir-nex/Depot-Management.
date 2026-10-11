'use strict';
/* Depot frontend — original implementation.
 * Browser-only. Talks only via window.depotApi (desktop) or fetch /api (future web).
 * No direct data access. Hash routing keeps file:// + hosted modes working.
 */
(function () {
  var api = window.depotApi || httpFallback();
  function httpFallback() {
    function post(method, body) {
      return fetch('/api/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {})
      }).then(function (r) { return r.json(); });
    }
    return {
      _transport: 'http:/api (future hosted backend)',
      listProducts: function (o) { return post('products:create'.replace('products:create', 'products:list'), o); },
      getProduct: function (id) { return post('products:get', { id: id }); },
      createProduct: function (i) { return post('products:create', { input: i }); },
      updateProduct: function (id, f) { return post('products:update', { id: id, fields: f }); },
      setProductActive: function (id, a) { return post('products:set-active', { id: id, active: a }); },
      deleteProduct: function (id) { return post('products:delete', { id: id }); },
      listCategories: function () { return post('categories:list', {}); },
      getCategoryTree: function () { return post('categories:tree', {}); },
      createCategory: function (i) { return post('categories:create', { input: i }); },
      deleteCategory: function (id) { return post('categories:delete', { id: id }); },
      listUnits: function () { return post('units:list', {}); },
      createUnit: function (i) { return post('units:create', { input: i }); },
      listPacks: function (pid) { return post('packs:list', { productId: pid }); },
      createPack: function (pid, i) { return post('packs:create', { productId: pid, input: i }); },
      listBarcodes: function (pid) { return post('barcodes:list', { productId: pid }); },
      addBarcode: function (pid, i) { return post('barcodes:add', { productId: pid, input: i }); },
      removeBarcode: function (id) { return post('barcodes:remove', { id: id }); },
      resolveBarcode: function (c) { return post('barcodes:resolve', { code: c }); },
      listPriceLists: function () { return post('prices:lists', {}); },
      getPriceList: function (id) { return post('prices:list-get', { id: id }); },
      createPriceList: function (i) { return post('prices:list-create', { input: i }); },
      updatePriceList: function (id, f) { return post('prices:list-update', { id: id, fields: f }); },
      deletePriceList: function (id) { return post('prices:list-delete', { id: id }); },
      setPriceLine: function (lid, i) { return post('prices:line-set', { listId: lid, input: i }); },
      removePriceLine: function (lid, i) { return post('prices:line-remove', { listId: lid, input: i }); },
      resolveSalePrice: function (a) { return post('prices:resolve', { args: a }); },
      listLots: function (pid, o) { return post('lots:list', { productId: pid, opts: o }); },
      getLot: function (id) { return post('lots:get', { id: id }); },
      createLot: function (pid, i) { return post('lots:create', { productId: pid, input: i }); },
      deleteLot: function (id) { return post('lots:delete', { id: id }); },
      suggestLots: function (a) { return post('lots:suggest', { args: a }); },
      listSerials: function (pid, s) { return post('serials:list', { productId: pid, status: s }); },
      listWarehouses: function () { return post('warehouses:list', {}); },
      getWarehouse: function (id) { return post('warehouses:get', { id: id }); },
      createWarehouse: function (i) { return post('warehouses:create', { input: i }); },
      setWarehouseActive: function (id, a) { return post('warehouses:set-active', { id: id, active: a }); },
      deleteWarehouse: function (id) { return post('warehouses:delete', { id: id }); },
      listStock: function (w) { return post('stock:list', { warehouse: w }); },
      listMovements: function (o) { return post('stock:movements', o || {}); },
      getStockLedger: function (o) { return post('stock:ledger', o || {}); },
      getAvailableStock: function (pid, wid) { return post('stock:available', { productId: pid, warehouseId: wid }); },
      reverseStockMovement: function (id, reason) { return post('stock:reverse', { id: id, reason: reason }); },
      receiveStock: function (p) { return post('stock:receive', { payload: p }); },
      cancelReceipt: function (id, reason) { return post('stock:cancel-receipt', { id: id, reason: reason }); },
      getReceipt: function (id) { return post('receipts:get', { id: id }); },
      issueStock: function (a) { return post('stock:issue', { args: a }); },
      adjustStock: function (a) { return post('stock:adjust', { args: a }); },
      transferStock: function (a) { return post('stock:transfer', { args: a }); },
      listReceipts: function (o) { return post('receipts:list', o || {}); },
      listParties: function (o) { return post('parties:list', o || {}); },
      createParty: function (i) { return post('parties:create', { input: i }); },
      listDocuments: function (o) { return post('documents:list', o || {}); },
      getDocument: function (id) { return post('documents:get', { id: id }); },
      createDocument: function (i) { return post('documents:create', { input: i }); },
      updateDocument: function (id, f) { return post('documents:update', { id: id, fields: f }); },
      addDocumentLine: function (docId, line) { return post('documents:line-add', { docId: docId, line: line }); },
      updateDocumentLine: function (lineId, f) { return post('documents:line-update', { lineId: lineId, fields: f }); },
      removeDocumentLine: function (lineId) { return post('documents:line-remove', { lineId: lineId }); },
      confirmDocument: function (id) { return post('documents:confirm', { id: id }); },
      postDocument: function (id) { return post('documents:post', { id: id }); },
      cancelDocument: function (id, reason) { return post('documents:cancel', { id: id, reason: reason }); },
      convertDocument: function (sid, tt, o) { return post('sales:convert', { sourceId: sid, targetType: tt, opts: o }); },
      convertDeliveriesToInvoice: function (ids, o) { return post('sales:convert-deliveries', { ids: ids, opts: o }); },
      postDeliveryNote: function (id, o) { return post('sales:post-delivery', { id: id, opts: o }); },
      postInvoice: function (id) { return post('sales:post-invoice', { id: id }); },
      listPayments: function (o) { return post('payments:list', o || {}); },
      getPayment: function (id) { return post('payments:get', { id: id }); },
      recordPayment: function (i) { return post('payments:record', { input: i }); },
      reversePayment: function (id, reason) { return post('payments:reverse', { id: id, reason: reason }); },
      partyBalance: function (pid) { return post('parties:balance', { partyId: pid }); },
      createCustomerReturn: function (did, i) { return post('returns:create', { deliveryId: did, input: i }); },
      postCustomerReturn: function (id, i) { return post('returns:post', { id: id, input: i }); },
      returnToSupplier: function (i) { return post('returns:to-supplier', { input: i }); },
      listCashAccounts: function () { return post('cash:accounts', {}); },
      createCashAccount: function (i) { return post('cash:account-create', { input: i }); },
      recentAudit: function (o) { return post('audit:recent', o || {}); },
      openCashSession: function (aid, i) { return post('cash:session-open', { accountId: aid, input: i }); },
      closeCashSession: function (id, i) { return post('cash:session-close', { id: id, input: i }); },
      sessionReport: function (id) { return post('cash:session-report', { id: id }); },
      listExpenseCategories: function () { return post('expenses:categories', {}); },
      createExpenseCategory: function (i) { return post('expenses:category-create', { input: i }); },
      deleteExpenseCategory: function (id) { return post('expenses:category-delete', { id: id }); },
      getExpense: function (id) { return post('expenses:get', { id: id }); },
      reverseExpense: function (id, reason) { return post('expenses:reverse', { id: id, reason: reason }); },
      expenseReport: function (o) { return post('expenses:report', o || {}); },
      openFiscalYear: function (i) { return post('fiscal:open', { input: i }); },
      closeFiscalYear: function (id) { return post('fiscal:close', { id: id }); },
      listFiscalYears: function (o) { return post('fiscal:list', o || {}); },
      listAccountingEvents: function (fyid, o) { return post('fiscal:events', { fiscalYearId: fyid, opts: o }); },
      getAccountingEvent: function (id) { return post('fiscal:event-get', { id: id }); },
      getJournalLines: function (eid) { return post('fiscal:event-lines', { accountingEventId: eid }); },
      listExpenses: function (o) { return post('expenses:list', o || {}); },
      createExpense: function (i) { return post('expenses:create', { input: i }); },
      listCounts: function (o) { return post('counts:list', o || {}); },
      getCount: function (id) { return post('counts:get', { id: id }); },
      createCount: function (i) { return post('counts:create', { input: i }); },
      addCountLine: function (cid, i) { return post('counts:line-add', { countId: cid, input: i }); },
      updateCountLine: function (lid, i) { return post('counts:line-update', { lineId: lid, input: i }); },
      removeCountLine: function (lid) { return post('counts:line-remove', { lineId: lid }); },
      submitCount: function (id) { return post('counts:submit', { id: id }); },
      approveCount: function (id) { return post('counts:approve', { id: id }); },
      postCount: function (id) { return post('counts:post', { id: id }); },
      cancelCount: function (id, reason) { return post('counts:cancel', { id: id, reason: reason }); },
      listRoutes: function (o) { return post('routes:list', o || {}); },
      getRoute: function (id) { return post('routes:get', { id: id }); },
      createRoute: function (i) { return post('routes:create', { input: i }); },
      assignRoute: function (id, i) { return post('routes:assign', { id: id, input: i }); },
      addStop: function (rid, i) { return post('routes:stop-add', { routeId: rid, input: i }); },
      removeStop: function (id) { return post('routes:stop-remove', { id: id }); },
      loadRoute: function (id) { return post('routes:load', { id: id }); },
      dispatchRoute: function (id) { return post('routes:dispatch', { id: id }); },
      completeStop: function (id, i) { return post('routes:stop-complete', { id: id, input: i }); },
      failStop: function (id, i) { return post('routes:stop-fail', { id: id, input: i }); },
      completeRoute: function (id, to) { return post('routes:complete', { id: id, to: to }); },
      cancelRoute: function (id, reason) { return post('routes:cancel', { id: id, reason: reason }); },
      listDrivers: function () { return post('drivers:list', {}); },
      createDriver: function (i) { return post('drivers:create', { input: i }); },
      setDriverActive: function (id, a) { return post('drivers:set-active', { id: id, active: a }); },
      listVehicles: function () { return post('vehicles:list', {}); },
      createVehicle: function (i) { return post('vehicles:create', { input: i }); },
      setVehicleActive: function (id, a) { return post('vehicles:set-active', { id: id, active: a }); },
      reserveStock: function (rid, i) { return post('loading:reserve', { routeId: rid, input: i }); },
      releaseReservations: function (rid) { return post('loading:release', { routeId: rid }); },
      listReservations: function (rid) { return post('loading:list', { routeId: rid }); },
      availableStock: function (a) { return post('loading:available', { args: a }); },
      settleStop: function (sid, i) { return post('settlements:settle', { stopId: sid, input: i }); },
      getStopSettlement: function (sid) { return post('settlements:get', { stopId: sid }); },
      routeReconciliation: function (rid) { return post('settlements:reconciliation', { routeId: rid }); },
      getSalesByDate: function (o) { return post('reports:sales-by-date', o || {}); },
      getSalesByCustomer: function (o) { return post('reports:sales-by-customer', o || {}); },
      getSalesByProduct: function (o) { return post('reports:sales-by-product', o || {}); },
      getSalesBySalesperson: function (o) { return post('reports:sales-by-salesperson', o || {}); },
      getSalesByRoute: function (o) { return post('reports:sales-by-route', o || {}); },
      getSalesByDocumentType: function (o) { return post('reports:sales-by-doctype', o || {}); },
      getSalesMargin: function (o) { return post('reports:sales-margin', o || {}); },
      getCustomerBalances: function (o) { return post('reports:customer-balances', o || {}); },
      getOverdueAmounts: function (o) { return post('reports:overdue', o || {}); },
      getPaymentHistory: function (o) { return post('reports:payment-history', o || {}); },
      getAgingReport: function (o) { return post('reports:aging', o || {}); },
      getCurrentStock: function (o) { return post('reports:current-stock', o || {}); },
      getStockValuation: function (o) { return post('reports:stock-valuation', o || {}); },
      getMovementHistory: function (o) { return post('reports:movement-history', o || {}); },
      getLowStockProducts: function (o) { return post('reports:low-stock', o || {}); },
      getLotExpiryReport: function (o) { return post('reports:lot-expiry', o || {}); },
      getWarehouseComparison: function (o) { return post('reports:warehouse-comparison', o || {}); },
      getPurchasesBySupplier: function (o) { return post('reports:purchases-by-supplier', o || {}); },
      getPurchasesByProduct: function (o) { return post('reports:purchases-by-product', o || {}); },
      getPurchasesByDate: function (o) { return post('reports:purchases-by-date', o || {}); },
      getReceivedVsOrdered: function (o) { return post('reports:received-vs-ordered', o || {}); },
      getSupplierBalances: function (o) { return post('reports:supplier-balances', o || {}); },
      getRouteCompletion: function (o) { return post('reports:route-completion', o || {}); },
      getFailedDeliveries: function (o) { return post('reports:failed-deliveries', o || {}); },
      getQuantityDelivered: function (o) { return post('reports:quantity-delivered', o || {}); },
      getCustomerCollections: function (o) { return post('reports:customer-collections', o || {}); },
      getDriverVehiclePerformance: function (o) { return post('reports:driver-vehicle', o || {}); },
      getSessionSummary: function (o) { return post('reports:session-summary', o || {}); },
      getCashReceipts: function (o) { return post('reports:cash-receipts', o || {}); },
      getCashPayments: function (o) { return post('reports:cash-payments', o || {}); },
      getExpensesReport: function (o) { return post('reports:expenses', o || {}); },
      getAdjustmentsReport: function (o) { return post('reports:adjustments', o || {}); },
      getDiscrepanciesReport: function (o) { return post('reports:discrepancies', o || {}); },
      getDailyCashPosition: function (o) { return post('reports:daily-cash-position', o || {}); },
    };
  }

  /* i18n dictionaries live in i18n.js (window.I18N); app.js only calls t(). */
  var lang = 'ar';
  function t(k, params) { return window.I18N.t(lang, k, params); }
  function isRTL() { return window.I18N.dir(lang) === 'rtl'; }

  var state = { route: 'dashboard', warehouse: 'MAIN', salesType: 'all', partyRole: 'all', q: '', cashTab: 'payments', catTab: 'products', prodStatus: 'all', catFilter: '', priceListId: null, detailId: null, lotSku: '', bcSku: '', packSku: '', stockCat: '', stockLow: false, stockQ: '', ledgerSku: '', movLimit: 100, routeTab: 'routes', routeDetailId: null, repKey: 'getCurrentStock', repRows: null, repAt: null, balCode: '' };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) {
    if (n == null || n === '') return '—';
    var v = Number(n);
    if (!isFinite(v)) return esc(n);
    return window.I18N.fmtNum(lang, v);
  }
  function fmtDate(iso) { return window.I18N.fmtDate(lang, iso); }
  function errMsg(e) {
    var m = window.I18N.err(lang, e);
    window.I18N.debug(e);
    return m;
  }
  function unwrap(p) {
    return p.then(function (res) {
      if (!res || res.ok !== true) throw new Error((res && (res.message || res.code)) || 'request failed');
      return res.data;
    });
  }
  function toast(msg, kind) {
    var root = document.getElementById('toast-root');
    var d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.textContent = msg;
    root.appendChild(d);
    setTimeout(function () { d.remove(); }, 3600);
  }
  function badge(status) {
    var s = String(status || '');
    var cls = 'b-draft';
    if (/post|pay|deliver|active|received|loaded|complete/i.test(s)) cls = 'b-posted';
    else if (/confirm/i.test(s)) cls = 'b-confirmed';
    else if (/cancel|fail|inactive/i.test(s)) cls = 'b-cancelled';
    else if (/pending|plan|draft|submitted|approved|dispatch|out_for/i.test(s)) cls = 'b-pending';
    else if (/order|purchase/i.test(s)) cls = 'b-order';
    else if (/invoice/i.test(s)) cls = 'b-invoice';
    return '<span class="badge ' + cls + '">' + esc(window.I18N.status(lang, s)) + '</span>';
  }
  function loadingHtml() { return '<div class="state loading">' + esc(t('loading')) + '</div>'; }
  function emptyHtml(n) { return '<div class="state empty">' + esc(t('empty')) + (n ? ' (' + n + ')' : '') + '</div>'; }

  function openModal(o) {
    var root = document.getElementById('dialog-root');
    root.innerHTML = '';
    var back = document.createElement('div');
    back.className = 'dialog-backdrop';
    var dlg = document.createElement('div');
    dlg.className = 'dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.innerHTML = '<h2>' + esc(o.title) + '</h2>' +
      (o.sub ? '<div class="dlg-sub">' + esc(o.sub) + '</div>' : '') +
      '<form class="f"><div class="f-grid">' + o.body + '</div>' +
      '<div class="msg" data-msg style="min-height:18px;font-size:12.5px"></div>' +
      '<div class="dlg-actions"><button type="button" class="btn secondary" data-close>' + esc(t('cancel')) + '</button>' +
      '<button type="submit" class="btn">' + esc(o.okLabel || t('save')) + '</button></div></form>';
    back.appendChild(dlg);
    root.appendChild(back);
    var form = dlg.querySelector('form');
    var msg = dlg.querySelector('[data-msg]');
    msg.setAttribute('role', 'alert');
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      root.innerHTML = '';
    }
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    dlg.querySelector('[data-close]').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.getAttribute('data-busy') === '1') return;
      form.setAttribute('data-busy', '1');
      var btn = dlg.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      msg.textContent = '';
      var fd = new FormData(form);
      Promise.resolve().then(function () { return o.onOk(fd, close, msg); }).then(function () {
        form.setAttribute('data-busy', '');
        if (btn) btn.disabled = false;
      }).catch(function (err) {
        form.setAttribute('data-busy', '');
        if (btn) btn.disabled = false;
        msg.textContent = errMsg(err);
        msg.style.color = '#b91c1c';
      });
    });
    var first = dlg.querySelector('input,select');
    if (first) first.focus();
    return { close: close, form: form };
  }
  function confirmDialog(title, text, okLabel) {
    return new Promise(function (resolve) {
      var root = document.getElementById('dialog-root');
      root.innerHTML = '';
      var back = document.createElement('div');
      back.className = 'dialog-backdrop';
      var dlg = document.createElement('div');
      dlg.className = 'dialog';
      dlg.setAttribute('role', 'alertdialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.innerHTML = '<h2>' + esc(title) + '</h2><div class="dlg-sub">' + esc(text) + '</div>' +
        '<div class="dlg-actions"><button class="btn secondary" data-no>' + esc(t('cancel')) + '</button>' +
        '<button class="btn danger" data-yes>' + esc(okLabel || t('del')) + '</button></div>';
      back.appendChild(dlg);
      root.appendChild(back);
      function onKey(e) { if (e.key === 'Escape') done(false); }
      function done(v) { document.removeEventListener('keydown', onKey); root.innerHTML = ''; resolve(v); }
      dlg.querySelector('[data-no]').addEventListener('click', function () { done(false); });
      dlg.querySelector('[data-yes]').addEventListener('click', function () { done(true); });
      back.addEventListener('mousedown', function (e) { if (e.target === back) done(false); });
      document.addEventListener('keydown', onKey);
      dlg.querySelector('[data-yes]').focus();
    });
  }
  var FIELD_LABELS = {
    qty: 'qty', cost: 'thCost', price: 'price', unitPrice: 'price', unitCost: 'thCost',
    docDiscount: 'fDiscount', discountAmount: 'fDiscount', minStock: 'fMinStock',
    qtyPerPack: 'fQtyPack', countedQty: 'fCounted', countId: 'thId', targetId: 'fTarget',
    allocAmount: 'allocation', amount: 'fAmount', deliveryId: 'fDoc', sourceLineId: 'fDoc',
    receiptId: 'fDoc', opening: 'fOpening', 'session id': 'fSession', counted: 'fCounted',
    routeId: 'thId', driverId: 'thId', vehicleId: 'thId', supplierId: 'thId',
    collectedAmount: 'fCollected', limit: 'fLimit'
  };
  function parseIntField(v, label) {
    var key = FIELD_LABELS[label] || 'fCode';
    var s = String(v == null ? '' : v).trim();
    if (s === '') throw window.I18N.ex('errRequired', { field: t(key) });
    if (!/^-?\d+$/.test(s)) throw window.I18N.ex('errInteger', { field: t(key) });
    return Number(s);
  }
  function warehouseIdOf(code, list) {
    var f = (list || []).filter(function (w) { return String(w.code) === String(code); });
    return f.length ? f[0].id : null;
  }

  /* ---------- nav ---------- */
  var NAV = [
    { group: 'grpMain', items: [{ id: 'dashboard', icon: '📊' }] },
    {
      group: 'grpTrade', items: [
        { id: 'sales', icon: '🧾' }, { id: 'purchases', icon: '📥' }
      ]
    },
    {
      group: 'grpStock', items: [
        { id: 'articles', icon: '📦' }, { id: 'stock', icon: '🏬' }, { id: 'counts', icon: '📋' }
      ]
    },
    { group: 'grpMoney', items: [{ id: 'parties', icon: '👥' }, { id: 'cash', icon: '💰' }] },
    { group: 'grpOps', items: [{ id: 'routes', icon: '🚚' }, { id: 'reports', icon: '📈' }, { id: 'settings', icon: '⚙️' }] }
  ];
  function renderNav() {
    var nav = document.getElementById('nav');
    var html = '';
    NAV.forEach(function (g) {
      html += '<div class="nav-group">' + esc(t(g.group)) + '</div>';
      g.items.forEach(function (it) {
        var active = state.route === it.id ? ' active' : '';
        html += '<a class="nav-link' + active + '" href="#/' + it.id + '" data-route="' + it.id + '">' +
          '<span class="ico">' + it.icon + '</span><span>' + esc(t(it.id)) + '</span></a>';
      });
    });
    nav.innerHTML = html;
    document.getElementById('brand-name').textContent = t('appName');
    document.getElementById('global-search').placeholder = t('searchPh');
    document.getElementById('global-search').setAttribute('aria-label', t('searchLabel') + ': ' + t('articles'));
    document.getElementById('route-title').textContent = t(state.route === 'notfound' ? 'notFound' : state.route);
    var sel = document.getElementById('lang-sel');
    if (sel) {
      sel.innerHTML = '<option value="ar">العربية</option><option value="fr">Français</option>';
      sel.value = lang;
      sel.setAttribute('aria-label', 'Langue / اللغة');
    }
    var tr = document.getElementById('transport');
    if (tr) tr.textContent = window.depotApi ? (TRANSPORT[lang] || TRANSPORT.ar) : ((api && api._transport) || 'http');
  }

  var TITLES = { ar: 'Depot — إدارة المستودع', fr: 'Depot — Gestion de stock' };
  function setLang(next) {
    if (window.I18N.SUPPORTED.indexOf(next) === -1) next = 'ar';
    lang = next;
    document.documentElement.lang = lang;
    document.documentElement.dir = window.I18N.dir(lang);
    document.title = TITLES[lang] || TITLES.ar;
    document.getElementById('dialog-root').innerHTML = '';
    var sel = document.getElementById('lang-sel');
    if (sel) sel.value = lang;
    renderNav();
    render();
  }

  /* ---------- shared data ---------- */
  function getWarehouses() {
    if (typeof api.listWarehouses !== 'function') return Promise.resolve([{ code: 'MAIN' }]);
    return unwrap(api.listWarehouses()).catch(function () { return [{ code: 'MAIN' }]; });
  }
  function getCategories() {
    if (typeof api.listCategories !== 'function') return Promise.resolve([]);
    return unwrap(api.listCategories()).catch(function () { return []; });
  }
  function findProductBySku(sku) {
    return unwrap(api.listProducts({ search: sku, limit: 50 })).then(function (rows) {
      var list = rows.rows || rows;
      var f = list.filter(function (x) { return x.sku === sku; });
      if (f.length) return f[0];
      throw window.I18N.ex('errProductNotFound', { sku: sku });
    });
  }
  function findPartyByCode(code) {
    return unwrap(api.listParties({ search: code })).then(function (rows) {
      var list = rows.rows || rows;
      var f = list.filter(function (x) { return x.code === code; });
      if (f.length) return f[0];
      // fallback: match display code contains
      var g = list.filter(function (x) { return String(x.code).toLowerCase().indexOf(String(code).toLowerCase()) !== -1; });
      if (g.length === 1) return g[0];
      throw window.I18N.ex('errPartyNotFound', { code: code });
    });
  }

  /* ---------- pages ---------- */
  var view = null;

  function pageHead(title, sub, actionsHtml) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      '<div class="spacer"></div>' + (actionsHtml || '') + '</div>';
  }

  function renderDashboard() {
    view.innerHTML = pageHead(t('dashboard'), t('subtitleDash'), '<button class="btn secondary small" data-act="refresh">' + esc(t('refresh')) + '</button>') + '<div id="dash">' + loadingHtml() + '</div>';
    var box = document.getElementById('dash');
    var jobs = {
      stock: (typeof api.listStock === 'function' ? unwrap(api.listStock(state.warehouse)).catch(function (e) { return { rows: [], _err: e }; }) : Promise.resolve({ rows: [] })),
      docs: (typeof api.listDocuments === 'function' ? unwrap(api.listDocuments({})).catch(function () { return []; }) : Promise.resolve([])),
      pays: (typeof api.listPayments === 'function' ? unwrap(api.listPayments({})).catch(function () { return []; }) : Promise.resolve([])),
      counts: (typeof api.listCounts === 'function' ? unwrap(api.listCounts({})).catch(function () { return []; }) : Promise.resolve([])),
      routes: (typeof api.listRoutes === 'function' ? unwrap(api.listRoutes({})).catch(function () { return []; }) : Promise.resolve([])),
      parties: (typeof api.listParties === 'function' ? unwrap(api.listParties({})).catch(function () { return []; }) : Promise.resolve([])),
      cash: (typeof api.listCashAccounts === 'function' ? unwrap(api.listCashAccounts()).catch(function () { return []; }) : Promise.resolve([]))
    };
    Promise.all([jobs.stock, jobs.docs, jobs.pays, jobs.counts, jobs.routes, jobs.parties, jobs.cash]).then(function (all) {
      var stockRows = (all[0] && all[0].rows) || all[0] || [];
      var docs = all[1] || [];
      var pays = all[2] || [];
      var counts = all[3] || [];
      var routes = all[4] || [];
      var parties = (all[5] && all[5].rows) || all[5] || [];
      var cash = all[6] || [];
      var low = stockRows.filter(function (r) { return Number(r.stock) <= 5; });
      var activeRoutes = routes.filter(function (r) { return ['planned', 'loaded', 'out_for_delivery'].indexOf(r.status) !== -1; });
      var salesDocs = docs.filter(function (d) { return String(d.docType || d.doc_type || '').indexOf('sales') === 0 || ['delivery_note', 'sales_invoice', 'sales_order'].indexOf(d.docType || d.doc_type) !== -1; });
      var html = '<div class="kpi-grid">' +
        kpi('📦', t('kpiStock'), fmt(stockRows.length), state.warehouse) +
        kpi('⚠️', t('kpiLow'), fmt(low.length), low.length ? low.slice(0, 3).map(function (r) { return esc(r.sku); }).join(', ') : '—') +
        kpi('🧾', t('kpiDocs'), fmt(salesDocs.length), fmt(docs.length) + ' ' + t('total')) +
        kpi('🚚', t('kpiRoutes'), fmt(activeRoutes.length), fmt(routes.length) + ' ' + t('total')) +
        '</div><div class="grid-2">' +
        '<div class="card"><h2>' + esc(t('lowStock')) + '</h2>' + miniStock(low.slice(0, 8)) + '<div style="margin-top:8px"><a class="btn ghost small" href="#/stock">' + esc(t('viewAll')) + '</a></div></div>' +
        '<div class="card"><h2>' + esc(t('recentSales')) + '</h2>' + miniDocs(salesDocs.slice(0, 8)) + '<div style="margin-top:8px"><a class="btn ghost small" href="#/sales">' + esc(t('viewAll')) + '</a></div></div>' +
        '</div><div class="grid-2">' +
        '<div class="card"><h2>' + esc(t('recentPay')) + '</h2>' + miniPays(pays.slice(0, 8)) + '</div>' +
        '<div class="card"><h2>' + esc(t('kpiCash')) + ' / ' + esc(t('kpiParties')) + '</h2>' +
        '<div class="hint">' + esc(fmt(cash.length)) + ' · ' + esc(t('kpiCash')) + ' — ' + esc(fmt(parties.length)) + ' · ' + esc(t('kpiParties')) + '</div>' +
        '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('name')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' +
        (parties.slice(0, 8).map(function (p) {
          return '<tr><td class="mono">' + esc(p.code) + '</td><td>' + esc(p.display_name || p.displayName || '') + '</td><td>' + esc((p.roles || []).map(function (r) { return window.I18N.partyRole(lang, r); }).join(', ')) + '</td></tr>';
        }).join('') || '<tr><td colspan="3">' + esc(t('empty')) + '</td></tr>') +
        '</tbody></table></div></div></div>';
      if (all[0] && all[0]._err) html = '<div class="alert err">' + esc(errMsg(all[0]._err)) + '</div>' + html;
      box.innerHTML = html;
      var rb = box.querySelector('[data-act="refresh"]');
      void rb;
    }).catch(function (e) {
      box.innerHTML = '<div class="alert err">' + esc(t('errLoad') + ': ' + errMsg(e)) + '</div>';
    });
    function kpi(ico, label, value, sub) {
      return '<div class="kpi"><div class="k-ico">' + ico + '</div><div><div class="k-label">' + esc(label) + '</div><div class="k-value num">' + esc(value) + '</div><div class="k-sub">' + esc(sub || '') + '</div></div></div>';
    }
    function miniStock(rows) {
      if (!rows.length) return emptyHtml();
      return '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>' + esc(t('name')) + '</th><th>' + esc(t('qty')) + '</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><td class="mono">' + esc(r.sku) + '</td><td>' + esc(r.name) + '</td><td class="num">' + esc(r.stock) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    function miniDocs(rows) {
      if (!rows.length) return emptyHtml();
      return '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('total')) + '</th></tr></thead><tbody>' +
        rows.map(function (d) {
          return '<tr><td class="mono">' + esc(d.docNo || d.doc_no) + '</td><td>' + badge(d.status) + '</td><td class="num">' + fmt(d.grandTotal != null ? d.grandTotal : d.grand_total) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function miniPays(rows) {
      if (!rows.length) return emptyHtml();
      return '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('total')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' +
        rows.map(function (x) { return '<tr><td class="mono">' + esc(x.payment_no) + '</td><td class="num">' + fmt(x.amount) + '</td><td>' + badge(x.status) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    view.querySelector('[data-act="refresh"]').addEventListener('click', renderDashboard);
  }

  function renderArticles() {
    var tabs = [['products', 'catProducts'], ['categories', 'catCategories'], ['units', 'catUnits'], ['prices', 'catPrices'], ['barcodes', 'catBarcodes'], ['lots', 'catLots']];
    view.innerHTML = pageHead(t('articles'), t('sku') + ' · ' + t('manualEntry'), '<button class="btn small" data-act="new">' + esc(t('newProduct')) + '</button>') +
      '<div class="card"><div class="toolbar"><div class="tabs">' + tabs.map(function (x) { return '<button class="tab' + (state.catTab === x[0] ? ' active' : '') + '" data-ctab="' + x[0] + '">' + esc(t(x[1])) + '</button>'; }).join('') + '</div></div><div id="cbody">' + loadingHtml() + '</div></div>' +
      '<div id="pdetail"></div>';
    view.querySelectorAll('[data-ctab]').forEach(function (b) {
      b.addEventListener('click', function () { state.catTab = b.getAttribute('data-ctab'); state.detailId = null; renderArticles(); });
    });
    view.querySelector('[data-act="new"]').addEventListener('click', openCreateProduct);
    if (state.catTab === 'products') catProductsTab();
    else if (state.catTab === 'categories') catCategoriesTab();
    else if (state.catTab === 'units') catUnitsTab();
    else if (state.catTab === 'prices') catPricesTab();
    else if (state.catTab === 'barcodes') catBarcodesTab();
    else catLotsTab();
  }
  function catNameOf(id, cats) {
    var f = (cats || []).filter(function (c) { return String(c.id) === String(id); });
    return f.length ? f[0].name : '—';
  }
  function isActiveRow(p) { return p.is_active !== 0 && p.isActive !== false && p.is_active !== false; }
  function catProductsTab() {
    var box = document.getElementById('cbody');
    box.innerHTML = '<div class="toolbar"><input type="search" id="q" placeholder="' + esc(t('searchPh')) + '" value="' + esc(state.q) + '" />' +
      '<div class="tabs"><button class="tab' + (state.prodStatus === 'all' ? ' active' : '') + '" data-st="all">' + esc(t('all')) + '</button>' +
      '<button class="tab' + (state.prodStatus === 'active' ? ' active' : '') + '" data-st="active">' + esc(t('active')) + '</button>' +
      '<button class="tab' + (state.prodStatus === 'inactive' ? ' active' : '') + '" data-st="inactive">' + esc(t('inactive')) + '</button></div>' +
      '<select id="catf"><option value="">' + esc(t('catCategories')) + ': ' + esc(t('all')) + '</option></select></div>' +
      '<div class="hint">' + esc(t('hListFilters')) + '</div><div id="tbl" style="margin-top:8px">' + loadingHtml() + '</div>';
    var catsCache = [];
    getCategories().then(function (cats) {
      catsCache = cats;
      var sel = document.getElementById('catf');
      if (sel) {
        sel.innerHTML = '<option value="">' + esc(t('catCategories')) + ': ' + esc(t('all')) + '</option>' + cats.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
        sel.value = state.catFilter || '';
      }
    });
    box.querySelectorAll('[data-st]').forEach(function (b) {
      b.addEventListener('click', function () { state.prodStatus = b.getAttribute('data-st'); catProductsTab(); });
    });
    var deb = null;
    document.getElementById('q').addEventListener('input', function (e) {
      clearTimeout(deb);
      deb = setTimeout(function () { state.q = e.target.value.trim(); load(); }, 250);
    });
    document.getElementById('catf').addEventListener('change', function (e) { state.catFilter = e.target.value; load(); });
    function load() {
      var tbl = document.getElementById('tbl');
      if (!tbl) return;
      tbl.innerHTML = loadingHtml();
      var opts = { search: state.q, limit: 200 };
      if (state.prodStatus === 'active') opts.activeOnly = true;
      unwrap(api.listProducts(opts)).then(function (res) {
        var rows = res.rows || res;
        if (state.prodStatus === 'inactive') rows = rows.filter(function (p) { return !isActiveRow(p); });
        if (state.catFilter) rows = rows.filter(function (p) { return String(p.categoryId != null ? p.categoryId : (p.category_id != null ? p.category_id : '')) === String(state.catFilter); });
        if (!rows.length) { tbl.innerHTML = emptyHtml(); return; }
        tbl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>' + esc(t('name')) + '</th><th>' + esc(t('fCategory')) + '</th><th>' + esc(t('fType')) + '</th><th>' + esc(t('thCost')) + '</th><th>' + esc(t('price')) + '</th><th>' + esc(t('thMin')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('actions')) + '</th></tr></thead><tbody>' +
          rows.slice(0, 100).map(function (p) {
            var active = isActiveRow(p);
            var catId = p.categoryId != null ? p.categoryId : p.category_id;
            return '<tr><td class="mono">' + esc(p.sku) + '</td><td>' + esc(p.name) + '<div class="hint mono">' + esc(p.barcode || p.preferred_barcode || '') + '</div></td>' +
              '<td>' + esc(catNameOf(catId, catsCache)) + '</td><td class="mono">' + esc(p.productType || p.product_type || '') + '</td>' +
              '<td class="num">' + fmt(p.defaultUnitCost != null ? p.defaultUnitCost : p.default_unit_cost) + '</td>' +
              '<td class="num">' + fmt(p.defaultSalePrice != null ? p.defaultSalePrice : p.default_sale_price) + '</td>' +
              '<td class="num">' + fmt(p.minStock != null ? p.minStock : p.min_stock) + '</td>' +
              '<td>' + badge(active ? 'active' : 'inactive') + '</td>' +
              '<td><div class="row-actions"><button class="btn ghost small" data-pdetail="' + p.id + '">' + esc(t('detail')) + '</button>' +
              '<button class="btn ghost small" data-pedit="' + p.id + '">' + esc(t('edit')) + '</button>' +
              '<button class="btn ghost small" data-ptoggle="' + p.id + '" data-active="' + (active ? 1 : 0) + '" title="' + esc(active ? t('inactive') : t('active')) + '" aria-label="' + esc(active ? t('inactive') : t('active')) + '">' + (active ? '✖' : '✔') + '</button>' +
              '<button class="btn ghost small" data-pdel="' + p.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">🗑</button></div></td></tr>';
          }).join('') + '</tbody></table></div><div class="hint">' + rows.length + ' / 100 · SKU ' + esc(t('skuImmutable')) + '</div>';
      }).catch(function (e) { tbl.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    box.addEventListener('click', function (e) {
      var d = e.target.closest('[data-pdetail]');
      if (d) { showProductDetail(Number(d.getAttribute('data-pdetail'))); return; }
      var ed = e.target.closest('[data-pedit]');
      if (ed) { openEditProduct(Number(ed.getAttribute('data-pedit')), load); return; }
      var tg = e.target.closest('[data-ptoggle]');
      if (tg) {
        var id = Number(tg.getAttribute('data-ptoggle'));
        var active = tg.getAttribute('data-active') === '1';
        unwrap(api.setProductActive(id, !active)).then(function () { toast('✓', 'ok'); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
        return;
      }
      var del = e.target.closest('[data-pdel]');
      if (del) {
        var did = Number(del.getAttribute('data-pdel'));
        confirmDialog(t('del'), t('del') + ' #' + did + '? ' + t('hDelBlocked'), t('del')).then(function (ok) {
          if (!ok) return;
          unwrap(api.deleteProduct(did)).then(function () { toast('✓', 'ok'); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
        });
      }
    });
    load();
  }
  function productFormBody(cats, p) {
    var v = function (k) { return p ? esc(p[k] == null ? '' : p[k]) : ''; };
    var catId = p ? (p.categoryId != null ? p.categoryId : p.category_id) : '';
    var type = p ? (p.productType || p.product_type || 'goods') : 'goods';
    var tax = p ? (p.taxClass || p.tax_class || 'standard') : 'standard';
    var html = '';
    if (!p) html += fld('SKU*', '<input name="sku" required maxlength="64" pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}" title="SKU" />');
    else html += '<div class="hint">SKU <span class="mono">' + esc(p.sku) + '</span> · ' + esc(t('skuImmutable')) + '</div>';
    html += fld(t('name') + '*', '<input name="name" required maxlength="200" value="' + v('name') + '" />');
    html += fld(t('fCategory'), '<select name="categoryId"><option value="">—</option>' + cats.map(function (c) { return '<option value="' + c.id + '"' + (String(catId) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>');
    html += fld(t('fType'), '<select name="productType"><option value="goods"' + (type === 'goods' ? ' selected' : '') + '>' + esc(window.I18N.productType(lang, 'goods')) + '</option><option value="service"' + (type === 'service' ? ' selected' : '') + '>' + esc(window.I18N.productType(lang, 'service')) + '</option></select>');
    html += fld(t('fBarcode') + ' (' + esc(t('manualEntry')) + ')', '<input name="barcode" maxlength="64" value="' + esc(p && (p.barcode || p.preferred_barcode) ? (p.barcode || p.preferred_barcode) : '') + '" />');
    html += fld(t('fCost'), '<input name="defaultUnitCost" value="' + (p ? esc(p.defaultUnitCost != null ? p.defaultUnitCost : p.default_unit_cost) : '0') + '" inputmode="numeric" />');
    html += fld(t('price') + '*', '<input name="defaultSalePrice" value="' + (p ? esc(p.defaultSalePrice != null ? p.defaultSalePrice : p.default_sale_price) : '0') + '" inputmode="numeric" />');
    html += fld(t('fTax'), '<select name="taxClass"><option value="standard"' + (tax === 'standard' ? ' selected' : '') + '>' + esc(window.I18N.taxClass(lang, 'standard')) + '</option><option value="exempt"' + (tax === 'exempt' ? ' selected' : '') + '>' + esc(window.I18N.taxClass(lang, 'exempt')) + '</option></select>');
    html += fld(t('fMinStock'), '<input name="minStock" value="' + (p ? esc(p.minStock != null ? p.minStock : p.min_stock) : '0') + '" inputmode="numeric" />');
    html += fld(t('fAllowNeg'), '<select name="allowNegativeStock"><option value="">' + esc(t('no')) + '</option><option value="1"' + (p && (p.allowNegativeStock || p.allow_negative_stock) ? ' selected' : '') + '>' + esc(t('yes')) + '</option></select>');
    html += fld(t('fSerialTr'), '<select name="serialTracking"><option value="">' + esc(t('no')) + '</option><option value="1"' + (p && (p.serialTracking || p.serial_tracking) ? ' selected' : '') + '>' + esc(t('yes')) + '</option></select>');
    html += fld(t('fNotes'), '<input name="notes" maxlength="2000" value="' + v('notes') + '" />');
    return html;
  }
  function readProductForm(fd, isCreate) {
    var out = {};
    if (isCreate) out.sku = String(fd.get('sku') || '').trim();
    out.name = String(fd.get('name') || '').trim();
    var catRaw = String(fd.get('categoryId') || '').trim();
    out.categoryId = catRaw === '' ? null : Number(catRaw);
    out.productType = String(fd.get('productType') || 'goods');
    var bc = String(fd.get('barcode') || '').trim();
    out.barcode = bc === '' ? null : bc;
    out.defaultUnitCost = parseIntField(fd.get('defaultUnitCost'), 'cost');
    out.defaultSalePrice = parseIntField(fd.get('defaultSalePrice'), 'price');
    out.taxClass = String(fd.get('taxClass') || 'standard');
    out.minStock = parseIntField(fd.get('minStock'), 'minStock');
    out.allowNegativeStock = String(fd.get('allowNegativeStock') || '') === '1';
    out.serialTracking = String(fd.get('serialTracking') || '') === '1';
    out.notes = String(fd.get('notes') || '').trim();
    if (!out.name) throw window.I18N.ex('errRequired', { field: t('name') });
    if (out.defaultUnitCost < 0) throw window.I18N.ex('errPositive', { field: t('thCost') });
    if (out.defaultSalePrice < 0) throw window.I18N.ex('errPositive', { field: t('price') });
    if (out.minStock < 0) throw window.I18N.ex('errPositive', { field: t('fMinStock') });
    return out;
  }
  function openCreateProduct() {
    getCategories().then(function (cats) {
      openModal({
        title: t('newProduct'),
        body: productFormBody(cats, null),
        onOk: function (fd, close) {
          var input = readProductForm(fd, true);
          return unwrap(api.createProduct(input)).then(function (c) { toast('✓ ' + c.sku, 'ok'); close(); if (state.catTab === 'products') renderArticles(); });
        }
      });
    });
  }
  function openEditProduct(id, reload) {
    Promise.all([unwrap(api.getProduct(id)), getCategories()]).then(function (pair) {
      var p = pair[0];
      var cats = pair[1];
      openModal({
        title: t('edit') + ' #' + id, sub: t('sku') + ' ' + p.sku + ' · ' + t('skuImmutable'),
        body: productFormBody(cats, p),
        onOk: function (fd, close) {
          var input = readProductForm(fd, false);
          return unwrap(api.updateProduct(id, input)).then(function (c) { toast('✓ ' + c.sku, 'ok'); close(); (reload || function () { renderArticles(); })(); });
        }
      });
    }).catch(function (e) { toast(errMsg(e), 'err'); });
  }
  function showProductDetail(id) {
    var el = document.getElementById('pdetail');
    el.innerHTML = '<div class="card">' + loadingHtml() + '</div>';
    unwrap(api.getProduct(id)).then(function (p) {
      var catId = p.categoryId != null ? p.categoryId : p.category_id;
      var jobs = [
        (typeof api.listPacks === 'function' ? unwrap(api.listPacks(id)).catch(function (e) { return { _err: e }; }) : Promise.resolve(null)),
        (typeof api.listBarcodes === 'function' ? unwrap(api.listBarcodes(id)).catch(function (e) { return { _err: e }; }) : Promise.resolve(null)),
        (typeof api.listLots === 'function' ? unwrap(api.listLots(id, {})).catch(function (e) { return { _err: e }; }) : Promise.resolve(null)),
        (typeof api.resolveSalePrice === 'function' ? unwrap(api.resolveSalePrice({ productId: id })).catch(function () { return null; }) : Promise.resolve(null))
      ];
      Promise.all(jobs).then(function (all) {
        var packs = all[0] || [];
        var codes = all[1] || [];
        var lots = all[2] || [];
        var price = all[3];
        el.innerHTML = '<div class="card"><h2>' + esc(p.sku) + ' · ' + esc(p.name) + ' ' + badge(p.isActive === false || p.is_active === 0 ? 'inactive' : 'active') + '</h2>' +
          '<div class="hint mono">' + esc(t('thId')) + ' ' + p.id + ' · ' + esc(t('fCategory')) + ' ' + esc(String(catId == null ? '' : catId)) + ' · ' + esc(t('fType')) + ' ' + esc((p.productType || p.product_type) ? window.I18N.productType(lang, p.productType || p.product_type) : '') + ' · ' + esc(t('fTax')) + ' ' + esc((p.taxClass || p.tax_class) ? window.I18N.taxClass(lang, p.taxClass || p.tax_class) : '') + ' · ' + esc(t('fMinStock')) + ' ' + fmt(p.minStock != null ? p.minStock : p.min_stock) + ' · ' + esc(t('thCost')) + ' ' + fmt(p.defaultUnitCost != null ? p.defaultUnitCost : p.default_unit_cost) + ' · ' + esc(t('price')) + ' ' + fmt(p.defaultSalePrice != null ? p.defaultSalePrice : p.default_sale_price) + (p.notes ? ' · ' + esc(p.notes) : '') + '</div>' +
          '<div class="grid-2" style="margin-top:10px"><div><h3>' + esc(t('thPack')) + ' (' + (packs.length != null ? packs.length : 0) + ')</h3>' + packMini(packs) + '</div>' +
          '<div><h3>' + esc(t('catBarcodes')) + ' (' + (codes.length != null ? codes.length : 0) + ')</h3>' + bcMini(codes) + '</div></div>' +
          '<div class="grid-2" style="margin-top:10px"><div><h3>' + esc(t('catLots')) + ' (' + (lots.length != null ? lots.length : 0) + ')</h3>' + lotMini(lots) + '</div>' +
          '<div><h3>' + esc(t('price')) + '</h3><div class="hint mono">' + esc(price ? JSON.stringify(price) : '—') + '</div>' +
          '<div class="row-actions" style="margin-top:8px"><button class="btn secondary small" data-dedit="' + p.id + '">' + esc(t('edit')) + '</button><button class="btn ghost small" data-dclose>' + esc(t('close')) + '</button></div></div></div></div>';
        var eb = el.querySelector('[data-dedit]');
        if (eb) eb.addEventListener('click', function () { openEditProduct(p.id, function () { showProductDetail(p.id); if (state.catTab === 'products') renderArticles(); }); });
        var cb = el.querySelector('[data-dclose]');
        if (cb) cb.addEventListener('click', function () { el.innerHTML = ''; });
        el.scrollIntoView({ block: 'nearest' });
      });
    }).catch(function (e) { el.innerHTML = '<div class="card"><div class="alert err">' + esc(errMsg(e)) + '</div></div>'; });
    function packMini(rows) {
      if (!rows || rows._err) return '<div class="alert err">' + esc((rows && rows._err) ? errMsg(rows._err) : t('unsupported')) + '</div>';
      if (!rows.length) return emptyHtml();
      return '<div class="table-wrap"><table><thead><tr><th>' + esc(t('name')) + '</th><th>' + esc(t('qty')) + '</th></tr></thead><tbody>' + rows.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="num">' + fmt(x.qty_per_pack != null ? x.qty_per_pack : x.qtyPerPack) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    function bcMini(rows) {
      if (!rows || rows._err) return '<div class="alert err">' + esc((rows && rows._err) ? errMsg(rows._err) : t('unsupported')) + '</div>';
      if (!rows.length) return emptyHtml();
      return '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('thPref')) + '</th></tr></thead><tbody>' + rows.map(function (x) { return '<tr><td class="mono">' + esc(x.code) + '</td><td>' + esc(String(x.is_preferred != null ? x.is_preferred : (x.preferred != null ? x.preferred : ''))) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    function lotMini(rows) {
      if (!rows || rows._err) return '<div class="alert err">' + esc((rows && rows._err) ? errMsg(rows._err) : t('unsupported')) + '</div>';
      if (!rows.length) return emptyHtml();
      return '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fLot')) + '</th><th>' + esc(t('thExp')) + '</th><th>' + esc(t('stock')) + '</th></tr></thead><tbody>' + rows.slice(0, 10).map(function (x) { return '<tr><td class="mono">' + esc(x.lot_no || x.lotNo) + '</td><td class="mono">' + esc(fmtDate(x.expiry_date || x.expiryDate || '')) + '</td><td class="num">' + fmt(x.stock) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
  }
  function catCategoriesTab() {
    var box = document.getElementById('cbody');
    box.innerHTML = '<div class="toolbar"><button class="btn small" data-act="newcat">' + esc(t('create')) + ' — ' + esc(t('fCategory')) + '</button><span class="hint">update: ' + esc(t('unsupported')) + ' · delete blocked when children/products</span></div><div id="tbl">' + loadingHtml() + '</div>';
    function load() {
      var tbl = document.getElementById('tbl');
      tbl.innerHTML = loadingHtml();
      getCategories().then(function (rows) {
        if (!rows.length) { tbl.innerHTML = emptyHtml(); return; }
        tbl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('thId')) + '</th><th>' + esc(t('name')) + '</th><th>' + esc(t('fParent')) + '</th><th></th></tr></thead><tbody>' +
          rows.map(function (c) { return '<tr><td>' + c.id + '</td><td>' + esc(c.name) + '</td><td>' + esc(String(c.parent_id != null ? c.parent_id : (c.parentId != null ? c.parentId : ''))) + '</td><td><button class="btn ghost small" data-cdel="' + c.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">🗑</button></td></tr>'; }).join('') + '</tbody></table></div>';
      }).catch(function (e) { tbl.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    box.querySelector('[data-act="newcat"]').addEventListener('click', function () {
      getCategories().then(function (cats) {
        openModal({
          title: t('create') + ' — ' + t('fCategory'), body: fld(t('name'), '<input name="name" required maxlength="100" />') + fld(t('fParent'), '<select name="parentId"><option value="">—</option>' + cats.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</select>'),
          onOk: function (fd, close) {
            var name = String(fd.get('name') || '').trim();
            if (!name) throw window.I18N.ex('errRequired', { field: t('name') });
            var pr = String(fd.get('parentId') || '').trim();
            return unwrap(api.createCategory({ name: name, parentId: pr === '' ? null : Number(pr) })).then(function () { toast('✓', 'ok'); close(); load(); });
          }
        });
      });
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cdel]');
      if (!b) return;
      var id = Number(b.getAttribute('data-cdel'));
      confirmDialog(t('del'), t('fCategory') + ' #' + id, t('del')).then(function (ok) {
        if (!ok) return;
        unwrap(api.deleteCategory(id)).then(function () { toast('✓', 'ok'); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
      });
    });
    load();
  }
  function catUnitsTab() {
    var box = document.getElementById('cbody');
    box.innerHTML = '<div class="grid-2"><div class="card"><h3>' + esc(t('fUnit')) + ' <span class="hint">' + esc(t('hNoDelete')) + '</span></h3><div class="toolbar"><button class="btn small" data-act="newunit">' + esc(t('create')) + ' — ' + esc(t('fUnit')) + '</button></div><div id="units">' + loadingHtml() + '</div></div>' +
      '<div class="card"><h3>' + esc(t('thPack')) + ' <span class="hint">' + esc(t('hNoUpdate')) + '</span></h3><div class="toolbar"><input type="search" id="psku" placeholder="SKU" value="' + esc(state.packSku) + '" /><button class="btn secondary small" data-act="loadpacks">' + esc(t('opLoad')) + '</button><button class="btn small" data-act="newpack">' + esc(t('create')) + ' — ' + esc(t('thPack')) + '</button></div><div id="packs">' + emptyHtml() + '</div></div></div>';
    function loadUnits() {
      var el = document.getElementById('units');
      if (typeof api.listUnits !== 'function') { el.innerHTML = '<div class="alert err">' + esc(t('unsupported')) + '</div>'; return; }
      unwrap(api.listUnits()).then(function (rows) {
        el.innerHTML = !rows.length ? emptyHtml() : '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('name')) + '</th></tr></thead><tbody>' + rows.map(function (u) { return '<tr><td class="mono">' + esc(u.code) + '</td><td>' + esc(u.name) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    function loadPacks() {
      var el = document.getElementById('packs');
      var sku = document.getElementById('psku').value.trim();
      if (!sku) { el.innerHTML = emptyHtml(t('needSku')); return; }
      el.innerHTML = loadingHtml();
      findProductBySku(sku).then(function (p) {
        return unwrap(api.listPacks(p.id)).then(function (rows) {
          el.innerHTML = '<div class="hint mono">' + esc(p.sku) + ' #' + p.id + '</div>' + (!rows.length ? emptyHtml() : '<div class="table-wrap"><table><thead><tr><th>' + esc(t('name')) + '</th><th>' + esc(t('fUnit')) + '</th><th>' + esc(t('qty')) + '</th></tr></thead><tbody>' + rows.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="mono">' + esc(x.unit_code || x.unitCode || '') + '</td><td class="num">' + fmt(x.qty_per_pack != null ? x.qty_per_pack : x.qtyPerPack) + '</td></tr>'; }).join('') + '</tbody></table></div>');
        });
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    box.querySelector('[data-act="newunit"]').addEventListener('click', function () {
      openModal({
        title: t('create') + ' — ' + t('fUnit'), body: fld(t('fCode'), '<input name="code" required maxlength="16" />') + fld(t('name'), '<input name="name" required maxlength="100" />'),
        onOk: function (fd, close) {
          return unwrap(api.createUnit({ code: String(fd.get('code') || '').trim(), name: String(fd.get('name') || '').trim() })).then(function () { toast('✓', 'ok'); close(); loadUnits(); });
        }
      });
    });
    box.querySelector('[data-act="loadpacks"]').addEventListener('click', function () { state.packSku = document.getElementById('psku').value.trim(); loadPacks(); });
    box.querySelector('[data-act="newpack"]').addEventListener('click', function () {
      var sku = document.getElementById('psku').value.trim();
      if (!sku) { toast(t('needSku'), 'err'); return; }
      Promise.all([findProductBySku(sku), (typeof api.listUnits === 'function' ? unwrap(api.listUnits()).catch(function () { return []; }) : Promise.resolve([]))]).then(function (pair) {
        var p = pair[0];
        var units = pair[1];
        openModal({
          title: t('create') + ' — ' + t('thPack') + ' · ' + p.sku, body: fld(t('name'), '<input name="name" required maxlength="100" />') + fld(t('fUnit'), '<select name="unitCode">' + units.map(function (u) { return '<option>' + esc(u.code) + '</option>'; }).join('') + '</select>') + fld(t('fQtyPack'), '<input name="qtyPerPack" value="12" inputmode="numeric" />'),
          onOk: function (fd, close) {
            return unwrap(api.createPack(p.id, { name: String(fd.get('name') || '').trim(), unitCode: String(fd.get('unitCode') || '').trim(), qtyPerPack: parseIntField(fd.get('qtyPerPack'), 'qtyPerPack') })).then(function () { toast('✓', 'ok'); close(); loadPacks(); });
          }
        });
      }).catch(function (e) { toast(errMsg(e), 'err'); });
    });
    loadUnits();
  }
  function catPricesTab() {
    var box = document.getElementById('cbody');
    box.innerHTML = '<div class="toolbar"><button class="btn small" data-act="newlist">' + esc(t('create')) + ' — ' + esc(t('catPrices')) + '</button><span class="hint">code immutable · money integer ct</span></div><div id="lists">' + loadingHtml() + '</div><div id="ldetail"></div>';
    function load() {
      var el = document.getElementById('lists');
      el.innerHTML = loadingHtml();
      unwrap(api.listPriceLists()).then(function (rows) {
        if (!rows.length) { el.innerHTML = emptyHtml(); return; }
        el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('name')) + '</th><th>' + esc(t('fScope')) + '</th><th>' + esc(t('thPrio')) + '</th><th>' + esc(t('active')) + '</th><th></th></tr></thead><tbody>' +
          rows.map(function (l) { return '<tr><td class="mono">' + esc(l.code) + '</td><td>' + esc(l.name) + '</td><td class="mono">' + esc(l.scope_type || l.scopeType || '') + ':' + esc(l.scope_key || l.scopeKey || '') + '</td><td class="num">' + fmt(l.priority) + '</td><td>' + esc(String(l.is_active != null ? l.is_active : l.isActive)) + '</td><td><div class="row-actions"><button class="btn ghost small" data-ldetail="' + l.id + '">' + esc(t('detail')) + '</button><button class="btn ghost small" data-ledit="' + l.id + '">' + esc(t('edit')) + '</button><button class="btn ghost small" data-ldel="' + l.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">🗑</button></div></td></tr>'; }).join('') + '</tbody></table></div>';
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    box.querySelector('[data-act="newlist"]').addEventListener('click', function () {
      openModal({
        title: t('create') + ' — ' + t('catPrices'), body: fld(t('fCode'), '<input name="code" required maxlength="32" />') + fld(t('name'), '<input name="name" required maxlength="100" />') + fld(t('fScope'), '<select name="scopeType"><option value="general">' + esc(window.I18N.priceScope(lang, 'general')) + '</option><option value="customer_type">' + esc(window.I18N.priceScope(lang, 'customer_type')) + '</option><option value="customer">' + esc(window.I18N.priceScope(lang, 'customer')) + '</option></select>') + fld(t('fScopeKey'), '<input name="scopeKey" />') + fld(t('fPriority'), '<input name="priority" value="0" inputmode="numeric" />') + fld(t('fValidFrom'), '<input name="validFrom" placeholder="YYYY-MM-DD" />') + fld(t('fValidTo'), '<input name="validTo" placeholder="YYYY-MM-DD" />'),
        onOk: function (fd, close) {
          var scope = String(fd.get('scopeType') || 'general');
          var key = String(fd.get('scopeKey') || '').trim();
          var prRaw = String(fd.get('priority') || '0').trim();
          var vf = String(fd.get('validFrom') || '').trim() || null;
          var vt = String(fd.get('validTo') || '').trim() || null;
          return unwrap(api.createPriceList({ code: String(fd.get('code') || '').trim(), name: String(fd.get('name') || '').trim(), scopeType: scope, scopeKey: key === '' ? null : key, priority: prRaw === '' ? 0 : Number(prRaw), validFrom: vf, validTo: vt })).then(function () { toast('✓', 'ok'); close(); load(); });
        }
      });
    });
    box.addEventListener('click', function (e) {
      var dd = e.target.closest('[data-ldetail]');
      if (dd) { showListDetail(Number(dd.getAttribute('data-ldetail'))); return; }
      var ed = e.target.closest('[data-ledit]');
      if (ed) {
        var eid = Number(ed.getAttribute('data-ledit'));
        unwrap(api.getPriceList(eid)).then(function (l) {
          openModal({
            title: t('edit') + ' ' + l.code,           sub: t('hCodeLocked'),
            body: fld(t('name'), '<input name="name" required value="' + esc(l.name) + '" />') + fld(t('fPriority'), '<input name="priority" value="' + esc(String(l.priority != null ? l.priority : 0)) + '" />') + fld(t('active'), '<select name="isActive"><option value="1">' + esc(t('yes')) + '</option><option value="">' + esc(t('no')) + '</option></select>'),
            onOk: function (fd, close) {
              return unwrap(api.updatePriceList(eid, { name: String(fd.get('name') || '').trim(), priority: Number(String(fd.get('priority') || '0')), isActive: String(fd.get('isActive') || '') === '1' })).then(function () { toast('✓', 'ok'); close(); load(); });
            }
          });
        }).catch(function (err) { toast(errMsg(err), 'err'); });
        return;
      }
      var del = e.target.closest('[data-ldel]');
      if (del) {
        var did = Number(del.getAttribute('data-ldel'));
            confirmDialog(t('del'), t('catPrices') + ' #' + did, t('del')).then(function (ok) {
          if (!ok) return;
          unwrap(api.deletePriceList(did)).then(function () { toast('✓', 'ok'); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
        });
      }
    });
    function showListDetail(id) {
      var el = document.getElementById('ldetail');
      el.innerHTML = '<div class="card">' + loadingHtml() + '</div>';
      unwrap(api.getPriceList(id)).then(function (l) {
        var lines = l.lines || [];
        el.innerHTML = '<div class="card"><h3>' + esc(l.code) + ' · ' + esc(l.name) + '</h3>' +
          '<div class="toolbar"><button class="btn secondary small" data-act="setline">' + esc(t('addLine')) + '</button><button class="btn secondary small" data-act="resolve">' + esc(t('ttlResolve')) + '</button></div>' +
          '<div id="lines">' + (!lines.length ? emptyHtml() : '<div class="table-wrap"><table><thead><tr><th>' + esc(t('sku')) + '</th><th>' + esc(t('thPack')) + '</th><th>' + esc(t('price')) + '</th><th></th></tr></thead><tbody>' + lines.slice(0, 60).map(function (x) { return '<tr><td class="mono">' + esc(x.product_sku || x.sku || x.product_id) + '</td><td>' + esc(String(x.pack_id != null ? x.pack_id : (x.packId != null ? x.packId : ''))) + '</td><td class="num">' + fmt(x.unit_price != null ? x.unit_price : x.unitPrice) + '</td><td><button class="btn ghost small" data-rline="' + esc(String(x.product_id != null ? x.product_id : '')) + '" data-pack="' + esc(String(x.pack_id != null ? x.pack_id : '')) + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">✖</button></td></tr>'; }).join('') + '</tbody></table></div>') + '</div><div id="prev" class="hint"></div></div>';
        el.querySelector('[data-act="setline"]').addEventListener('click', function () {
          openModal({
            title: t('addLine') + ' · ' + l.code, body: fld('SKU*', '<input name="sku" required />') + fld(t('fPack'), '<input name="packId" />') + fld(t('price'), '<input name="unitPrice" required inputmode="numeric" />'),
            onOk: function (fd, close) {
              return findProductBySku(String(fd.get('sku') || '').trim()).then(function (p) {
                var pkRaw = String(fd.get('packId') || '').trim();
                return unwrap(api.setPriceLine(l.id, { productId: p.id, packId: pkRaw === '' ? null : Number(pkRaw), unitPrice: parseIntField(fd.get('unitPrice'), 'unitPrice') }));
              }).then(function () { toast('✓', 'ok'); close(); showListDetail(l.id); });
            }
          });
        });
        el.querySelector('[data-act="resolve"]').addEventListener('click', function () {
          openModal({
            title: t('ttlResolve'), body: fld('SKU*', '<input name="sku" required />') + fld(t('customer'), '<input name="customerCode" />') + fld(t('fCustType'), '<input name="customerTypeCode" />'),
            onOk: function (fd, close) {
              return findProductBySku(String(fd.get('sku') || '').trim()).then(function (p) {
                return unwrap(api.resolveSalePrice({ productId: p.id, customerCode: String(fd.get('customerCode') || '').trim() || null, customerTypeCode: String(fd.get('customerTypeCode') || '').trim() || null }));
              }).then(function (r) { document.getElementById('prev').textContent = JSON.stringify(r); close(); });
            }
          });
        });
        el.querySelectorAll('[data-rline]').forEach(function (b) {
          b.addEventListener('click', function () {
            var pid = Number(b.getAttribute('data-rline'));
            var pkRaw = b.getAttribute('data-pack');
            confirmDialog(t('del'), t('lines') + ' #' + lid, t('del')).then(function (ok) {
              if (!ok) return;
              unwrap(api.removePriceLine(l.id, { productId: pid, packId: pkRaw === '' ? null : Number(pkRaw) })).then(function () { toast('✓', 'ok'); showListDetail(l.id); }).catch(function (err) { toast(errMsg(err), 'err'); });
            });
          });
        });
      }).catch(function (e) { el.innerHTML = '<div class="card"><div class="alert err">' + esc(errMsg(e)) + '</div></div>'; });
    }
    load();
  }
  function catBarcodesTab() {
    var box = document.getElementById('cbody');
    box.innerHTML = '<div class="grid-2"><div class="card"><h3>' + esc(t('catBarcodes')) + ' <span class="hint">' + esc(t('manualEntry')) + '</span></h3><div class="toolbar"><input type="search" id="bsku" placeholder="SKU" value="' + esc(state.bcSku) + '" /><button class="btn secondary small" data-act="load">' + esc(t('opLoad')) + '</button><button class="btn small" data-act="add">' + esc(t('create')) + ' — ' + esc(t('fBarcode')) + '</button></div><div id="bcs">' + emptyHtml() + '</div></div>' +
      '<div class="card"><h3>' + esc(t('ttlResolve')) + '</h3><div class="toolbar"><input type="search" id="rcode" placeholder="' + esc(t('fCode')) + '" /><button class="btn secondary small" data-act="resolve">' + esc(t('ttlResolve')) + '</button></div><div id="rout" class="hint">—</div><div class="hint">' + esc(t('manualEntry')) + '</div></div></div>';
    function load() {
      var el = document.getElementById('bcs');
      var sku = document.getElementById('bsku').value.trim();
      if (!sku) { el.innerHTML = emptyHtml(t('needSku')); return; }
      el.innerHTML = loadingHtml();
      findProductBySku(sku).then(function (p) {
        return unwrap(api.listBarcodes(p.id)).then(function (rows) {
          el.innerHTML = '<div class="hint mono">' + esc(p.sku) + ' #' + p.id + '</div>' + (!rows.length ? emptyHtml() : '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('thPack')) + '</th><th>' + esc(t('thPref')) + '</th><th></th></tr></thead><tbody>' + rows.map(function (x) { return '<tr><td class="mono">' + esc(x.code) + '</td><td>' + esc(String(x.pack_id != null ? x.pack_id : (x.packId != null ? x.packId : ''))) + '</td><td>' + esc(String(x.is_preferred != null ? x.is_preferred : x.preferred)) + '</td><td><button class="btn ghost small" data-brm="' + x.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">✖</button></td></tr>'; }).join('') + '</tbody></table></div>');
          el.querySelectorAll('[data-brm]').forEach(function (b) {
            b.addEventListener('click', function () {
              confirmDialog(t('del'), t('fBarcode') + ' #' + b.getAttribute('data-brm'), t('del')).then(function (ok) {
                if (!ok) return;
                unwrap(api.removeBarcode(Number(b.getAttribute('data-brm')))).then(function () { toast('✓', 'ok'); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
              });
            });
          });
        });
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    box.querySelector('[data-act="load"]').addEventListener('click', function () { state.bcSku = document.getElementById('bsku').value.trim(); load(); });
    box.querySelector('[data-act="add"]').addEventListener('click', function () {
      var sku = document.getElementById('bsku').value.trim();
      if (!sku) { toast(t('needSku'), 'err'); return; }
      findProductBySku(sku).then(function (p) {
        return unwrap(api.listPacks(p.id)).catch(function () { return []; }).then(function (packs) {
          openModal({
            title: t('create') + ' — ' + t('fBarcode') + ' · ' + p.sku, body: fld(t('fCode'), '<input name="code" required maxlength="64" />') + fld(t('thPack'), '<select name="packId"><option value="">' + esc(t('optBase')) + '</option>' + packs.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select>') + fld(t('thPref'), '<select name="preferred"><option value="">' + esc(t('no')) + '</option><option value="1">' + esc(t('yes')) + '</option></select>'),
            onOk: function (fd, close) {
              var pk = String(fd.get('packId') || '').trim();
              return unwrap(api.addBarcode(p.id, { code: String(fd.get('code') || '').trim(), packId: pk === '' ? null : Number(pk), preferred: String(fd.get('preferred') || '') === '1' })).then(function () { toast('✓', 'ok'); close(); load(); });
            }
          });
        });
      }).catch(function (e) { toast(errMsg(e), 'err'); });
    });
    box.querySelector('[data-act="resolve"]').addEventListener('click', function () {
      var c = document.getElementById('rcode').value.trim();
      var out = document.getElementById('rout');
      if (!c) { out.textContent = t('empty'); return; }
      out.textContent = t('loading');
      unwrap(api.resolveBarcode(c)).then(function (r) { out.textContent = r ? JSON.stringify(r) : t('empty'); }).catch(function (e) { out.textContent = errMsg(e); });
    });
  }
  function catLotsTab() {
    var box = document.getElementById('cbody');
    box.innerHTML = '<div class="card"><div class="toolbar"><input type="search" id="lsku" placeholder="SKU" value="' + esc(state.lotSku) + '" /><select id="lwh"></select><label class="hint"><input type="checkbox" id="lexp" checked /> ' + esc(t('fInclExp')) + '</label><button class="btn secondary small" data-act="load">' + esc(t('opLoad')) + '</button><button class="btn small" data-act="new">' + esc(t('create')) + ' — ' + esc(t('fLot')) + '</button></div><div id="lots">' + emptyHtml() + '</div></div>' +
      '<div class="grid-2"><div class="card"><h3>' + esc(t('hSuggest')) + '</h3><div class="toolbar"><input id="sqty" value="10" inputmode="numeric" /><select id="spol"><option>fefo</option><option>fifo</option></select><button class="btn secondary small" data-act="suggest">' + esc(t('opSuggest')) + '</button></div><div id="sout" class="hint">—</div></div>' +
      '<div class="card"><h3>' + esc(t('fSerials')) + '</h3><div class="toolbar"><select id="sstat"><option value="">' + esc(t('all')) + '</option><option value="in_stock">' + esc(t('srIn')) + '</option><option value="out">' + esc(t('srOut')) + '</option></select><button class="btn secondary small" data-act="serials">' + esc(t('opLoad')) + '</button></div><div id="sers" class="hint">—</div></div></div>';
    getWarehouses().then(function (list) {
      var sel = document.getElementById('lwh');
      if (sel) sel.innerHTML = list.map(function (w) { return '<option value="' + esc(w.code) + '">' + esc(w.code) + '</option>'; }).join('');
    });
    function load() {
      var el = document.getElementById('lots');
      var sku = document.getElementById('lsku').value.trim();
      if (!sku) { el.innerHTML = emptyHtml(t('needSku')); return; }
      el.innerHTML = loadingHtml();
      var whCode = document.getElementById('lwh').value;
      var inc = document.getElementById('lexp').checked;
      findProductBySku(sku).then(function (p) {
        return Promise.all([Promise.resolve(p), getWarehouses()]).then(function (pair) {
          var wid = warehouseIdOf(whCode, pair[1]);
          return unwrap(api.listLots(p.id, { warehouseId: wid, includeExpired: inc })).then(function (rows) {
            el.innerHTML = '<div class="hint mono">' + esc(p.sku) + ' · ' + esc(t('warehouse')) + ' ' + esc(whCode) + ' (#' + String(wid) + ')</div>' + (!rows.length ? emptyHtml() : '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fLot')) + '</th><th>' + esc(t('thExp')) + '</th><th>' + esc(t('stock')) + '</th><th>' + esc(t('fExpiry')) + '</th><th></th></tr></thead><tbody>' + rows.map(function (x) { return '<tr><td class="mono">' + esc(x.lot_no || x.lotNo) + '</td><td class="mono">' + esc(fmtDate(x.expiry_date || x.expiryDate || '')) + '</td><td class="num">' + fmt(x.stock) + '</td><td>' + esc(String(x.expired)) + '</td><td><button class="btn ghost small" data-lotdel="' + x.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">🗑</button></td></tr>'; }).join('') + '</tbody></table></div>');
            el.querySelectorAll('[data-lotdel]').forEach(function (b) {
              b.addEventListener('click', function () {
                confirmDialog(t('del'), t('fLot') + ' #' + b.getAttribute('data-lotdel') + ' · ' + t('hDelBlocked'), t('del')).then(function (ok) {
                  if (!ok) return;
                  unwrap(api.deleteLot(Number(b.getAttribute('data-lotdel')))).then(function () { toast('✓', 'ok'); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
                });
              });
            });
          });
        });
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    box.querySelector('[data-act="load"]').addEventListener('click', function () { state.lotSku = document.getElementById('lsku').value.trim(); load(); });
    box.querySelector('[data-act="new"]').addEventListener('click', function () {
      var sku = document.getElementById('lsku').value.trim();
      if (!sku) { toast(t('needSku'), 'err'); return; }
      findProductBySku(sku).then(function (p) {
        openModal({
            title: t('create') + ' — ' + t('fLot') + ' · ' + p.sku, body: fld(t('fLot'), '<input name="lotNo" required maxlength="64" />') + fld(t('fReference'), '<input name="supplierRef" />') + fld(t('fMade'), '<input name="manufacturedDate" placeholder="YYYY-MM-DD" />') + fld(t('fExpiry'), '<input name="expiryDate" placeholder="YYYY-MM-DD" />'),
          onOk: function (fd, close) {
            var m = String(fd.get('manufacturedDate') || '').trim() || null;
            var x = String(fd.get('expiryDate') || '').trim() || null;
            return unwrap(api.createLot(p.id, { lotNo: String(fd.get('lotNo') || '').trim(), supplierRef: String(fd.get('supplierRef') || '').trim(), manufacturedDate: m, expiryDate: x })).then(function () { toast('✓', 'ok'); close(); load(); });
          }
        });
      }).catch(function (e) { toast(errMsg(e), 'err'); });
    });
    box.querySelector('[data-act="suggest"]').addEventListener('click', function () {
      var sku = document.getElementById('lsku').value.trim();
      var out = document.getElementById('sout');
      if (!sku) { out.textContent = t('needSku'); return; }
      var qty;
      try { qty = parseIntField(document.getElementById('sqty').value, 'qty'); } catch (e) { out.textContent = errMsg(e); return; }
      var pol = document.getElementById('spol').value;
      var whCode = document.getElementById('lwh').value;
      out.textContent = t('loading');
      findProductBySku(sku).then(function (p) {
        return getWarehouses().then(function (list) {
          var wid = warehouseIdOf(whCode, list);
          if (!wid) throw window.I18N.ex('errWarehouseNotFound', { code: whCode });
          return unwrap(api.suggestLots({ productId: p.id, warehouseId: wid, qty: qty, policy: pol }));
        });
      }).then(function (r) { out.textContent = JSON.stringify(r); }).catch(function (e) { out.textContent = errMsg(e); });
    });
    box.querySelector('[data-act="serials"]').addEventListener('click', function () {
      var sku = document.getElementById('lsku').value.trim();
      var out = document.getElementById('sers');
      if (!sku) { out.textContent = t('needSku'); return; }
      var st = document.getElementById('sstat').value || null;
      out.textContent = t('loading');
      findProductBySku(sku).then(function (p) {
        return unwrap(api.listSerials(p.id, st));
      }).then(function (rows) { out.textContent = !rows.length ? t('empty') : JSON.stringify(rows.slice(0, 20)); }).catch(function (e) { out.textContent = errMsg(e); });
    });
  }
  function fld(label, inner) { return '<label class="fld">' + esc(label) + inner + '</label>'; }

  /* ---------- shared document detail (Batch 3, sales + purchases) ---------- */
  function docTypeOf(d) { return d.docType || d.doc_type || ''; }
  function docNoOf(d) { return d.docNo || d.doc_no || ('#' + d.id); }
  function totalsOf(d) {
    var g = d.grandTotal != null ? d.grandTotal : d.grand_total;
    var s = d.subtotal != null ? d.subtotal : d.sub_total;
    var dt = d.draftTotals || null;
    return { grand: g, sub: s, draft: dt, disc: (d.docDiscountAmount != null ? d.docDiscountAmount : d.doc_discount_amount) };
  }
  function allowedDocActions(d) {
    var type = docTypeOf(d);
    var st = d.status;
    var out = [{ action: 'detail', label: t('detail') }, { action: 'print', label: t('print') }];
    if (st === 'draft') {
      out.push({ action: 'confirm', label: t('confirm') });
      out.push({ action: 'editHead', label: t('header') });
      out.push({ action: 'cancel', label: t('del') });
    } else if (st === 'confirmed') {
      if (type === 'delivery_note') out.push({ action: 'postDelivery', label: t('post') });
      else if (type === 'customer_return') out.push({ action: 'postReturn', label: t('post') });
      else out.push({ action: 'post', label: t('post') });
      out.push({ action: 'cancel', label: t('del') });
    } else if (st === 'posted') {
      if (type === 'sales_order') out.push({ action: 'deliver', label: t('deliver') });
      if (type === 'delivery_note') out.push({ action: 'invoice', label: t('invoice') });
      if (type === 'delivery_note') out.push({ action: 'custReturn', label: t('custReturn') });
    }
    return out;
  }
  function withBtnBusy(btn, fn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    Promise.resolve().then(fn).then(function () { btn.disabled = false; }, function (err) { btn.disabled = false; toast(errMsg(err), 'err'); });
  }
  function showDocDetail(containerId, id, reloadList) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<div class="card">' + loadingHtml() + '</div>';
    unwrap(api.getDocument(id)).then(function (d) {
      var type = docTypeOf(d);
      var tt = totalsOf(d);
      var isDraft = d.status === 'draft';
      var lines = d.lines || [];
      var html = '<div class="card"><h2>' + esc(docNoOf(d)) + ' · <span class="mono">' + esc(window.I18N.docType(lang, type)) + '</span> ' + badge(d.status) + '</h2>' +
        '<div class="hint mono">' + esc(t('thId')) + ' ' + d.id + ' · ' + esc(t('fParty')) + ' ' + esc(String(d.partyId != null ? d.partyId : (d.party_id != null ? d.party_id : ''))) +
        ' · ' + esc(t('warehouse')) + ' ' + esc(String(d.warehouseId != null ? d.warehouseId : (d.warehouse_id != null ? d.warehouse_id : ''))) +
        ' · ' + esc(t('fDate')) + ' ' + esc(fmtDate(d.docDate || d.doc_date || '')) +
        (d.postedAt || d.posted_at ? ' · ' + esc(t('stPosted')) + ' ' + esc(fmtDate(d.postedAt || d.posted_at)) : '') +
        (d.cancelReason || d.cancel_reason ? ' · ' + esc(t('stCancelled')) + ': ' + esc(d.cancelReason || d.cancel_reason) : '') +
        (d.sourceDocId || d.source_doc_id ? ' · ' + esc(t('fDoc')) + ' #' + esc(String(d.sourceDocId || d.source_doc_id)) : '') + '</div>' +
        (d.notes ? '<div style="margin-top:6px">' + esc(d.notes) + '</div>' : '') +
        '<h3>' + esc(t('totals')) + '</h3><div class="hint mono">' + esc(t('total')) + ' ' + fmt(tt.grand) + ' · ' + esc(t('fDiscount')) + ' ' + fmt((tt.disc || 0) + (tt.draft ? tt.draft.discountTotal : 0)) + (tt.draft ? ' · ' + esc(t('stDraft')) + ' ' + fmt(tt.draft.grandTotal) : '') + ' · ' + esc(t('hServer')) + '</div>' +
        '<h3>' + esc(t('lines')) + ' (' + lines.length + ')' + (isDraft ? ' <button class="btn secondary small" data-dadd="' + d.id + '">' + esc(t('addLine')) + '</button>' : '') + '</h3>' +
        (lines.length ? '<div class="table-wrap"><table><thead><tr><th>#</th><th>' + esc(t('sku')) + '</th><th>' + esc(t('qty')) + '</th><th>' + esc(t('price')) + '</th><th>' + esc(t('fDiscount')) + '</th><th>' + esc(t('total')) + '</th><th></th></tr></thead><tbody>' +
          lines.map(function (l) {
            return '<tr><td>' + (l.line_no != null ? l.line_no : (l.lineNo != null ? l.lineNo : '')) + '</td>' +
              '<td class="mono">' + esc(l.product_sku || l.productSku || l.product_id || l.productId || '') + '<div class="hint">' + esc(l.description || '') + '</div></td>' +
              '<td class="num">' + fmt(l.qty) + '</td><td class="num">' + fmt(l.unit_price != null ? l.unit_price : l.unitPrice) + '</td>' +
              '<td class="num">' + fmt(l.discount_amount != null ? l.discount_amount : l.discountAmount) + '</td>' +
              '<td class="num">' + fmt(l.line_total != null ? l.line_total : l.lineTotal) + '</td>' +
              '<td>' + (isDraft ? '<div class="row-actions"><button class="btn ghost small" data-ledit="' + l.id + '">' + esc(t('edit')) + '</button><button class="btn ghost small" data-lrm="' + l.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">✖</button></div>' : '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : emptyHtml()) +
        '<div class="row-actions" style="margin-top:10px">' + allowedDocActions(d).map(function (a) {
          var cls = 'btn small';
          if (a.action === 'detail') cls += ' secondary" disabled';
          else if (a.action === 'cancel') cls += ' danger';
          else if (a.action === 'print') cls += ' secondary';
          return '<button class="' + cls + '" data-docact="' + a.action + '" data-id="' + d.id + '">' + esc(a.label) + '</button>';
        }).join('') + ' <button class="btn ghost small" data-dclose>' + esc(t('close')) + '</button></div>' +
        '<div class="hint" style="margin-top:6px">' + esc(t('hHistory')) + '</div></div>';
      el.innerHTML = html;
      el.scrollIntoView({ block: 'nearest' });
    }).catch(function (e) { el.innerHTML = '<div class="card"><div class="alert err">' + esc(errMsg(e)) + '</div></div>'; });
  }
  function bindDocDetail(containerId, reloadList) {
    var el = document.getElementById(containerId);
    if (!el || el.getAttribute('data-bound') === '1') return;
    el.setAttribute('data-bound', '1');
    el.addEventListener('click', function (e) {
      var add = e.target.closest('[data-dadd]');
      if (add) { openAddLine(Number(add.getAttribute('data-dadd')), function () { showDocDetail(containerId, Number(add.getAttribute('data-dadd')), reloadList); if (reloadList) reloadList(); }); return; }
      var le = e.target.closest('[data-ledit]');
      if (le) {
        (function () {
          var lid = Number(le.getAttribute('data-ledit'));
          openModal({
            title: t('edit') + ' line #' + lid,
            body: fld(t('qty') + '*', '<input name="qty" inputmode="numeric" />') + fld(t('price'), '<input name="unitPrice" inputmode="numeric" />') + fld(t('fDiscount'), '<input name="discountAmount" value="0" inputmode="numeric" />') + fld(t('fNotes'), '<input name="notes" />'),
            onOk: function (fd, close) {
              var patch = {};
              var q = String(fd.get('qty') || '').trim();
              var up = String(fd.get('unitPrice') || '').trim();
              var dc = String(fd.get('discountAmount') || '').trim();
              if (q !== '') patch.qty = parseIntField(q, 'qty');
              if (up !== '') patch.unitPrice = parseIntField(up, 'unitPrice');
              if (dc !== '') patch.discountAmount = parseIntField(dc, 'discountAmount');
              patch.notes = String(fd.get('notes') || '').trim();
              if (patch.qty !== undefined && patch.qty <= 0) throw window.I18N.ex('errPositive', { field: t('qty') });
              return unwrap(api.updateDocumentLine(lid, patch)).then(function () { toast('✓', 'ok'); close(); var cur = el.querySelector('[data-dadd]'); var did = cur ? Number(cur.getAttribute('data-dadd')) : null; if (did) showDocDetail(containerId, did, reloadList); if (reloadList) reloadList(); });
            }
          });
        })();
        return;
      }
      var rm = e.target.closest('[data-lrm]');
      if (rm) {
        (function () {
          var lid = Number(rm.getAttribute('data-lrm'));
          confirmDialog(t('del'), t('lines') + ' #' + lid, t('del')).then(function (ok) {
            if (!ok) return;
            unwrap(api.removeDocumentLine(lid)).then(function () { toast('✓', 'ok'); var cur = el.querySelector('[data-dadd]'); var did = cur ? Number(cur.getAttribute('data-dadd')) : null; if (did) showDocDetail(containerId, did, reloadList); if (reloadList) reloadList(); }).catch(function (err) { toast(errMsg(err), 'err'); });
          });
        })();
        return;
      }
      var c = e.target.closest('[data-dclose]');
      if (c) { el.innerHTML = ''; return; }
      var b = e.target.closest('[data-docact]');
      if (!b || b.disabled) return;
      (function (btn) {
        var action = btn.getAttribute('data-docact');
        var id = Number(btn.getAttribute('data-id'));
        if (action === 'print') { openPrintDoc(id); return; }
        if (action === 'editHead') {
          unwrap(api.getDocument(id)).then(function (d) {
            openModal({
              title: t('header') + ' ' + docNoOf(d),           sub: t('hDraftOnly'),
              body: fld(t('date') + ' YYYY-MM-DD', '<input name="docDate" value="' + esc(d.docDate || d.doc_date || '') + '" />') + fld(t('fDiscount'), '<input name="docDiscountAmount" value="' + esc(String(d.docDiscountAmount != null ? d.docDiscountAmount : (d.doc_discount_amount != null ? d.doc_discount_amount : 0))) + '" />') + fld(t('fNotes'), '<input name="notes" value="' + esc(d.notes || '') + '" />'),
              onOk: function (fd, close) {
                var patch = { notes: String(fd.get('notes') || '').trim() };
                var dd = String(fd.get('docDate') || '').trim();
                if (dd !== '') patch.docDate = dd;
                var disc = String(fd.get('docDiscountAmount') || '').trim();
                if (disc !== '') patch.docDiscountAmount = parseIntField(disc, 'docDiscount');
                return unwrap(api.updateDocument(id, patch)).then(function () { toast('✓', 'ok'); close(); showDocDetail(containerId, id, reloadList); if (reloadList) reloadList(); });
              }
            });
          }).catch(function (err) { toast(errMsg(err), 'err'); });
          return;
        }
        if (action === 'cancel') {
          openModal({
            title: t('del') + ' #' + id, body: fld(t('cancelReason'), '<input name="reason" required />') + '<div class="hint">posted delivery → returns, not cancel · invoice with payments → reverse first</div>',
            okLabel: t('del'),
            onOk: function (fd, close) {
              var reason = String(fd.get('reason') || '').trim();
              if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
              return unwrap(api.cancelDocument(id, reason)).then(function () { toast('✓', 'ok'); close(); showDocDetail(containerId, id, reloadList); if (reloadList) reloadList(); });
            }
          });
          return;
        }
        withBtnBusy(btn, function () {
          var p;
          if (action === 'confirm') p = unwrap(api.confirmDocument(id));
          else if (action === 'post') p = unwrap(api.postDocument(id));
          else if (action === 'postDelivery') p = unwrap(api.postDeliveryNote(id, {}));
          else if (action === 'postReturn') {
            openModal({
              title: t('post') + ' #' + id,
              body: fld(t('fReason'), '<select name="reason"><option value="defective">' + esc(window.I18N.moveReason(lang, 'defective')) + '</option><option value="damaged">' + esc(window.I18N.moveReason(lang, 'damaged')) + '</option><option value="expired">' + esc(window.I18N.moveReason(lang, 'expired')) + '</option><option value="wrong_item">' + esc(window.I18N.moveReason(lang, 'wrong_item')) + '</option><option value="customer_request">' + esc(window.I18N.moveReason(lang, 'customer_request')) + '</option><option value="correction">' + esc(window.I18N.moveReason(lang, 'correction')) + '</option><option value="lost">' + esc(window.I18N.moveReason(lang, 'lost')) + '</option><option value="found">' + esc(window.I18N.moveReason(lang, 'found')) + '</option></select>'),
              onOk: function (fd, close) {
                return unwrap(api.postCustomerReturn(id, { reason: String(fd.get('reason') || '').trim() })).then(function () { toast('✓', 'ok'); close(); showDocDetail(containerId, id, reloadList); if (reloadList) reloadList(); });
              }
            });
            return;
          }
          else if (action === 'custReturn') { showDocDetail(containerId, id, reloadList); toast(t('hUseCash'), ''); return; }
          else if (action === 'deliver') p = unwrap(api.convertDocument(id, 'delivery_note', { warehouseCode: state.warehouse })).then(function (dn) { toast('✓ ' + docNoOf(dn) + ' (draft)', 'ok'); showDocDetail(containerId, dn.id, reloadList); if (reloadList) reloadList(); return null; });
          else if (action === 'invoice') p = unwrap(api.convertDeliveriesToInvoice([id], {})).then(function (inv) { toast('✓ ' + docNoOf(inv) + ' (draft)', 'ok'); showDocDetail(containerId, inv.id, reloadList); if (reloadList) reloadList(); return null; });
          else return;
          return p.then(function (r) { if (r) { toast('✓', 'ok'); showDocDetail(containerId, id, reloadList); if (reloadList) reloadList(); } });
        });
      })(b);
    });
  }
  function openAddLine(docId, done) {
    openModal({
      title: t('addLine') + ' #' + docId,
      body: fld('SKU*', '<input name="sku" required />') + fld(t('qty') + '*', '<input name="qty" value="1" inputmode="numeric" />') + fld(t('price'), '<input name="unitPrice" value="0" inputmode="numeric" />') + fld(t('fDiscount'), '<input name="discountAmount" value="0" inputmode="numeric" />') + fld(t('fUnit'), '<input name="unitCode" value="PCS" />'),
      onOk: function (fd, close) {
        return findProductBySku(String(fd.get('sku') || '').trim()).then(function (p) {
          var qty = parseIntField(fd.get('qty'), 'qty');
          var up = parseIntField(String(fd.get('unitPrice') || '0').trim() === '' ? '0' : fd.get('unitPrice'), 'unitPrice');
          var dc = parseIntField(String(fd.get('discountAmount') || '0').trim() === '' ? '0' : fd.get('discountAmount'), 'discountAmount');
          if (qty <= 0) throw window.I18N.ex('errPositive', { field: t('qty') });
          return unwrap(api.addDocumentLine(docId, { productId: p.id, qty: qty, unitPrice: up, discountAmount: dc, unitCode: String(fd.get('unitCode') || 'PCS').trim() || 'PCS' }));
        }).then(function () { toast('✓', 'ok'); close(); if (done) done(); });
      }
    });
  }
  function openPrintDoc(id) {
    unwrap(api.getDocument(id)).then(function (d) {
      var lines = d.lines || [];
      var tt = totalsOf(d);
      var root = document.getElementById('dialog-root');
      root.innerHTML = '';
      var back = document.createElement('div');
      back.className = 'dialog-backdrop';
      var dlg = document.createElement('div');
      dlg.className = 'dialog';
      dlg.setAttribute('role', 'dialog');
      dlg.innerHTML = '<div id="print-area"><h2>' + esc(docNoOf(d)) + ' · ' + esc(window.I18N.docType(lang, docTypeOf(d))) + ' · ' + esc(window.I18N.status(lang, d.status)) + '</h2>' +
        '<div class="hint mono">' + esc(t('fDate')) + ' ' + esc(fmtDate(d.docDate || d.doc_date || '')) + ' · ' + esc(t('fParty')) + ' ' + esc(String(d.partyId != null ? d.partyId : '')) + ' · ' + esc(t('warehouse')) + ' ' + esc(String(d.warehouseId != null ? d.warehouseId : '')) + '</div>' +
        '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>#</th><th>' + esc(t('sku')) + '</th><th>' + esc(t('qty')) + '</th><th>' + esc(t('price')) + '</th><th>' + esc(t('total')) + '</th></tr></thead><tbody>' +
        lines.map(function (l) { return '<tr><td>' + esc(String(l.line_no != null ? l.line_no : '')) + '</td><td class="mono">' + esc(l.product_sku || l.product_id || '') + '</td><td class="num">' + fmt(l.qty) + '</td><td class="num">' + fmt(l.unit_price != null ? l.unit_price : l.unitPrice) + '</td><td class="num">' + fmt(l.line_total != null ? l.line_total : l.lineTotal) + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="hint mono" style="margin-top:6px">' + esc(t('total')) + ' ' + fmt(tt.grand) + ' · ' + esc(t('hServer')) + '</div></div>' +
        '<div class="dlg-actions"><button class="btn secondary" data-close>' + esc(t('close')) + '</button><button class="btn" data-print>' + esc(t('print')) + '</button></div>';
      back.appendChild(dlg);
      root.appendChild(back);
      document.body.classList.add('print-dialog');
      function close() { document.body.classList.remove('print-dialog'); root.innerHTML = ''; }
      dlg.querySelector('[data-close]').addEventListener('click', close);
      dlg.querySelector('[data-print]').addEventListener('click', function () { window.print(); });
      back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    }).catch(function (e) { toast(errMsg(e), 'err'); });
  }

  function renderStock() {
    view.innerHTML = pageHead(t('stock'), t('hStockSub'), '<span class="row-actions"><button class="btn secondary small" data-act="receive">' + esc(t('newReceipt')) + '</button><button class="btn secondary small" data-act="issue">' + esc(t('opIssue')) + '</button><button class="btn secondary small" data-act="adjust">' + esc(t('opAdjust')) + '</button><button class="btn secondary small" data-act="transfer">' + esc(t('opTransfer')) + '</button></span>') +
      '<div class="card"><div class="toolbar"><select id="wh"></select><input type="search" id="q" placeholder="' + esc(t('searchPh')) + '" value="' + esc(state.stockQ) + '" /><select id="catf"><option value="">' + esc(t('fCategory')) + ': ' + esc(t('all')) + '</option></select><label class="hint"><input type="checkbox" id="low"' + (state.stockLow ? ' checked' : '') + ' /> ' + esc(t('fLowOnly')) + '</label></div><div class="hint">' + esc(t('hStockFilters')) + '</div><div id="tbl" style="margin-top:8px">' + loadingHtml() + '</div><div id="sdetail" style="margin-top:10px"></div></div>' +
      '<div class="card"><h2>' + esc(t('hLedger')) + '</h2><div class="toolbar"><input type="search" id="msku" placeholder="' + esc(t('sku')) + '" value="' + esc(state.ledgerSku) + '" /><select id="mlim"><option>50</option><option>100</option><option>200</option><option>500</option></select><button class="btn secondary small" data-act="mload">' + esc(t('opLoad')) + '</button></div><div class="hint">' + esc(t('hMovGuards')) + '</div><div id="mov">' + emptyHtml() + '</div></div>' +
      '<div class="card"><h2>' + esc(t('hReceipts')) + '</h2><div id="rcp">' + loadingHtml() + '</div><div id="rdetail" style="margin-top:8px"></div></div>';
    var whEl = document.getElementById('wh');
    getWarehouses().then(function (list) {
      whEl.innerHTML = list.filter(function (w) { return w.is_active !== 0; }).map(function (w) { return '<option value="' + esc(w.code) + '">' + esc(w.code) + '</option>'; }).join('') || '<option>MAIN</option>';
      whEl.value = state.warehouse;
      return getCategories().then(function (cats) {
        var cf = document.getElementById('catf');
        if (cf) {
          cf.innerHTML = '<option value="">' + esc(t('fCategory')) + ': ' + esc(t('all')) + '</option>' + cats.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
          cf.value = state.stockCat || '';
        }
        var ml = document.getElementById('mlim');
        if (ml) ml.value = String(state.movLimit || 100);
        load();
        loadReceipts();
      });
    });
    whEl.addEventListener('change', function () { state.warehouse = whEl.value; load(); });
    document.getElementById('q').addEventListener('input', function (e) { state.stockQ = e.target.value; load(); });
    document.getElementById('catf').addEventListener('change', function (e) { state.stockCat = e.target.value; load(); });
    document.getElementById('low').addEventListener('change', function (e) { state.stockLow = e.target.checked; load(); });
    view.querySelector('[data-act="mload"]').addEventListener('click', function () {
      state.ledgerSku = document.getElementById('msku').value.trim();
      state.movLimit = Number(document.getElementById('mlim').value) || 100;
      loadMovements();
    });
    function load() {
      var tbl = document.getElementById('tbl');
      tbl.innerHTML = loadingHtml();
      Promise.all([
        unwrap(api.listStock(state.warehouse)).catch(function (e) { return { rows: [], _err: e }; }),
        unwrap(api.listProducts({ limit: 500 })).catch(function () { return []; }),
      ]).then(function (pair) {
        var stockRes = pair[0];
        if (stockRes._err) { tbl.innerHTML = '<div class="alert err">' + esc(errMsg(stockRes._err)) + '</div>'; return; }
        var srows = stockRes.rows || stockRes;
        var prods = pair[1].rows || pair[1] || [];
        var byId = {};
        prods.forEach(function (p) { byId[p.id] = p; });
        var bySku = {};
        prods.forEach(function (p) { bySku[p.sku] = p; });
        var q = (state.stockQ || '').trim().toLowerCase();
        var rows = srows.filter(function (r) {
          if (q && String(r.sku + ' ' + r.name).toLowerCase().indexOf(q) === -1) return false;
          var p = bySku[r.sku];
          if (state.stockCat && p) {
            var cid = p.categoryId != null ? p.categoryId : p.category_id;
            if (String(cid == null ? '' : cid) !== String(state.stockCat)) return false;
          }
          if (state.stockLow && p) {
            var min = p.minStock != null ? p.minStock : (p.min_stock != null ? p.min_stock : 0);
            if (!(Number(r.stock) <= Number(min))) return false;
          }
          return true;
        });
        if (!rows.length) { tbl.innerHTML = emptyHtml(); return; }
        tbl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>' + esc(t('name')) + '</th><th>' + esc(t('stock')) + '</th><th>' + esc(t('thAvail')) + '</th><th>' + esc(t('thMin')) + '</th><th>' + esc(t('thLow')) + '</th><th></th></tr></thead><tbody>' +
          rows.slice(0, 200).map(function (r) {
            var p = bySku[r.sku];
            var min = p ? (p.minStock != null ? p.minStock : (p.min_stock != null ? p.min_stock : 0)) : 0;
            var low = Number(r.stock) <= Number(min);
            return '<tr><td class="mono">' + esc(r.sku) + '</td><td>' + esc(r.name) + '</td><td class="num"><b>' + esc(r.stock) + '</b></td><td class="num">' + esc(r.stock) + '</td><td class="num">' + fmt(min) + '</td><td>' + (low ? '⚠️' : '—') + '</td>' +
              '<td><button class="btn ghost small" data-sdet="' + esc(r.sku) + '">' + esc(t('detail')) + '</button></td></tr>';
          }).join('') + '</tbody></table></div><div class="hint">' + rows.length + ' shown (cap 200) · avail = on-hand until reservations</div>';
      });
    }
    view.querySelector('#tbl').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sdet]');
      if (b) showStockDetail(b.getAttribute('data-sdet'));
    });
    function showStockDetail(sku) {
      var el = document.getElementById('sdetail');
      el.innerHTML = '<div class="card">' + loadingHtml() + '</div>';
      findProductBySku(sku).then(function (p) {
        return Promise.all([
          getWarehouses(),
          (typeof api.getStockLedger === 'function' ? unwrap(api.getStockLedger({ productId: p.id, limit: 100 })).catch(function (e) { return { _err: e }; }) : Promise.resolve(null)),
          (typeof api.listLots === 'function' ? unwrap(api.listLots(p.id, {})).catch(function () { return []; }) : Promise.resolve([])),
        ]).then(function (all) {
          var whs = all[0];
          var led = all[1];
          var lots = all[2] || [];
          var cur = whs.filter(function (w) { return w.code === state.warehouse; })[0];
          var avail = null;
          var jobs = [];
          if (cur && typeof api.getAvailableStock === 'function') jobs.push(unwrap(api.getAvailableStock(p.id, cur.id)).catch(function () { return null; }));
          return Promise.all(jobs).then(function (av) {
            avail = av.length ? av[0] : null;
            el.innerHTML = '<div class="card"><h3 class="mono">' + esc(p.sku) + ' · ' + esc(p.name) + '</h3>' +
              '<div class="hint mono">' + esc(t('warehouse')) + ' ' + esc(state.warehouse) + ' · ' + esc(t('hStockSub')) + ' · ' + esc(t('thAvail')) + ' ' + fmt(avail) + ' · ' + esc(t('fMinStock')) + ' ' + fmt(p.minStock != null ? p.minStock : p.min_stock) + ' · ' + esc(t('catLots')) + ' ' + lots.length + '</div>' +
              '<div class="grid-2" style="margin-top:8px"><div><h3>' + esc(t('catLots')) + '</h3>' + (lots.length ? '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fLot')) + '</th><th>' + esc(t('thExp')) + '</th><th>' + esc(t('stock')) + '</th></tr></thead><tbody>' + lots.slice(0, 10).map(function (x) { return '<tr><td class="mono">' + esc(x.lot_no || x.lotNo) + '</td><td class="mono">' + esc(fmtDate(x.expiry_date || x.expiryDate || '')) + '</td><td class="num">' + fmt(x.stock) + '</td></tr>'; }).join('') + '</tbody></table></div>' : emptyHtml()) + '</div>' +
              '<div><h3>' + esc(t('hLedger')) + ' (20)</h3>' + ledgerMini(led) + '</div></div>' +
              '<div class="row-actions" style="margin-top:8px"><button class="btn ghost small" data-sc>' + esc(t('close')) + '</button></div></div>';
            var c = el.querySelector('[data-sc]');
            if (c) c.addEventListener('click', function () { el.innerHTML = ''; });
            el.scrollIntoView({ block: 'nearest' });
          });
        });
      }).catch(function (e) { el.innerHTML = '<div class="card"><div class="alert err">' + esc(errMsg(e)) + '</div></div>'; });
      function ledgerMini(led) {
        if (!led || led._err) return '<div class="alert err">' + esc((led && led._err) ? errMsg(led._err) : t('empty')) + '</div>';
        var rows = (led.rows || led).slice(-20).reverse();
        if (!rows.length) return emptyHtml();
        return '<div class="table-wrap"><table><thead><tr><th>' + esc(t('thId')) + '</th><th>' + esc(t('qty')) + '</th><th>' + esc(t('fType')) + '</th><th>' + esc(t('thBalance')) + '</th></tr></thead><tbody>' +
          rows.map(function (m) { return '<tr><td>' + m.id + '</td><td class="num">' + fmt(m.qty) + '</td><td class="mono">' + esc(window.I18N.moveType(lang, m.movement_type)) + '</td><td class="num">' + fmt(m.balance_after) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }
    }
    function loadMovements() {
      var box = document.getElementById('mov');
      box.innerHTML = loadingHtml();
      var sku = (state.ledgerSku || '').trim();
      var lim = state.movLimit || 100;
      var pidP = sku ? findProductBySku(sku).then(function (p) { return p.id; }).catch(function (e) { throw e; }) : Promise.resolve(null);
      pidP.then(function (pid) {
        var opts = { limit: lim };
        if (pid !== null) opts.productId = pid;
        return getWarehouses().then(function (whs) {
          var cur = whs.filter(function (w) { return w.code === state.warehouse; })[0];
          if (cur) opts.warehouseId = cur.id;
          return unwrap(api.listMovements(opts));
        });
      }).then(function (rows) {
        if (!rows.length) { box.innerHTML = emptyHtml(); return; }
        box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('thId')) + '</th><th>' + esc(t('thProduct')) + '</th><th>' + esc(t('qty')) + '</th><th>' + esc(t('fType')) + '</th><th>' + esc(t('fReason')) + '</th><th>' + esc(t('ref')) + '</th><th></th></tr></thead><tbody>' +
          rows.slice(0, lim).map(function (m) {
            return '<tr><td>' + m.id + '</td><td>' + esc(String(m.product_id)) + '</td><td class="num">' + fmt(m.qty) + '</td><td class="mono">' + esc(window.I18N.moveType(lang, m.movement_type)) + '</td><td class="mono">' + esc(m.reason_code ? window.I18N.moveReason(lang, m.reason_code) : '') + '</td><td class="mono">' + esc((m.reference_type || '') + ':' + (m.reference_id || '')) + '</td>' +
              '<td><button class="btn ghost small" data-mrev="' + m.id + '">' + esc(t('reverse')) + '</button></td></tr>';
          }).join('') + '</tbody></table></div>';
      }).catch(function (e) { box.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    document.getElementById('mov').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mrev]');
      if (!b) return;
      var id = Number(b.getAttribute('data-mrev'));
      openModal({
        title: t('reverse') + ' #' + id, body: fld(t('cancelReason'), '<select name="reason"><option value="correction">' + esc(window.I18N.moveReason(lang, 'correction')) + '</option><option value="damaged">' + esc(window.I18N.moveReason(lang, 'damaged')) + '</option><option value="expired">' + esc(window.I18N.moveReason(lang, 'expired')) + '</option><option value="lost">' + esc(window.I18N.moveReason(lang, 'lost')) + '</option><option value="found">' + esc(window.I18N.moveReason(lang, 'found')) + '</option><option value="defective">' + esc(window.I18N.moveReason(lang, 'defective')) + '</option><option value="wrong_item">' + esc(window.I18N.moveReason(lang, 'wrong_item')) + '</option><option value="customer_request">' + esc(window.I18N.moveReason(lang, 'customer_request')) + '</option></select>') + '<div class="hint">receipt legs → cancelReceipt · transfer reverses whole pair · reversals never chain</div>',
        onOk: function (fd, close) {
          return unwrap(api.reverseStockMovement(id, String(fd.get('reason') || '').trim())).then(function () { toast('✓', 'ok'); close(); load(); loadMovements(); });
        }
      });
    });
    function loadReceipts() {
      var rcp = document.getElementById('rcp');
      unwrap(api.listReceipts({})).then(function (rows) {
        var list = rows || [];
        rcp.innerHTML = !list.length ? emptyHtml() : '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('supplier')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('date')) + '</th><th></th></tr></thead><tbody>' +
          list.slice(0, 20).map(function (r) { return '<tr><td class="mono">' + esc(r.receipt_no) + ' #' + r.id + '</td><td>' + esc(r.supplier_name || '') + '</td><td>' + badge(r.status) + '</td><td class="mono">' + esc(fmtDate(r.posted_at || '')) + '</td><td>' + (r.status === 'posted' ? '<button class="btn ghost small" data-rdet="' + r.id + '">' + esc(t('detail')) + '</button>' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }).catch(function (e) { rcp.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    document.getElementById('rcp').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rdet]');
      if (!b) return;
      var id = Number(b.getAttribute('data-rdet'));
      var el = document.getElementById('rdetail');
      el.innerHTML = loadingHtml();
      unwrap(api.getReceipt(id)).then(function (r) {
        var lines = r.lines || [];
        el.innerHTML = '<div class="card"><h3 class="mono">' + esc(r.receipt_no) + ' ' + badge(r.status) + '</h3><div class="table-wrap"><table><thead><tr><th>' + esc(t('sku')) + '</th><th>' + esc(t('qty')) + '</th><th>' + esc(t('thCost')) + '</th></tr></thead><tbody>' +
          lines.map(function (l) { return '<tr><td class="mono">' + esc(l.product_sku || l.product_id) + '</td><td class="num">' + fmt(l.qty) + '</td><td class="num">' + fmt(l.unit_cost != null ? l.unit_cost : l.unitCost) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          '<div class="row-actions" style="margin-top:8px"><button class="btn danger small" data-rcancel="' + r.id + '">' + esc(t('cancel')) + '</button><button class="btn ghost small" data-rclose>' + esc(t('close')) + '</button></div></div>';
        el.querySelector('[data-rclose]').addEventListener('click', function () { el.innerHTML = ''; });
        el.querySelector('[data-rcancel]').addEventListener('click', function () {
          openModal({
            title: t('del') + ' ' + r.receipt_no, body: fld(t('cancelReason'), '<input name="reason" required />') + '<div class="hint">' + esc(t('hCompensate')) + '</div>',
            okLabel: t('del'),
            onOk: function (fd, close) {
              var reason = String(fd.get('reason') || '').trim();
              if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
              return unwrap(api.cancelReceipt(r.id, reason)).then(function () { toast('✓', 'ok'); close(); el.innerHTML = ''; load(); loadReceipts(); loadMovements(); });
            }
          });
        });
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    });
    view.querySelector('[data-act="receive"]').addEventListener('click', function () {
      openModal({
        title: t('newReceipt'), body:
          fld(t('warehouse'), '<input name="warehouseCode" value="' + esc(state.warehouse) + '" />') +
          fld(t('supplier'), '<input name="supplierName" />') +
          fld('SKU*', '<input name="sku" required />') +
          fld(t('qty') + '*', '<input name="qty" value="10" inputmode="numeric" required />') +
          fld(t('fCost'), '<input name="unitCost" value="0" inputmode="numeric" />') +
          fld(t('fLot'), '<input name="lotNo" />') +
          fld(t('fExpiry'), '<input name="expiryDate" placeholder="YYYY-MM-DD" />') +
          fld(t('fSerials'), '<input name="serials" />'),
        onOk: function (fd, close) {
          var qty = parseIntField(fd.get('qty'), 'qty');
          var line = { sku: String(fd.get('sku') || '').trim(), qty: qty, unitCost: parseIntField(String(fd.get('unitCost') || '0').trim() === '' ? '0' : fd.get('unitCost'), 'unitCost') };
          var lotNo = String(fd.get('lotNo') || '').trim();
          if (lotNo !== '') {
            var spec = { lotNo: lotNo };
            var ex = String(fd.get('expiryDate') || '').trim();
            if (ex !== '') spec.expiryDate = ex;
            line.lot = spec;
          }
          var ser = String(fd.get('serials') || '').trim();
          if (ser !== '') line.serials = ser.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
          return unwrap(api.receiveStock({
            warehouseCode: String(fd.get('warehouseCode') || 'MAIN').trim() || 'MAIN',
            supplierName: String(fd.get('supplierName') || ''),
            lines: [line],
          })).then(function (r) { toast('✓ ' + r.receipt_no, 'ok'); close(); load(); loadReceipts(); });
        }
      });
    });
    view.querySelector('[data-act="issue"]').addEventListener('click', function () {
      openModal({
        title: t('opIssue'), body:
          fld('SKU*', '<input name="sku" required />') +
          fld(t('qty') + '*', '<input name="qty" required inputmode="numeric" />') +
          fld(t('cancelReason'), '<select name="reason"><option value="correction">' + esc(window.I18N.moveReason(lang, 'correction')) + '</option><option value="damaged">' + esc(window.I18N.moveReason(lang, 'damaged')) + '</option><option value="expired">' + esc(window.I18N.moveReason(lang, 'expired')) + '</option><option value="lost">' + esc(window.I18N.moveReason(lang, 'lost')) + '</option><option value="found">' + esc(window.I18N.moveReason(lang, 'found')) + '</option><option value="defective">' + esc(window.I18N.moveReason(lang, 'defective')) + '</option><option value="wrong_item">' + esc(window.I18N.moveReason(lang, 'wrong_item')) + '</option><option value="customer_request">' + esc(window.I18N.moveReason(lang, 'customer_request')) + '</option></select>') +
          fld(t('fLot'), '<input name="lotId" />') +
          fld(t('fSerials'), '<input name="serials" />'),
        onOk: function (fd, close) {
          var q = parseIntField(fd.get('qty'), 'qty');
          if (q <= 0) throw window.I18N.ex('errPositive', { field: t('qty') });
          var args = { sku: String(fd.get('sku') || '').trim(), warehouseCode: state.warehouse, reason: String(fd.get('reason') || '').trim(), qty: q };
          var lotRaw = String(fd.get('lotId') || '').trim();
          if (lotRaw !== '') args.lots = [{ lotId: Number(lotRaw), qty: q }];
          var ser = String(fd.get('serials') || '').trim();
          if (ser !== '') args.serials = ser.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
          return unwrap(api.issueStock(args)).then(function () { toast('✓', 'ok'); close(); load(); loadMovements(); });
        }
      });
    });
    view.querySelector('[data-act="adjust"]').addEventListener('click', function () {
      openModal({
        title: t('opAdjust'), body:
          fld('SKU*', '<input name="sku" required />') +
          fld(t('qty') + '* (!=0)', '<input name="qty" required inputmode="numeric" />') +
          fld(t('cancelReason'), '<select name="reason"><option value="correction">' + esc(window.I18N.moveReason(lang, 'correction')) + '</option><option value="damaged">' + esc(window.I18N.moveReason(lang, 'damaged')) + '</option><option value="expired">' + esc(window.I18N.moveReason(lang, 'expired')) + '</option><option value="lost">' + esc(window.I18N.moveReason(lang, 'lost')) + '</option><option value="found">' + esc(window.I18N.moveReason(lang, 'found')) + '</option><option value="defective">' + esc(window.I18N.moveReason(lang, 'defective')) + '</option><option value="wrong_item">' + esc(window.I18N.moveReason(lang, 'wrong_item')) + '</option><option value="customer_request">' + esc(window.I18N.moveReason(lang, 'customer_request')) + '</option></select>') +
          fld(t('fLot'), '<input name="lotId" />'),
        onOk: function (fd, close) {
          var q = parseIntField(fd.get('qty'), 'qty');
          if (q === 0) throw window.I18N.ex('errInteger', { field: t('qty') });
          var args = { sku: String(fd.get('sku') || '').trim(), warehouseCode: state.warehouse, reason: String(fd.get('reason') || '').trim(), qty: q };
          var lotRaw = String(fd.get('lotId') || '').trim();
          if (lotRaw !== '') args.lots = [{ lotId: Number(lotRaw), qty: q }];
          return unwrap(api.adjustStock(args)).then(function () { toast('✓', 'ok'); close(); load(); loadMovements(); });
        }
      });
    });
    view.querySelector('[data-act="transfer"]').addEventListener('click', function () {
      openModal({
        title: t('opTransfer'), sub: t('hNoSerialTransfer'),
        body:
          fld('SKU*', '<input name="sku" required />') +
          fld(t('qty') + '*', '<input name="qty" required inputmode="numeric" />') +
          fld(t('warehouse'), '<input name="toWarehouseCode" required />') +
          fld(t('fLot'), '<input name="lotId" />') +
          fld(t('fTransferNo'), '<input name="transferNo" />') +
          fld(t('fNotes'), '<input name="reason" />'),
        onOk: function (fd, close) {
          var q = parseIntField(fd.get('qty'), 'qty');
          if (q <= 0) throw window.I18N.ex('errPositive', { field: t('qty') });
          var args = { sku: String(fd.get('sku') || '').trim(), fromWarehouseCode: state.warehouse, toWarehouseCode: String(fd.get('toWarehouseCode') || '').trim(), qty: Math.abs(q), reason: String(fd.get('reason') || '').trim() };
          var lotRaw = String(fd.get('lotId') || '').trim();
          if (lotRaw !== '') args.lots = [{ lotId: Number(lotRaw), qty: Math.abs(q) }];
          var tn = String(fd.get('transferNo') || '').trim();
          if (tn !== '') args.transferNo = tn;
          return unwrap(api.transferStock(args)).then(function (tr) { toast('✓ ' + (tr.transfer_no || tr.transferNo || ''), 'ok'); close(); load(); loadMovements(); });
        }
      });
    });
  }

  var SALES_TYPES = ['sales_quote', 'sales_order', 'delivery_note', 'sales_invoice', 'proforma_invoice'];
  function renderSales() {
    var tabs = ['all'].concat(SALES_TYPES);
    view.innerHTML = pageHead(t('sales'), t('hSalesFlow') + ' · ' + t('lines') + ' · ' + t('print'), '<span class="row-actions"><button class="btn secondary small" data-act="multi-inv">' + esc(t('invoice')) + '</button><button class="btn small" data-act="new">' + esc(t('newSale')) + '</button></span>') +
      '<div class="card"><div class="toolbar"><div class="tabs">' + tabs.map(function (x) { return '<button class="tab' + (state.salesType === x ? ' active' : '') + '" data-tab="' + x + '">' + esc(x === 'all' ? t('all') : window.I18N.docType(lang, x)) + '</button>'; }).join('') + '</div><input type="search" id="q" placeholder="' + esc(t('searchPh')) + '" /></div><div id="tbl">' + loadingHtml() + '</div><div id="sdetail" style="margin-top:10px"></div></div>';
    function load() {
      var tbl = document.getElementById('tbl');
      if (!tbl) return;
      tbl.innerHTML = loadingHtml();
      unwrap(api.listDocuments({})).then(function (docs) {
        var rows = docs.filter(function (d) { return SALES_TYPES.indexOf(docTypeOf(d)) !== -1; });
        if (state.salesType !== 'all') rows = rows.filter(function (d) { return docTypeOf(d) === state.salesType; });
        var qEl = document.getElementById('q');
        var q = qEl ? qEl.value.trim().toLowerCase() : '';
        if (q) rows = rows.filter(function (d) { return String(docNoOf(d)).toLowerCase().indexOf(q) !== -1; });
        if (!rows.length) { tbl.innerHTML = emptyHtml(); return; }
        tbl.innerHTML = '<div class="table-wrap"><table><thead><tr><th><input type="checkbox" data-checkall aria-label="' + esc(t('all')) + '" /></th><th>' + esc(t('ref')) + '</th><th>' + esc(t('fType')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('total')) + '</th><th>' + esc(t('actions')) + '</th></tr></thead><tbody>' +
          rows.slice(0, 60).map(function (d) {
            var acts = allowedDocActions(d).filter(function (a) { return a.action !== 'detail' && a.action !== 'print' && a.action !== 'editHead'; });
            var btns = '<button class="btn ghost small" data-sdetail="' + d.id + '">' + esc(t('detail')) + '</button>';
            acts.forEach(function (a) { btns += ' <button class="btn ghost small" data-sact="' + a.action + '" data-id="' + d.id + '">' + esc(a.label) + '</button>'; });
            return '<tr><td><input type="checkbox" data-pick="' + d.id + '" data-type="' + esc(docTypeOf(d)) + '" data-status="' + esc(d.status) + '" /></td><td class="mono">' + esc(docNoOf(d)) + ' <span class="hint">#' + d.id + '</span></td><td class="mono">' + esc(window.I18N.docType(lang, docTypeOf(d))) + '</td><td>' + badge(d.status) + '</td><td class="num">' + fmt(totalsOf(d).grand) + '</td>' +
              '<td><div class="row-actions">' + btns + '</div></td></tr>';
          }).join('') + '</tbody></table></div><div class="hint">' + esc(t('hPostedFlow')) + '</div>';
        var all = tbl.querySelector('[data-checkall]');
        if (all) all.addEventListener('change', function () {
          tbl.querySelectorAll('[data-pick]').forEach(function (c) { c.checked = all.checked; });
        });
      }).catch(function (e) { tbl.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    view.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.salesType = b.getAttribute('data-tab'); renderSales(); });
    });
    document.getElementById('q').addEventListener('input', load);
    view.querySelector('[data-act="new"]').addEventListener('click', function () {
      openModal({
        title: t('newSale'), body:
          fld(t('customer') + ' ' + t('fCode') + '*', '<input name="customerCode" required />') +
          fld('SKU*', '<input name="sku" required />') +
          fld(t('qty') + '*', '<input name="qty" value="1" inputmode="numeric" />') +
          fld(t('price'), '<input name="unitPrice" value="0" inputmode="numeric" />'),
        onOk: function (fd, close) {
          var sku = String(fd.get('sku') || '').trim();
          var cc = String(fd.get('customerCode') || '').trim();
          return findProductBySku(sku).then(function (p) {
            return findPartyByCode(cc).then(function (cust) {
              var qty = parseIntField(fd.get('qty'), 'qty');
              var upRaw = String(fd.get('unitPrice') || '0').trim();
              var up = upRaw === '' ? 0 : parseIntField(upRaw, 'unitPrice');
              var priceP = (typeof api.resolveSalePrice === 'function' && !up)
                ? unwrap(api.resolveSalePrice({ productId: p.id, customerCode: cust.code })).then(function (r) { return r.unitPrice || 0; })
                : Promise.resolve(up);
              return priceP.then(function (unitPrice) {
                return unwrap(api.createDocument({ type: 'sales_order', partyId: cust.id, lines: [{ productId: p.id, qty: qty, unitPrice: unitPrice }] }));
              });
            });
          }).then(function (c) { toast('✓ ' + docNoOf(c) + ' (' + t('stDraft') + ')', 'ok'); close(); load(); showDocDetail('sdetail', c.id, load); bindDocDetail('sdetail', load); });
        }
      });
    });
    view.querySelector('[data-act="multi-inv"]').addEventListener('click', function () {
      var picks = Array.prototype.slice.call(view.querySelectorAll('[data-pick]:checked')).map(function (c) { return Number(c.getAttribute('data-pick')); });
      if (!picks.length) { toast(t('empty'), 'err'); return; }
      confirmDialog(t('invoice'), picks.length + ' ' + t('hMultiInv'), t('invoice')).then(function (ok) {
        if (!ok) return;
        unwrap(api.convertDeliveriesToInvoice(picks, {})).then(function (inv) {
          return unwrap(api.confirmDocument(inv.id)).then(function () { return unwrap(api.postInvoice(inv.id)); }).then(function (posted) {
            toast('✓ ' + docNoOf(posted), 'ok'); load(); showDocDetail('sdetail', posted.id, load); bindDocDetail('sdetail', load);
          });
        }).catch(function (err) { toast(errMsg(err), 'err'); });
      });
    });
    bindDocDetail('sdetail', load);
    var card = view.querySelector('.card');
    card.addEventListener('click', function (e) {
      var dd = e.target.closest('[data-sdetail]');
      if (dd) { showDocDetail('sdetail', Number(dd.getAttribute('data-sdetail')), load); return; }
      var b = e.target.closest('[data-sact]');
      if (!b || b.disabled) return;
      (function (btn) {
        var action = btn.getAttribute('data-sact');
        var id = Number(btn.getAttribute('data-id'));
        if (action === 'cancel') {
          openModal({
            title: t('del') + ' #' + id, body: fld(t('cancelReason'), '<input name="reason" required />'),
            okLabel: t('del'),
            onOk: function (fd, close) {
              var reason = String(fd.get('reason') || '').trim();
              if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
              return unwrap(api.cancelDocument(id, reason)).then(function () { toast('✓', 'ok'); close(); load(); });
            }
          });
          return;
        }
        if (action === 'deliver' || action === 'invoice' || action === 'detail' || action === 'print' || action === 'editHead') {
          showDocDetail('sdetail', id, load);
          if (action === 'deliver') toast(t('hUseDetail'), '');
          return;
        }
        withBtnBusy(btn, function () {
          var p;
          if (action === 'confirm') p = unwrap(api.confirmDocument(id));
          else if (action === 'post') p = unwrap(api.postDocument(id));
          else if (action === 'postDelivery') p = unwrap(api.postDeliveryNote(id, {}));
          else return;
          return p.then(function () { toast('✓', 'ok'); load(); });
        });
      })(b);
    });
    load();
  }

  function renderPurchases() {
    view.innerHTML = pageHead(t('purchases'), t('hPurchaseFlow') + ' · ' + t('lines') + ' · ' + t('print'), '<button class="btn small" data-act="new">' + esc(t('newPurchase')) + '</button>') +
      '<div class="card"><div id="tbl">' + loadingHtml() + '</div><div id="pdetail" style="margin-top:10px"></div></div>';
    function load() {
      var tbl = document.getElementById('tbl');
      if (!tbl) return;
      tbl.innerHTML = loadingHtml();
      unwrap(api.listDocuments({})).then(function (docs) {
        var rows = docs.filter(function (d) { return docTypeOf(d) === 'purchase_order'; });
        if (!rows.length) { tbl.innerHTML = emptyHtml(); return; }
        tbl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('supplier')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('total')) + '</th><th>' + esc(t('actions')) + '</th></tr></thead><tbody>' +
          rows.slice(0, 60).map(function (d) {
            var acts = allowedDocActions(d).filter(function (a) { return a.action !== 'detail' && a.action !== 'print' && a.action !== 'editHead'; });
            var btns = '<button class="btn ghost small" data-pdetail="' + d.id + '">' + esc(t('detail')) + '</button>';
            acts.forEach(function (a) { btns += ' <button class="btn ghost small" data-pact="' + a.action + '" data-id="' + d.id + '">' + esc(a.label) + '</button>'; });
            return '<tr><td class="mono">' + esc(docNoOf(d)) + ' #' + d.id + '</td><td>' + esc(d.partyId != null ? d.partyId : (d.party_id != null ? d.party_id : '')) + '</td><td>' + badge(d.status) + '</td><td class="num">' + fmt(totalsOf(d).grand) + '</td><td><div class="row-actions">' + btns + '</div></td></tr>';
          }).join('') + '</tbody></table></div>';
      }).catch(function (e) { tbl.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    view.querySelector('[data-act="new"]').addEventListener('click', function () {
      openModal({
        title: t('newPurchase'), body:
          fld(t('supplier') + ' ' + t('fCode') + '*', '<input name="supplierCode" required />') +
          fld('SKU*', '<input name="sku" required />') +
          fld(t('qty') + '*', '<input name="qty" value="10" inputmode="numeric" />') +
          fld(t('fCost'), '<input name="unitCost" value="0" inputmode="numeric" />'),
        onOk: function (fd, close) {
          return findProductBySku(String(fd.get('sku') || '').trim()).then(function (p) {
            return findPartyByCode(String(fd.get('supplierCode') || '').trim()).then(function (s) {
              return unwrap(api.createDocument({
                type: 'purchase_order', partyId: s.id,
                lines: [{ productId: p.id, qty: parseIntField(fd.get('qty'), 'qty'), unitPrice: parseIntField(String(fd.get('unitCost') || '0').trim() === '' ? '0' : fd.get('unitCost'), 'unitCost') }]
              }));
            });
          }).then(function (c) { toast('✓ ' + docNoOf(c) + ' (draft)', 'ok'); close(); load(); showDocDetail('pdetail', c.id, load); bindDocDetail('pdetail', load); });
        }
      });
    });
    bindDocDetail('pdetail', load);
    var card = view.querySelector('.card');
    card.addEventListener('click', function (e) {
      var dd = e.target.closest('[data-pdetail]');
      if (dd) { showDocDetail('pdetail', Number(dd.getAttribute('data-pdetail')), load); return; }
      var b = e.target.closest('[data-pact]');
      if (!b || b.disabled) return;
      (function (btn) {
        var a = btn.getAttribute('data-pact');
        var id = Number(btn.getAttribute('data-id'));
        if (a === 'cancel') {
          openModal({
            title: t('del') + ' #' + id, body: fld(t('cancelReason'), '<input name="reason" required />'),
            okLabel: t('del'),
            onOk: function (fd, close) {
              var reason = String(fd.get('reason') || '').trim();
              if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
              return unwrap(api.cancelDocument(id, reason)).then(function () { toast('✓', 'ok'); close(); load(); });
            }
          });
          return;
        }
        if (a === 'deliver' || a === 'invoice' || a === 'detail' || a === 'print' || a === 'editHead') { showDocDetail('pdetail', id, load); return; }
        withBtnBusy(btn, function () {
          var p;
          if (a === 'confirm') p = unwrap(api.confirmDocument(id));
          else if (a === 'post' || a === 'postDelivery') p = (docTypeOf({ docType: 'purchase_order' }) === 'delivery_note') ? unwrap(api.postDeliveryNote(id, {})) : unwrap(api.postDocument(id));
          else return;
          return p.then(function () { toast('✓', 'ok'); load(); });
        });
      })(b);
    });
    load();
  }

  function renderParties() {
    var tabs = ['all', 'customer', 'supplier'];
    view.innerHTML = pageHead(t('parties'), t('roleCustomer') + ' / ' + t('roleSupplier'), '<button class="btn small" data-act="new">' + esc(t('newParty')) + '</button>') +
      '<div class="card"><div class="toolbar"><div class="tabs">' + tabs.map(function (x) { return '<button class="tab' + (state.partyRole === x ? ' active' : '') + '" data-tab="' + x + '">' + esc(x === 'all' ? t('all') : window.I18N.partyRole(lang, x)) + '</button>'; }).join('') + '</div><input type="search" id="q" placeholder="' + esc(t('searchPh')) + '" /></div><div id="tbl">' + loadingHtml() + '</div></div>';
    view.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.partyRole = b.getAttribute('data-tab'); renderParties(); });
    });
    function load(q) {
      var tbl = document.getElementById('tbl');
      tbl.innerHTML = loadingHtml();
      unwrap(api.listParties(q ? { search: q } : {})).then(function (res) {
        var rows = res.rows || res;
        if (state.partyRole !== 'all') rows = rows.filter(function (p) { return (p.roles || []).indexOf(state.partyRole) !== -1; });
        if (!rows.length) { tbl.innerHTML = emptyHtml(); return; }
        tbl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('name')) + '</th><th>' + esc(t('thRoles')) + '</th><th>' + esc(t('fPhone')) + '</th></tr></thead><tbody>' +
          rows.slice(0, 100).map(function (p) { return '<tr><td class="mono">' + esc(p.code) + '</td><td>' + esc(p.display_name || p.displayName) + '</td><td>' + esc((p.roles || []).map(function (r) { return window.I18N.partyRole(lang, r); }).join(', ')) + '</td><td>' + esc(p.phone || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }).catch(function (e) { tbl.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    var deb = null;
    document.getElementById('q').addEventListener('input', function (e) { clearTimeout(deb); deb = setTimeout(function () { load(e.target.value.trim()); }, 250); });
    view.querySelector('[data-act="new"]').addEventListener('click', function () {
      openModal({
        title: t('newParty'), body:
          fld(t('name') + '*', '<input name="displayName" required maxlength="200" />') +
          fld(t('fRole'), '<select name="role"><option value="customer">' + esc(window.I18N.partyRole(lang, 'customer')) + '</option><option value="supplier">' + esc(window.I18N.partyRole(lang, 'supplier')) + '</option><option value="both">' + esc(t('roleBoth')) + '</option></select>') +
          fld(t('fPhone'), '<input name="phone" maxlength="32" />'),
        onOk: function (fd, close) {
          var role = String(fd.get('role') || 'customer');
          return unwrap(api.createParty({
            displayName: String(fd.get('displayName') || '').trim(),
            roles: role === 'both' ? ['customer', 'supplier'] : [role],
            phone: String(fd.get('phone') || '').trim()
          })).then(function (c) { toast('✓ ' + c.code, 'ok'); close(); load(''); });
        }
      });
    });
    load('');
  }

  function renderCash() {
    var tabs = [['payments', 'payments'], ['returns', 'returns'], ['balances', 'balances'], ['accounts', 'accounts'], ['expenses', 'expenses']];
    view.innerHTML = pageHead(t('cash'), t('hCashSub'), '<span class="row-actions"><button class="btn small" data-act="pay">' + esc(t('newPayment')) + '</button><button class="btn secondary small" data-act="exp">' + esc(t('newExpense')) + '</button></span>') +
      '<div class="card"><div class="toolbar"><div class="tabs" role="tablist">' + tabs.map(function (x) { return '<button class="tab' + (state.cashTab === x[0] ? ' active' : '') + '" role="tab" aria-selected="' + (state.cashTab === x[0]) + '" data-tab="' + x[0] + '">' + esc(t(x[1])) + '</button>'; }).join('') + '</div></div><div id="tbl">' + loadingHtml() + '</div><div id="cdetail" style="margin-top:10px"></div></div>';
    view.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.cashTab = b.getAttribute('data-tab'); renderCash(); });
    });
    bindDocDetail('cdetail', function () { renderCash(); });
    if (state.cashTab === 'payments') cashPaymentsTab();
    else if (state.cashTab === 'returns') cashReturnsTab();
    else if (state.cashTab === 'balances') cashBalancesTab();
    else if (state.cashTab === 'accounts') cashAccountsTab();
    else cashExpensesTab();
    view.querySelector('[data-act="pay"]').addEventListener('click', openRecordPayment);
    view.querySelector('[data-act="exp"]').addEventListener('click', function () {
      unwrap(api.listExpenseCategories()).then(function (cats) {
        if (!cats.length) { toast(t('empty'), 'err'); return; }
        openModal({
          title: t('newExpense'), body:
          fld(t('fCategory'), '<select name="categoryCode">' + cats.map(function (c) { return '<option value="' + esc(c.code) + '">' + esc(c.name || c.code) + '</option>'; }).join('') + '</select>') +
          fld(t('total') + '*', '<input name="amount" required inputmode="numeric" />') +
          fld(t('fMethod'), '<select name="method"><option value="cash">' + esc(window.I18N.payMethod(lang, 'cash')) + '</option><option value="bank_transfer">' + esc(window.I18N.payMethod(lang, 'bank_transfer')) + '</option><option value="check">' + esc(window.I18N.payMethod(lang, 'check')) + '</option></select>') +
          fld(t('fCashAccount'), '<input name="cashAccountCode" value="TILL" />') +
          fld(t('fNotes'), '<input name="notes" maxlength="200" />'),
        onOk: function (fd, close) {
          var method = String(fd.get('method') || 'cash');
          return unwrap(api.createExpense({
            categoryCode: String(fd.get('categoryCode') || ''),
            amount: parseIntField(fd.get('amount'), 'amount'),
            method: method,
            cashAccountCode: method === 'cash' ? (String(fd.get('cashAccountCode') || '').trim() || null) : null,
            notes: String(fd.get('notes') || '').trim()
          })).then(function (c) { toast('✓ ' + c.expense_no, 'ok'); close(); renderCash(); });
        }
        });
      }).catch(function (err) { toast(errMsg(err), 'err'); });
    });
  }
  function cashPaymentsTab() {
    var tbl = document.getElementById('tbl');
    tbl.innerHTML = loadingHtml();
    unwrap(api.listPayments({})).then(function (rows) {
      if (!rows.length) { tbl.innerHTML = emptyHtml(); return; }
      tbl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('fDirection')) + '</th><th>' + esc(t('fParty')) + '</th><th>' + esc(t('total')) + '</th><th>' + esc(t('fMethod')) + '</th><th>' + esc(t('status')) + '</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 60).map(function (x) {
          return '<tr><td class="mono">' + esc(x.payment_no) + ' <span class="hint">#' + x.id + '</span></td><td>' + esc(x.direction === 'in' ? t('dirIn') : (x.direction === 'out' ? t('dirOut') : x.direction)) + '</td><td>' + esc(String(x.party_id != null ? x.party_id : (x.partyId != null ? x.partyId : ''))) + '</td><td class="num">' + fmt(x.amount) + '</td><td>' + esc(window.I18N.payMethod(lang, x.method)) + '</td><td>' + badge(x.status) + '</td>' +
            '<td><div class="row-actions"><button class="btn ghost small" data-paydetail="' + x.id + '">' + esc(t('detail')) + '</button>' + (x.status === 'posted' ? '<button class="btn ghost small" data-payrev="' + x.id + '">' + esc(t('reverse')) + '</button>' : '') + '</div></td></tr>';
        }).join('') + '</tbody></table></div><div class="hint">' + esc(t('hCashSub')) + '</div>';
    }).catch(function (e) { tbl.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    tbl.addEventListener('click', function (e) {
      var dd = e.target.closest('[data-paydetail]');
      if (dd) { showPaymentDetail(Number(dd.getAttribute('data-paydetail'))); return; }
      var rv = e.target.closest('[data-payrev]');
      if (rv) {
        (function (id) {
          openModal({
            title: t('reverse') + ' #' + id, body: fld(t('cancelReason'), '<input name="reason" required maxlength="1000" />') + '<div class="hint">links removed · cash compensated · row cancelled, never deleted</div>',
            okLabel: t('reverse'),
            onOk: function (fd, close) {
              var reason = String(fd.get('reason') || '').trim();
              if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
              return unwrap(api.reversePayment(id, reason)).then(function (r) { toast('✓ ' + r.payment_no + ' cancelled', 'ok'); close(); renderCash(); });
            }
          });
        })(Number(rv.getAttribute('data-payrev')));
      }
    });
  }
  function showPaymentDetail(id) {
    var el = document.getElementById('cdetail');
    el.innerHTML = '<div class="card">' + loadingHtml() + '</div>';
    unwrap(api.getPayment(id)).then(function (p) {
      var allocs = p.allocations || [];
      el.innerHTML = '<div class="card"><h3>' + esc(p.payment_no) + ' ' + badge(p.status) + '</h3>' +
        '<div class="hint mono">' + esc(t('thId')) + ' ' + p.id + ' · ' + esc(p.direction === 'in' ? t('dirIn') : (p.direction === 'out' ? t('dirOut') : p.direction)) + ' · ' + esc(t('fParty')) + ' ' + esc(String(p.party_id != null ? p.party_id : p.partyId)) + ' · ' + esc(p.method ? window.I18N.payMethod(lang, p.method) : '') + ' · ' + esc(t('fAmount')) + ' ' + fmt(p.amount) + ' · ' + esc(t('fDate')) + ' ' + esc(fmtDate(p.payment_date || p.paymentDate || '')) + '</div>' +
        '<h3>' + esc(t('allocation')) + ' (' + allocs.length + ')</h3>' +
        (!allocs.length ? '<div class="hint">' + esc(t('onAccount')) + '</div>' : '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fTarget')) + '</th><th>' + esc(t('thId')) + '</th><th>' + esc(t('fAmount')) + '</th></tr></thead><tbody>' +
          allocs.map(function (a) { return '<tr><td class="mono">' + esc(a.target_type || a.targetType) + '</td><td>' + esc(String(a.target_id != null ? a.target_id : a.targetId)) + '</td><td class="num">' + fmt(a.amount) + '</td></tr>'; }).join('') + '</tbody></table></div>') +
        '<div class="row-actions" style="margin-top:8px">' + (p.status === 'posted' ? '<button class="btn danger small" data-prev="' + p.id + '">' + esc(t('reverse')) + '</button>' : '<span class="hint">cancelled · allocations cleared</span>') +
        ' <button class="btn ghost small" data-pclose>' + esc(t('close')) + '</button></div></div>';
      var c = el.querySelector('[data-pclose]');
      if (c) c.addEventListener('click', function () { el.innerHTML = ''; });
      var r = el.querySelector('[data-prev]');
      if (r) r.addEventListener('click', function () {
        openModal({
          title: t('reverse') + ' ' + p.payment_no, body: fld(t('cancelReason'), '<input name="reason" required />'),
          okLabel: t('reverse'),
          onOk: function (fd, close) {
            var reason = String(fd.get('reason') || '').trim();
            if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
            return unwrap(api.reversePayment(p.id, reason)).then(function () { toast('✓', 'ok'); close(); renderCash(); });
          }
        });
      });
      el.scrollIntoView({ block: 'nearest' });
    }).catch(function (e) { el.innerHTML = '<div class="card"><div class="alert err">' + esc(errMsg(e)) + '</div></div>'; });
  }
  function openRecordPayment() {
    openModal({
      title: t('newPayment'),           sub: t('hAllocRule'),
      body:
        fld(t('fParty'), '<input name="partyCode" required />') +
        fld(t('fDirection'), '<select name="direction"><option value="in">' + esc(t('dirIn')) + '</option><option value="out">' + esc(t('dirOut')) + '</option></select>') +
        fld(t('fMethod'), '<select name="method"><option value="cash">' + esc(window.I18N.payMethod(lang, 'cash')) + '</option><option value="bank_transfer">' + esc(window.I18N.payMethod(lang, 'bank_transfer')) + '</option><option value="check">' + esc(window.I18N.payMethod(lang, 'check')) + '</option></select>') +
        fld(t('fCashAccount'), '<input name="cashAccountCode" value="TILL" />') +
        fld(t('total'), '<input name="amount" required inputmode="numeric" />') +
        fld(t('fDate'), '<input name="paymentDate" placeholder="YYYY-MM-DD" />') +
        fld(t('allocation') + ' 1', '<select name="t1"><option value="">—</option><option value="sales_invoice">' + esc(window.I18N.docType(lang, 'sales_invoice')) + '</option><option value="purchase_receipt">' + esc(window.I18N.docType(lang, 'purchase_receipt')) + '</option></select>') +
        fld(t('thId') + ' + ' + t('fAmount') + ' 1', '<div style="display:flex;gap:6px"><input name="i1" inputmode="numeric" placeholder="' + esc(t('thId')) + '" /><input name="a1" inputmode="numeric" placeholder="' + esc(t('fAmount')) + '" /></div>') +
        fld(t('allocation') + ' 2', '<select name="t2"><option value="">—</option><option value="sales_invoice">' + esc(window.I18N.docType(lang, 'sales_invoice')) + '</option><option value="purchase_receipt">' + esc(window.I18N.docType(lang, 'purchase_receipt')) + '</option></select>') +
        fld(t('thId') + ' + ' + t('fAmount') + ' 2', '<div style="display:flex;gap:6px"><input name="i2" inputmode="numeric" placeholder="' + esc(t('thId')) + '" /><input name="a2" inputmode="numeric" placeholder="' + esc(t('fAmount')) + '" /></div>'),
      onOk: function (fd, close) {
        var amount = parseIntField(fd.get('amount'), 'amount');
        if (amount <= 0) throw window.I18N.ex('errPositive', { field: t('fAmount') });
        var allocs = [];
        [['t1', 'i1', 'a1'], ['t2', 'i2', 'a2']].forEach(function (k) {
          var tt = String(fd.get(k[0]) || '').trim();
          var ii = String(fd.get(k[1]) || '').trim();
          var aa = String(fd.get(k[2]) || '').trim();
          if (!tt && !ii && !aa) return;
          if (!tt || !ii || !aa) throw window.I18N.ex('errAllocIncomplete');
          allocs.push({ targetType: tt, targetId: parseIntField(ii, 'targetId'), amount: parseIntField(aa, 'allocAmount') });
        });
        var sum = allocs.reduce(function (n, a) { return n + a.amount; }, 0);
        if (sum > amount) throw window.I18N.ex('errAllocExceed');
        return findPartyByCode(String(fd.get('partyCode') || '').trim()).then(function (party) {
          var method = String(fd.get('method') || 'cash');
          var input = {
            direction: String(fd.get('direction') || 'in').split(' ')[0], partyId: party.id,
            method: method,
            cashAccountCode: method === 'cash' ? (String(fd.get('cashAccountCode') || '').trim() || null) : null,
            amount: amount, allocations: allocs,
          };
          var dd = String(fd.get('paymentDate') || '').trim();
          if (dd !== '') input.paymentDate = dd;
          return unwrap(api.recordPayment(input));
        }).then(function (c) { toast('✓ ' + c.payment_no, 'ok'); close(); renderCash(); });
      }
    });
  }
  function cashReturnsTab() {
    var el = document.getElementById('tbl');
    el.innerHTML = '<div class="grid-2"><div class="card"><h3>' + esc(t('returns')) + '</h3><div class="toolbar"><button class="btn small" data-act="newret">' + esc(t('custReturn')) + '</button></div><div id="rets">' + loadingHtml() + '</div></div>' +
      '<div class="card"><h3>' + esc(t('suppReturn')) + ' (' + esc(t('hLedgerMove')) + ')</h3><form class="f" id="sret"><div class="f-grid">' +
      fld(t('fDoc'), '<input name="receiptId" required inputmode="numeric" />') +
      fld('SKU*', '<input name="sku" required />') +
      fld(t('qty') + '*', '<input name="qty" value="1" inputmode="numeric" />') +
      fld(t('cancelReason'), '<select name="reason"><option value="defective">' + esc(window.I18N.moveReason(lang, 'defective')) + '</option><option value="damaged">' + esc(window.I18N.moveReason(lang, 'damaged')) + '</option><option value="expired">' + esc(window.I18N.moveReason(lang, 'expired')) + '</option><option value="wrong_item">' + esc(window.I18N.moveReason(lang, 'wrong_item')) + '</option><option value="correction">' + esc(window.I18N.moveReason(lang, 'correction')) + '</option><option value="lost">' + esc(window.I18N.moveReason(lang, 'lost')) + '</option><option value="found">' + esc(window.I18N.moveReason(lang, 'found')) + '</option><option value="customer_request">' + esc(window.I18N.moveReason(lang, 'customer_request')) + '</option></select>') +
      '</div><div><button class="btn secondary small" type="submit">' + esc(t('post')) + '</button></div><div class="msg" id="smsg"></div></form><div class="hint">bounded by receipt remaining · pool checked · serials enforced by server</div></div></div>';
    function loadRets() {
      var box = document.getElementById('rets');
      unwrap(api.listDocuments({})).then(function (docs) {
        var rows = docs.filter(function (d) { return docTypeOf(d) === 'customer_return'; });
        if (!rows.length) { box.innerHTML = emptyHtml(); return; }
        box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('fDoc')) + '</th><th>' + esc(t('total')) + '</th><th></th></tr></thead><tbody>' +
          rows.slice(0, 40).map(function (d) { return '<tr><td class="mono">' + esc(docNoOf(d)) + ' #' + d.id + '</td><td>' + badge(d.status) + '</td><td>' + esc(String(d.sourceDocId || d.source_doc_id || '')) + '</td><td class="num">' + fmt(totalsOf(d).grand) + '</td><td><button class="btn ghost small" data-rdetail="' + d.id + '">' + esc(t('detail')) + '</button></td></tr>'; }).join('') + '</tbody></table></div>';
      }).catch(function (e) { box.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    el.querySelector('[data-act="newret"]').addEventListener('click', function () {
      openModal({
        title: t('custReturn'), sub: t('hRetSrc'),
        body: fld(t('fDoc'), '<input name="deliveryId" required inputmode="numeric" />') + fld(t('fDoc'), '<input name="sourceLineId" required inputmode="numeric" />') + fld(t('qty') + '*', '<input name="qty" value="1" inputmode="numeric" />') + fld(t('fReason'), '<input name="notes" />'),
        onOk: function (fd, close) {
          var did = parseIntField(fd.get('deliveryId'), 'deliveryId');
          var line = { sourceLineId: parseIntField(fd.get('sourceLineId'), 'sourceLineId'), qty: parseIntField(fd.get('qty'), 'qty') };
          return unwrap(api.createCustomerReturn(did, { lines: [line], notes: String(fd.get('notes') || '').trim() })).then(function (ret) {
            return unwrap(api.confirmDocument(ret.id)).then(function () { toast('✓ ' + docNoOf(ret) + ' (confirmed — post with reason in detail)', 'ok'); close(); loadRets(); showDocDetail('cdetail', ret.id, loadRets); });
          });
        }
      });
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rdetail]');
      if (b) showDocDetail('cdetail', Number(b.getAttribute('data-rdetail')), loadRets);
    });
    document.getElementById('sret').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var msg = document.getElementById('smsg');
      msg.textContent = '';
      findProductBySku(String(fd.get('sku') || '').trim()).then(function (p) {
        return unwrap(api.returnToSupplier({ receiptId: parseIntField(fd.get('receiptId'), 'receiptId'), productId: p.id, qty: parseIntField(fd.get('qty'), 'qty'), reason: String(fd.get('reason') || '').trim() }));
      }).then(function (m) { msg.textContent = t('msgDone') + ' #' + m.id; msg.style.color = '#15803d'; e.target.reset(); }).catch(function (err) { msg.textContent = errMsg(err); msg.style.color = '#b91c1c'; });
    });
    loadRets();
  }
  function cashBalancesTab() {
    var el = document.getElementById('tbl');
    el.innerHTML = '<div class="toolbar"><input type="search" id="bcode" placeholder="' + esc(t('fParty')) + '" value="' + esc(state.balCode || '') + '" /><button class="btn secondary small" data-act="load">' + esc(t('opLoad')) + '</button><button class="btn ghost small" data-act="overview">' + esc(t('opDebtors')) + '</button></div><div class="hint">' + esc(t('hBalHow')) + '</div><div id="bout">' + emptyHtml(t('hBalHow')) + '</div><div id="bov" style="margin-top:8px"></div>';
    if (state.balCode) { state.balCode = ''; }
    el.querySelector('[data-act="load"]').addEventListener('click', function () {
      var code = document.getElementById('bcode').value.trim();
      var out = document.getElementById('bout');
      if (!code) { out.innerHTML = emptyHtml(); return; }
      out.innerHTML = loadingHtml();
      findPartyByCode(code).then(function (party) {
        return Promise.all([
          unwrap(api.partyBalance(party.id)),
          unwrap(api.listDocuments({})).catch(function () { return []; }),
        ]).then(function (pair) {
          var b = pair[0];
          var docs = pair[1].filter(function (d) { return (d.partyId != null ? d.partyId : d.party_id) === party.id && (docTypeOf(d) === 'sales_invoice' || docTypeOf(d) === 'purchase_order'); }).slice(0, 20);
          out.innerHTML = '<div class="card"><h3 class="mono">' + esc(party.code) + '</h3><div class="hint mono">' + esc(t('thReceivable')) + ' ' + fmt(b.receivable) + ' · ' + esc(t('thPayable')) + ' ' + fmt(b.payable) + ' · ' + esc(t('thNet')) + ' ' + fmt(b.net) + ' · ' + esc(t('thAllocIn')) + ' ' + fmt(b.allocatedIn) + ' · ' + esc(t('thAllocOut')) + ' ' + fmt(b.allocatedOut) + ' · ' + esc(t('hServer')) + '</div>' +
            '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>' + esc(t('fDoc')) + '</th><th>' + esc(t('fType')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('total')) + '</th></tr></thead><tbody>' +
            (docs.map(function (d) { return '<tr><td class="mono">' + esc(docNoOf(d)) + '</td><td class="mono">' + esc(docTypeOf(d)) + '</td><td>' + badge(d.status) + '</td><td class="num">' + fmt(totalsOf(d).grand) + '</td></tr>'; }).join('') || '<tr><td colspan="4">' + esc(t('empty')) + '</td></tr>') + '</tbody></table></div>' +
            '<div class="hint">invoice status posted/partially_paid/paid follows allocations · refresh after each payment/reversal</div></div>';
        });
      }).catch(function (e) { out.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    });
    el.querySelector('[data-act="overview"]').addEventListener('click', function () {
      var ov = document.getElementById('bov');
      ov.innerHTML = loadingHtml();
      unwrap(api.listParties({})).then(function (res) {
        var rows = (res.rows || res).slice(0, 50);
        var jobs = rows.map(function (p) { return unwrap(api.partyBalance(p.id)).then(function (b) { return { p: p, b: b }; }).catch(function (e) { return { p: p, _err: e.message }; }); });
        return Promise.all(jobs).then(function (all) {
          var debtors = all.filter(function (x) { return !x._err && (x.b.receivable > 0 || x.b.payable > 0); });
          ov.innerHTML = '<div class="hint">' + esc(t('hDebtors', { open: debtors.length, checked: rows.length })) + '</div>' +
            (debtors.length ? '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('thReceivable')) + '</th><th>' + esc(t('thPayable')) + '</th><th>' + esc(t('thNet')) + '</th></tr></thead><tbody>' +
              debtors.map(function (x) { return '<tr><td class="mono">' + esc(x.p.code) + '</td><td class="num">' + fmt(x.b.receivable) + '</td><td class="num">' + fmt(x.b.payable) + '</td><td class="num">' + fmt(x.b.net) + '</td></tr>'; }).join('') + '</tbody></table></div>' : emptyHtml());
        });
      }).catch(function (e) { ov.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    });
  }
  function cashAccountsTab() {
    var el = document.getElementById('tbl');
    el.innerHTML = '<div class="toolbar"><button class="btn small" data-act="newacc">' + esc(t('create')) + ' — ' + esc(t('fCashAccount')) + '</button><span class="hint">sessions: open/close/report by id · no session list or movement history API</span></div><div id="accs">' + loadingHtml() + '</div>' +
      '<div class="grid-2" style="margin-top:10px"><div class="card"><h3>' + esc(t('opOpen')) + ' ' + esc(t('fSession')) + '</h3><form class="f" id="sopen"><div class="f-grid">' + fld(t('fCashAccount'), '<input name="code" required />') + fld(t('fOpening'), '<input name="opening" inputmode="numeric" />') + '</div><div><button class="btn secondary small" type="submit">' + esc(t('opOpen')) + '</button></div><div class="msg" id="sopenm"></div></form></div>' +
      '<div class="card"><h3>' + esc(t('close')) + ' / ' + esc(t('reports')) + '</h3><form class="f" id="sclose"><div class="f-grid">' + fld(t('fSession'), '<input name="sid" required inputmode="numeric" />') + fld(t('fCounted'), '<input name="counted" inputmode="numeric" />') + '</div><div class="row-actions"><button class="btn secondary small" type="submit">' + esc(t('close')) + '</button><button class="btn ghost small" type="button" data-act="rep">' + esc(t('reports')) + '</button></div><div class="msg" id="sclosem"></div></form><div id="srep" class="hint mono"></div></div></div>';
    function load() {
      var box = document.getElementById('accs');
      box.innerHTML = loadingHtml();
      unwrap(api.listCashAccounts()).then(function (rows) {
        if (!rows.length) { box.innerHTML = emptyHtml(); return; }
        box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('thKind')) + '</th><th>' + esc(t('active')) + '</th><th>' + esc(t('thBalance')) + '</th></tr></thead><tbody>' +
          rows.map(function (a) { return '<tr><td class="mono">' + esc(a.code) + '</td><td>' + esc(a.kind || a.type || '') + '</td><td>' + esc(String(a.is_active)) + '</td><td class="num">' + fmt(a.balance) + '</td></tr>'; }).join('') + '</tbody></table></div><div class="hint">balance = server position, never computed here</div>';
      }).catch(function (e) { box.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    el.querySelector('[data-act="newacc"]').addEventListener('click', function () {
      if (typeof api.createCashAccount !== 'function') { toast(t('unsupported'), 'err'); return; }
      openModal({
        title: t('create') + ' — ' + t('fCashAccount'), body: fld(t('fCode'), '<input name="code" required maxlength="16" />') + fld(t('name'), '<input name="name" maxlength="100" />'),
        onOk: function (fd, close) {
          return unwrap(api.createCashAccount({ code: String(fd.get('code') || '').trim(), name: String(fd.get('name') || '').trim() || String(fd.get('code') || '').trim() })).then(function () { toast('✓', 'ok'); close(); load(); });
        }
      });
    });
    document.getElementById('sopen').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var msg = document.getElementById('sopenm');
      msg.textContent = '';
      unwrap(api.listCashAccounts()).then(function (list) {
        var a = list.filter(function (x) { return x.code === String(fd.get('code') || '').trim(); })[0];
        if (!a) throw window.I18N.ex('errAccountNotFound', { code: String(fd.get('code') || '').trim() });
        var input = {};
        var oRaw = String(fd.get('opening') || '').trim();
        if (oRaw !== '') input.openingAmount = parseIntField(oRaw, 'opening');
        return unwrap(api.openCashSession(a.id, input));
      }).then(function (s) { msg.textContent = t('msgDone') + ' #' + s.id; msg.style.color = '#15803d'; e.target.reset(); }).catch(function (err) { msg.textContent = errMsg(err); msg.style.color = '#b91c1c'; });
    });
    document.getElementById('sclose').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var msg = document.getElementById('sclosem');
      msg.textContent = '';
      var sid = parseIntField(fd.get('sid'), 'session id');
      var cRaw = String(fd.get('counted') || '').trim();
      if (cRaw === '') { msg.textContent = errMsg(window.I18N.ex('errRequired', { field: t('fCounted') })); msg.style.color = '#b91c1c'; return; }
          confirmDialog(t('close') + ' ' + t('fSession'), t('close') + ' #' + sid + '? ' + t('hCloseSess'), t('close')).then(function (ok) {
        if (!ok) return;
        unwrap(api.closeCashSession(sid, { countedAmount: parseIntField(cRaw, 'counted') })).then(function (r) {
          document.getElementById('srep').textContent = t('thExpected') + ' ' + r.expected + ' / ' + t('fCounted') + ' ' + r.counted + ' / ' + t('thVariance') + ' ' + r.discrepancy;
          msg.textContent = t('msgDone');
          msg.style.color = '#15803d';
          load();
        }).catch(function (err) { msg.textContent = errMsg(err); msg.style.color = '#b91c1c'; });
      });
    });
    el.querySelector('[data-act="rep"]').addEventListener('click', function () {
      var sidRaw = String(document.querySelector('#sclose input[name="sid"]').value || '').trim();
      var out = document.getElementById('srep');
      if (!sidRaw) { out.textContent = t('empty'); return; }
      out.textContent = t('loading');
      unwrap(api.sessionReport(Number(sidRaw))).then(function (r) { out.textContent = JSON.stringify(r); }).catch(function (e) { out.textContent = errMsg(e); });
    });
    load();
  }
  function cashExpensesTab() {
    var el = document.getElementById('tbl');
    el.innerHTML = '<div class="toolbar"><button class="btn small" data-act="newcat">' + esc(t('create')) + ' — ' + esc(t('fCategory')) + '</button><button class="btn secondary small" data-act="report">' + esc(t('total')) + '</button><span class="hint">no edit API · delete only unused · reverse cancels (cash compensated)</span></div>' +
      '<div class="grid-2"><div class="card"><h3>' + esc(t('catCategories')) + '</h3><div id="cats">' + loadingHtml() + '</div></div>' +
      '<div class="card"><h3>' + esc(t('expenses')) + ' <button class="btn secondary small" data-act="newexp">' + esc(t('newExpense')) + '</button></h3><div id="exps">' + loadingHtml() + '</div><div id="expd"></div></div></div>';
    function loadCats() {
      var box = document.getElementById('cats');
      unwrap(api.listExpenseCategories()).then(function (rows) {
        if (!rows.length) { box.innerHTML = emptyHtml(); return; }
        box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('name')) + '</th><th></th></tr></thead><tbody>' +
          rows.map(function (c) { return '<tr><td class="mono">' + esc(c.code) + '</td><td>' + esc(c.name || '') + '</td><td><button class="btn ghost small" data-cdel="' + c.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">🗑</button></td></tr>'; }).join('') + '</tbody></table></div>';
      }).catch(function (e) { box.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    function loadExps() {
      var box = document.getElementById('exps');
      box.innerHTML = loadingHtml();
      unwrap(api.listExpenses({})).then(function (rows) {
        if (!rows.length) { box.innerHTML = emptyHtml(); return; }
        box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('fCategory')) + '</th><th>' + esc(t('total')) + '</th><th>' + esc(t('status')) + '</th><th></th></tr></thead><tbody>' +
          rows.slice(0, 60).map(function (x) {
            return '<tr><td class="mono">' + esc(x.expense_no) + ' #' + x.id + '</td><td>' + esc(x.category_code || x.category_id) + '</td><td class="num">' + fmt(x.amount) + '</td><td>' + badge(x.status) + '</td>' +
              '<td><div class="row-actions"><button class="btn ghost small" data-xdet="' + x.id + '">' + esc(t('detail')) + '</button>' + (x.status !== 'cancelled' && x.status !== 'reversed' ? '<button class="btn ghost small" data-xrev="' + x.id + '">' + esc(t('reverse')) + '</button>' : '') + '</div></td></tr>';
          }).join('') + '</tbody></table></div>';
      }).catch(function (e) { box.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    el.querySelector('[data-act="newcat"]').addEventListener('click', function () {
      openModal({
        title: t('create') + ' — ' + t('fCategory'), body: fld(t('fCode'), '<input name="code" required maxlength="32" />') + fld(t('name'), '<input name="name" required maxlength="100" />'),
        onOk: function (fd, close) {
          return unwrap(api.createExpenseCategory({ code: String(fd.get('code') || '').trim(), name: String(fd.get('name') || '').trim() })).then(function () { toast('✓', 'ok'); close(); loadCats(); });
        }
      });
    });
    el.querySelector('[data-act="report"]').addEventListener('click', function () {
      unwrap(api.expenseReport({})).then(function (r) {
        toast(t('msgTotal', { v: (r.total != null ? r.total : JSON.stringify(r)) }), 'ok');
      }).catch(function (e) { toast(errMsg(e), 'err'); });
    });
    el.querySelector('[data-act="newexp"]').addEventListener('click', function () {
      unwrap(api.listExpenseCategories()).then(function (cats) {
        openModal({
          title: t('newExpense'),           sub: t('hExpOpt'),
          body:
            fld(t('fCategory'), '<select name="categoryCode">' + cats.map(function (c) { return '<option>' + esc(c.code) + '</option>'; }).join('') + '</select>') +
            fld(t('total'), '<input name="amount" required inputmode="numeric" />') +
            fld(t('fMethod'), '<select name="method"><option value="cash">' + esc(window.I18N.payMethod(lang, 'cash')) + '</option><option value="bank_transfer">' + esc(window.I18N.payMethod(lang, 'bank_transfer')) + '</option><option value="check">' + esc(window.I18N.payMethod(lang, 'check')) + '</option></select>') +
            fld(t('fCashAccount'), '<input name="cashAccountCode" value="TILL" />') +
            fld(t('fParty'), '<input name="partyCode" />') +
            fld(t('fTax'), '<select name="taxClass"><option value="standard">' + esc(window.I18N.taxClass(lang, 'standard')) + '</option><option value="exempt">' + esc(window.I18N.taxClass(lang, 'exempt')) + '</option></select>') +
            fld(t('fDate'), '<input name="expenseDate" placeholder="YYYY-MM-DD" />') +
            fld(t('fReference'), '<input name="reference" maxlength="64" />') +
            fld(t('fNotes'), '<input name="notes" maxlength="1000" />'),
          onOk: function (fd, close) {
            var method = String(fd.get('method') || 'cash');
            var input = {
              categoryCode: String(fd.get('categoryCode') || '').trim(),
              amount: parseIntField(fd.get('amount'), 'amount'),
              method: method,
              cashAccountCode: method === 'cash' ? (String(fd.get('cashAccountCode') || '').trim() || null) : null,
              taxClass: String(fd.get('taxClass') || 'standard'),
              reference: String(fd.get('reference') || '').trim(),
              notes: String(fd.get('notes') || '').trim(),
            };
            var dd = String(fd.get('expenseDate') || '').trim();
            if (dd !== '') input.expenseDate = dd;
            var pc = String(fd.get('partyCode') || '').trim();
            var chain = pc === '' ? Promise.resolve(input) : findPartyByCode(pc).then(function (p) { input.partyId = p.id; return input; });
            return chain.then(function (inp) { return unwrap(api.createExpense(inp)); }).then(function (c) { toast('✓ ' + c.expense_no, 'ok'); close(); loadExps(); });
          }
        });
      }).catch(function (e) { toast(errMsg(e), 'err'); });
    });
    el.addEventListener('click', function (e) {
      var cd = e.target.closest('[data-cdel]');
      if (cd) {
          confirmDialog(t('del'), t('expenses') + ' — ' + t('fCategory') + ' #' + cd.getAttribute('data-cdel'), t('del')).then(function (ok) {
          if (!ok) return;
          unwrap(api.deleteExpenseCategory(Number(cd.getAttribute('data-cdel')))).then(function () { toast('✓', 'ok'); loadCats(); }).catch(function (err) { toast(errMsg(err), 'err'); });
        });
        return;
      }
      var xd = e.target.closest('[data-xdet]');
      if (xd) {
        (function (id) {
          unwrap(api.getExpense(id)).then(function (x) {
            document.getElementById('expd').innerHTML = '<div class="card"><h3 class="mono">' + esc(x.expense_no) + ' ' + badge(x.status) + '</h3><div class="hint mono">' + esc(t('fCategory')) + ' ' + esc(x.category_code || x.category_id) + ' · ' + esc(t('fAmount')) + ' ' + fmt(x.amount) + ' · ' + esc(t('fMethod')) + ' ' + esc(x.method ? window.I18N.payMethod(lang, x.method) : '') + ' · ' + esc(t('fDate')) + ' ' + esc(fmtDate(x.expense_date || x.expenseDate || '')) + ' · ' + esc(t('fTax')) + ' ' + esc((x.tax_class || x.taxClass) ? window.I18N.taxClass(lang, x.tax_class || x.taxClass) : '') + (x.notes ? ' · ' + esc(x.notes) : '') + ' · ' + esc(t('hServer')) + '</div></div>';
          }).catch(function (err) { toast(errMsg(err), 'err'); });
        })(Number(xd.getAttribute('data-xdet')));
        return;
      }
      var xr = e.target.closest('[data-xrev]');
      if (xr) {
        (function (id) {
          openModal({
            title: t('reverse') + ' #' + id, body: fld(t('cancelReason'), '<input name="reason" required />') + '<div class="hint">cash leg compensated · row cancelled, never deleted</div>',
            okLabel: t('reverse'),
            onOk: function (fd, close) {
              var reason = String(fd.get('reason') || '').trim();
              if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
              return unwrap(api.reverseExpense(id, reason)).then(function () { toast('✓', 'ok'); close(); loadExps(); });
            }
          });
        })(Number(xr.getAttribute('data-xrev')));
      }
    });
    loadCats();
    loadExps();
  }

  function renderCounts() {
    view.innerHTML = pageHead(t('counts'), t('stDraft') + ' → ' + t('stSubmitted') + ' → ' + t('stApproved') + ' → ' + t('stPosted'), '<span class="row-actions"><button class="btn secondary small" data-act="cancel">' + esc(t('cancel')) + '</button><button class="btn small" data-act="new">' + esc(t('newCount')) + '</button></span>') +
      '<div class="card"><div id="tbl">' + loadingHtml() + '</div><div id="cdetail" style="margin-top:10px"></div></div>' +
      '<div class="card"><h3>' + esc(t('hCountAdd')) + '</h3><form class="f" id="cline"><div class="f-grid">' +
      '<label class="fld">' + esc(t('thId')) + '*<input name="countId" required inputmode="numeric" /></label>' +
      '<label class="fld">SKU*<input name="sku" required /></label>' +
      '<label class="fld">lotId (opt)<input name="lotId" /></label>' +
      '<label class="fld">' + esc(t('qty')) + '*<input name="countedQty" required inputmode="numeric" /></label>' +
      '</div><div><button class="btn secondary small" type="submit">' + esc(t('addLine')) + '</button></div><div class="msg" id="cmsg"></div></form><div class="hint">' + esc(t('hCountRules')) + '</div></div>';
    function load() {
      var tbl = document.getElementById('tbl');
      if (!tbl) return;
      tbl.innerHTML = loadingHtml();
      unwrap(api.listCounts({})).then(function (rows) {
        if (!rows.length) { tbl.innerHTML = emptyHtml(); return; }
        tbl.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('warehouse')) + '</th><th></th><th>' + esc(t('actions')) + '</th></tr></thead><tbody>' +
          rows.slice(0, 40).map(function (c) {
            var acts = [];
            if (c.status === 'draft') acts.push({ a: 'submit', l: t('opSubmit') });
            if (c.status === 'submitted') acts.push({ a: 'approve', l: t('opApprove') });
            if (c.status === 'approved') acts.push({ a: 'post', l: t('post') });
            return '<tr><td class="mono">' + esc(c.count_no) + ' #' + c.id + '</td><td>' + badge(c.status) + '</td><td>' + esc(String(c.warehouse_id != null ? c.warehouse_id : '')) + '</td>' +
              '<td><button class="btn ghost small" data-lines="' + c.id + '">' + esc(t('detail')) + '</button></td>' +
              '<td><div class="row-actions">' + (acts.map(function (x) { return '<button class="btn ghost small" data-cact="' + x.a + '" data-id="' + c.id + '">' + esc(x.l) + '</button>'; }).join(' ') || '—') + '</div></td></tr>';
          }).join('') + '</tbody></table></div>';
      }).catch(function (e) { tbl.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    function showDetail(id) {
      var el = document.getElementById('cdetail');
      el.innerHTML = '<div class="card">' + loadingHtml() + '</div>';
      unwrap(api.getCount(id)).then(function (full) {
        var lines = full.lines || [];
        el.innerHTML = '<div class="card"><h3 class="mono">' + esc(full.count_no) + ' ' + badge(full.status) + '</h3>' +
          '<div class="hint mono">' + esc(t('warehouse')) + ' ' + esc(String(full.warehouse_id)) + ' · ' + esc(t('thExpected')) + '/' + esc(t('fCounted')) + '/' + esc(t('thVariance')) + '</div>' +
          (!lines.length ? emptyHtml() : '<div class="table-wrap"><table><thead><tr><th>' + esc(t('sku')) + '</th><th>' + esc(t('fLot')) + '</th><th>' + esc(t('thExpected')) + '</th><th>' + esc(t('fCounted')) + '</th><th>' + esc(t('thVariance')) + '</th><th>' + esc(t('fReason')) + '</th><th></th></tr></thead><tbody>' +
            lines.map(function (l) {
              var v = (l.variance != null ? l.variance : ((l.counted_qty || 0) - (l.expected_qty || 0)));
              return '<tr><td class="mono">' + esc(l.product_sku || l.product_id) + '</td><td>' + esc(String(l.lot_id || '')) + '</td><td class="num">' + fmt(l.expected_qty) + '</td><td class="num">' + fmt(l.counted_qty) + '</td><td class="num"><b>' + fmt(v) + '</b></td><td class="mono">' + esc(l.reason_code ? window.I18N.moveReason(lang, l.reason_code) : '') + '</td>' +
                '<td><div class="row-actions">' + (full.status === 'draft' ? '<button class="btn ghost small" data-le="' + l.id + '">' + esc(t('edit')) + '</button><button class="btn ghost small" data-lr="' + l.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">✖</button>' : (full.status === 'submitted' && v !== 0 ? '<button class="btn ghost small" data-lreason="' + l.id + '">' + esc(t('fReason')) + '</button>' : '—')) + '</div></td></tr>';
            }).join('') + '</tbody></table></div>') +
          '<div class="row-actions" style="margin-top:8px"><button class="btn ghost small" data-cc>' + esc(t('close')) + '</button></div></div>';
        el.querySelector('[data-cc]').addEventListener('click', function () { el.innerHTML = ''; });
        el.querySelectorAll('[data-le]').forEach(function (b) {
          b.addEventListener('click', function () {
            var lid = Number(b.getAttribute('data-le'));
            openModal({
              title: t('edit') + ' line #' + lid,           sub: t('hDraftOnly'),
              body: fld(t('fCounted'), '<input name="countedQty" inputmode="numeric" />') + fld(t('fReason'), '<select name="reasonCode"><option value="">—</option><option value="damaged">' + esc(window.I18N.moveReason(lang, 'damaged')) + '</option><option value="expired">' + esc(window.I18N.moveReason(lang, 'expired')) + '</option><option value="lost">' + esc(window.I18N.moveReason(lang, 'lost')) + '</option><option value="found">' + esc(window.I18N.moveReason(lang, 'found')) + '</option><option value="correction">' + esc(window.I18N.moveReason(lang, 'correction')) + '</option><option value="defective">' + esc(window.I18N.moveReason(lang, 'defective')) + '</option><option value="wrong_item">' + esc(window.I18N.moveReason(lang, 'wrong_item')) + '</option><option value="customer_request">' + esc(window.I18N.moveReason(lang, 'customer_request')) + '</option></select>'),
              onOk: function (fd, close) {
                var patch = {};
                var q = String(fd.get('countedQty') || '').trim();
                var r = String(fd.get('reasonCode') || '').trim();
                if (q !== '') patch.countedQty = parseIntField(q, 'countedQty');
                if (r !== '') patch.reasonCode = r;
                if (!q && !r) throw window.I18N.ex('errNothing');
                return unwrap(api.updateCountLine(lid, patch)).then(function () { toast('✓', 'ok'); close(); showDetail(id); load(); });
              }
            });
          });
        });
        el.querySelectorAll('[data-lr]').forEach(function (b) {
          b.addEventListener('click', function () {
            confirmDialog(t('del'), t('lines') + ' #' + b.getAttribute('data-lr'), t('del')).then(function (ok) {
              if (!ok) return;
              unwrap(api.removeCountLine(Number(b.getAttribute('data-lr')))).then(function () { toast('✓', 'ok'); showDetail(id); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
            });
          });
        });
        el.querySelectorAll('[data-lreason]').forEach(function (b) {
          b.addEventListener('click', function () {
            var lid = Number(b.getAttribute('data-lreason'));
            openModal({
              title: t('fReason') + ' #' + lid, sub: t('hSubmitted'),
              body: fld(t('cancelReason'), '<select name="reasonCode"><option value="damaged">' + esc(window.I18N.moveReason(lang, 'damaged')) + '</option><option value="expired">' + esc(window.I18N.moveReason(lang, 'expired')) + '</option><option value="lost">' + esc(window.I18N.moveReason(lang, 'lost')) + '</option><option value="found">' + esc(window.I18N.moveReason(lang, 'found')) + '</option><option value="correction">' + esc(window.I18N.moveReason(lang, 'correction')) + '</option><option value="defective">' + esc(window.I18N.moveReason(lang, 'defective')) + '</option><option value="wrong_item">' + esc(window.I18N.moveReason(lang, 'wrong_item')) + '</option><option value="customer_request">' + esc(window.I18N.moveReason(lang, 'customer_request')) + '</option></select>'),
              onOk: function (fd, close) {
                return unwrap(api.updateCountLine(lid, { reasonCode: String(fd.get('reasonCode') || '').trim() })).then(function () { toast('✓', 'ok'); close(); showDetail(id); load(); });
              }
            });
          });
        });
        el.scrollIntoView({ block: 'nearest' });
      }).catch(function (e) { el.innerHTML = '<div class="card"><div class="alert err">' + esc(errMsg(e)) + '</div></div>'; });
    }
    view.querySelector('[data-act="new"]').addEventListener('click', function () {
      openModal({
        title: t('newCount'), body: fld(t('warehouse'), '<input name="warehouseCode" value="' + esc(state.warehouse) + '" />') + fld(t('fNotes'), '<input name="notes" />'),
        onOk: function (fd, close) {
          var input = { warehouseCode: String(fd.get('warehouseCode') || 'MAIN').trim() || 'MAIN' };
          var n = String(fd.get('notes') || '').trim();
          if (n !== '') input.notes = n;
          return unwrap(api.createCount(input)).then(function (c) { toast('✓ ' + c.count_no, 'ok'); close(); load(); });
        }
      });
    });
    view.querySelector('[data-act="cancel"]').addEventListener('click', function () {
      openModal({
        title: t('counts') + ' — ' + t('cancel'), body: fld(t('thId'), '<input name="countId" required inputmode="numeric" />') + fld(t('cancelReason'), '<input name="reason" required />'),
        okLabel: t('del'),
        onOk: function (fd, close) {
          var reason = String(fd.get('reason') || '').trim();
          if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
          return unwrap(api.cancelCount(parseIntField(fd.get('countId'), 'countId'), reason)).then(function () { toast('✓', 'ok'); close(); load(); });
        }
      });
    });
    var tblHost = view.querySelector('#tbl');
    tblHost.addEventListener('click', function (e) {
      var l = e.target.closest('[data-lines]');
      if (l) { showDetail(Number(l.getAttribute('data-lines'))); return; }
      var b = e.target.closest('[data-cact]');
      if (!b || b.disabled) return;
      (function (btn) {
        var id = Number(btn.getAttribute('data-id'));
        var a = btn.getAttribute('data-cact');
        withBtnBusy(btn, function () {
          var p = a === 'submit' ? unwrap(api.submitCount(id)) : a === 'approve' ? unwrap(api.approveCount(id)) : unwrap(api.postCount(id));
          return p.then(function () { toast('✓ ' + a + ' (irreversible on post)', 'ok'); showDetail(id); load(); });
        });
      })(b);
    });
    document.getElementById('cline').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var msg = document.getElementById('cmsg');
      msg.textContent = '';
      findProductBySku(String(fd.get('sku') || '').trim()).then(function (p) {
        var input = { productId: p.id, countedQty: parseIntField(fd.get('countedQty'), 'countedQty') };
        var lotRaw = String(fd.get('lotId') || '').trim();
        if (lotRaw !== '') input.lotId = Number(lotRaw);
        return unwrap(api.addCountLine(parseIntField(fd.get('countId'), 'countId'), input));
      }).then(function () { msg.textContent = '✓'; msg.style.color = '#15803d'; e.target.reset(); load(); }).catch(function (err) { msg.textContent = errMsg(err); msg.style.color = '#b91c1c'; });
    });
    load();
  }

  function renderRoutes() {
    var tabs = [['routes', 'routes'], ['drivers', 'drivers'], ['vehicles', 'vehicles']];
    view.innerHTML = pageHead(t('routes'), t('stPlanned') + ' → ' + t('stLoaded') + ' → ' + t('stOut') + ' · ' + t('hNoGps'), '<span class="row-actions"><button class="btn small" data-act="new">' + esc(t('newRoute')) + '</button></span>') +
      '<div class="card"><div class="toolbar"><div class="tabs" role="tablist">' + tabs.map(function (x) { return '<button class="tab' + (state.routeTab === x[0] ? ' active' : '') + '" role="tab" aria-selected="' + (state.routeTab === x[0]) + '" data-rtab="' + x[0] + '">' + esc(t(x[1])) + '</button>'; }).join('') + '</div></div><div id="rbody">' + loadingHtml() + '</div><div id="detail" style="margin-top:10px"></div></div>';
    view.querySelectorAll('[data-rtab]').forEach(function (b) {
      b.addEventListener('click', function () { state.routeTab = b.getAttribute('data-rtab'); renderRoutes(); });
    });
    view.querySelector('[data-act="new"]').addEventListener('click', function () {
      openModal({
        title: t('newRoute'), body: fld(t('date') + ' (YYYY-MM-DD)', '<input name="routeDate" placeholder="YYYY-MM-DD" />') + fld(t('fNotes'), '<input name="notes" />'),
        onOk: function (fd, close) {
          var d = String(fd.get('routeDate') || '').trim() || undefined;
          var n = String(fd.get('notes') || '').trim();
          var input = {};
          if (d) input.routeDate = d;
          if (n) input.notes = n;
          return unwrap(api.createRoute(input)).then(function (c) { toast('✓ ' + c.route_no, 'ok'); close(); if (state.routeTab === 'routes') routesTab(); });
        }
      });
    });
    if (state.routeTab === 'routes') routesTab();
    else if (state.routeTab === 'drivers') driversTab();
    else vehiclesTab();
  }
  function routesTab() {
    var box = document.getElementById('rbody');
    box.innerHTML = loadingHtml();
    Promise.all([
      unwrap(api.listRoutes({})).catch(function (e) { return { _err: e }; }),
      (typeof api.listDrivers === 'function' ? unwrap(api.listDrivers()).catch(function () { return []; }) : Promise.resolve([])),
      (typeof api.listVehicles === 'function' ? unwrap(api.listVehicles()).catch(function () { return []; }) : Promise.resolve([])),
    ]).then(function (all) {
      if (all[0]._err) { box.innerHTML = '<div class="alert err">' + esc(errMsg(all[0]._err)) + '</div>'; return; }
      var rows = all[0] || [];
      var dById = {};
      (all[1] || []).forEach(function (d) { dById[d.id] = d.code; });
      var vById = {};
      (all[2] || []).forEach(function (v) { vById[v.id] = v.code; });
      if (!rows.length) { box.innerHTML = emptyHtml(); return; }
      box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('ref')) + '</th><th>' + esc(t('date')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('fDriver')) + '</th><th>' + esc(t('fVehicle')) + '</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 60).map(function (r) {
          return '<tr><td><button class="btn ghost small" data-sel="' + r.id + '">' + esc(r.route_no) + '</button></td><td class="mono">' + esc(fmtDate(r.route_date)) + '</td><td>' + badge(r.status) + '</td>' +
            '<td class="mono">' + esc(dById[r.driver_id] || (r.driver_id || '—')) + '</td><td class="mono">' + esc(vById[r.vehicle_id] || (r.vehicle_id || '—')) + '</td>' +
            '<td><span class="hint">' + esc(routeOpsHint(r.status)) + '</span></td></tr>';
        }).join('') + '</tbody></table></div><div class="hint">metrics in detail (delivered/total + claim/settled/outstanding)</div>';
    });
    function routeOpsHint(s) {
      if (s === 'planned') return t('opAssign') + ' → ' + t('opStop') + ' → ' + t('opReserve') + ' → ' + t('opLoad');
      if (s === 'loaded') return t('opDispatch');
      if (s === 'out_for_delivery') return t('opStop') + ' → ' + t('detail');
      return window.I18N.status(lang, s);
    }
    box.addEventListener('click', function (e) {
      var s = e.target.closest('[data-sel]');
      if (!s) return;
      state.routeDetailId = Number(s.getAttribute('data-sel'));
      showRouteDetail(state.routeDetailId);
    });
    if (state.routeDetailId) showRouteDetail(state.routeDetailId);
  }
  function driversTab() {
    var box = document.getElementById('rbody');
    box.innerHTML = '<div class="toolbar"><button class="btn small" data-act="newd">' + esc(t('create')) + ' — ' + esc(t('fDriver')) + '</button><span class="hint">' + esc(t('hNoUpdate')) + '</span></div><div id="dtbl">' + loadingHtml() + '</div>';
    function load() {
      var el = document.getElementById('dtbl');
      unwrap(api.listDrivers()).then(function (rows) {
        if (!rows.length) { el.innerHTML = emptyHtml(); return; }
        el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('name')) + '</th><th>' + esc(t('active')) + '</th><th></th></tr></thead><tbody>' +
          rows.map(function (d) {
            var a = d.is_active !== 0;
            return '<tr><td class="mono">' + esc(d.code) + '</td><td>' + esc(d.name) + '</td><td>' + badge(a ? 'active' : 'inactive') + '</td><td><button class="btn ghost small" data-dt="' + d.id + '" data-a="' + (a ? 1 : 0) + '" title="' + esc(a ? t('inactive') : t('active')) + '" aria-label="' + esc(a ? t('inactive') : t('active')) + '">' + (a ? '✖' : '✔') + '</button></td></tr>';
          }).join('') + '</tbody></table></div>';
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    box.querySelector('[data-act="newd"]').addEventListener('click', function () {
      openModal({
        title: t('create') + ' — ' + t('fDriver'), body: fld(t('fCode'), '<input name="code" required maxlength="32" />') + fld(t('name'), '<input name="name" required maxlength="100" />') + fld(t('fPhone'), '<input name="phone" maxlength="32" />'),
        onOk: function (fd, close) {
          return unwrap(api.createDriver({ code: String(fd.get('code') || '').trim(), name: String(fd.get('name') || '').trim(), phone: String(fd.get('phone') || '').trim() })).then(function () { toast('✓', 'ok'); close(); load(); });
        }
      });
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dt]');
      if (!b) return;
      var id = Number(b.getAttribute('data-dt'));
      var a = b.getAttribute('data-a') === '1';
      unwrap(api.setDriverActive(id, !a)).then(function () { toast('✓', 'ok'); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
    });
    load();
  }
  function vehiclesTab() {
    var box = document.getElementById('rbody');
    box.innerHTML = '<div class="toolbar"><button class="btn small" data-act="newv">' + esc(t('create')) + ' — ' + esc(t('fVehicle')) + '</button><span class="hint">' + esc(t('hNoUpdate')) + '</span></div><div id="vtbl">' + loadingHtml() + '</div>';
    function load() {
      var el = document.getElementById('vtbl');
      unwrap(api.listVehicles()).then(function (rows) {
        if (!rows.length) { el.innerHTML = emptyHtml(); return; }
        el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('thPlate')) + '</th><th>' + esc(t('active')) + '</th><th></th></tr></thead><tbody>' +
          rows.map(function (v) {
            var a = v.is_active !== 0;
            return '<tr><td class="mono">' + esc(v.code) + '</td><td class="mono">' + esc(v.plate || '') + '</td><td>' + badge(a ? 'active' : 'inactive') + '</td><td><button class="btn ghost small" data-vt="' + v.id + '" data-a="' + (a ? 1 : 0) + '" title="' + esc(a ? t('inactive') : t('active')) + '" aria-label="' + esc(a ? t('inactive') : t('active')) + '">' + (a ? '✖' : '✔') + '</button></td></tr>';
          }).join('') + '</tbody></table></div>';
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    box.querySelector('[data-act="newv"]').addEventListener('click', function () {
      openModal({
        title: t('create') + ' — ' + t('fVehicle'), body: fld(t('fCode'), '<input name="code" required maxlength="32" />') + fld(t('fPlate'), '<input name="plate" maxlength="32" />') + fld(t('fDesc'), '<input name="description" maxlength="200" />'),
        onOk: function (fd, close) {
          return unwrap(api.createVehicle({ code: String(fd.get('code') || '').trim(), plate: String(fd.get('plate') || '').trim(), description: String(fd.get('description') || '').trim() })).then(function () { toast('✓', 'ok'); close(); load(); });
        }
      });
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vt]');
      if (!b) return;
      var id = Number(b.getAttribute('data-vt'));
      var a = b.getAttribute('data-a') === '1';
      unwrap(api.setVehicleActive(id, !a)).then(function () { toast('✓', 'ok'); load(); }).catch(function (err) { toast(errMsg(err), 'err'); });
    });
    load();
  }
  function showRouteDetail(id) {
    var det = document.getElementById('detail');
    if (!det) return;
    det.innerHTML = '<div class="card">' + loadingHtml() + '</div>';
    Promise.all([
      unwrap(api.getRoute(id)),
      unwrap(api.routeReconciliation(id)).catch(function () { return null; }),
      (typeof api.listDrivers === 'function' ? unwrap(api.listDrivers()).catch(function () { return []; }) : Promise.resolve([])),
      (typeof api.listVehicles === 'function' ? unwrap(api.listVehicles()).catch(function () { return []; }) : Promise.resolve([])),
      (typeof api.listReservations === 'function' ? unwrap(api.listReservations(id)).catch(function () { return []; }) : Promise.resolve([])),
    ]).then(function (all) {
      var full = all[0];
      var rec = all[1];
      var drivers = all[2] || [];
      var vehicles = all[3] || [];
      var resv = all[4] || [];
      var stops = full.stops || [];
      var nDel = stops.filter(function (s) { return s.status === 'delivered'; }).length;
      var nFail = stops.filter(function (s) { return s.status === 'failed'; }).length;
      var nPend = stops.filter(function (s) { return s.status === 'pending'; }).length;
      var canCrew = full.status === 'planned' || full.status === 'loaded';
      var canStops = full.status === 'planned' || full.status === 'loaded';
      var outFor = full.status === 'out_for_delivery';
      var stopsOut = rec && rec.stops ? rec.stops : [];
      var outByStop = {};
      stopsOut.forEach(function (s) { outByStop[s.stop_id] = s.outstanding; });
      det.innerHTML = '<div class="card"><h3>' + esc(full.route_no) + ' ' + badge(full.status) + '</h3>' +
        '<div class="hint mono">' + esc(t('fDate')) + ' ' + esc(fmtDate(full.route_date)) + ' · ' + esc(t('fDriver')) + ' ' + esc(full.driver ? full.driver.code : (full.driver_id || '—')) + ' · ' + esc(t('fVehicle')) + ' ' + esc(full.vehicle ? full.vehicle.code : (full.vehicle_id || '—')) +
        ' · ' + nDel + ' ' + esc(t('stDelivered')) + ' / ' + nFail + ' ' + esc(t('stFailed')) + ' / ' + nPend + ' ' + esc(t('stPending')) +
        (rec ? ' · ' + esc(t('thClaim')) + ' ' + fmt(rec.claim) + ' / ' + esc(t('thSettled')) + ' ' + fmt(rec.settled) + ' / ' + esc(t('thOut')) + ' ' + fmt(rec.outstanding) : '') + '</div>' +
        '<div class="hint">' + esc(t('hNoGps')) + '</div>' +
        '<div class="grid-2" style="margin-top:8px"><div><h3>' + esc(t('hCrew')) + (canCrew ? '' : ' (' + esc(t('hCrewLocked')) + ')') + '</h3>' +
        (canCrew ? '<form class="f" id="assignf"><div class="f-grid"><label class="fld">' + esc(t('fDriver')) + '<select name="driverId"><option value="">—</option>' + drivers.filter(function (d) { return d.is_active !== 0; }).map(function (d) { return '<option value="' + d.id + '"' + (full.driver_id === d.id ? ' selected' : '') + '>' + esc(d.code) + '</option>'; }).join('') + '</select></label>' +
          '<label class="fld">' + esc(t('fVehicle')) + '<select name="vehicleId"><option value="">—</option>' + vehicles.filter(function (v) { return v.is_active !== 0; }).map(function (v) { return '<option value="' + v.id + '"' + (full.vehicle_id === v.id ? ' selected' : '') + '>' + esc(v.code) + '</option>'; }).join('') + '</select></label></div><div><button class="btn secondary small" type="submit">' + esc(t('opAssign')) + '</button></div></form>'
          : '<div class="hint">' + esc(t('hCrewLocked')) + ' (' + esc(window.I18N.status(lang, full.status)) + ')</div>') + '</div>' +
        '<div><h3>' + esc(t('hLoading')) + ' (' + resv.length + ')</h3><div class="toolbar"><button class="btn secondary small" data-act="reserve">' + esc(t('opReserve')) + '</button><button class="btn secondary small" data-act="release">' + esc(t('opRelease')) + '</button><button class="btn secondary small" data-act="avail">' + esc(t('ttlAvail')) + '</button></div><div id="resv" class="hint mono">' + esc(resv.slice(0, 5).map(function (r) { return '#' + r.id + ':' + r.product_id + 'x' + r.qty; }).join(' ') || '—') + '</div>' +
        '<div class="row-actions" style="margin-top:6px"><button class="btn secondary small" data-rop="load" ' + (full.status === 'planned' ? '' : 'disabled') + '>' + esc(t('opLoad')) + '</button>' +
        '<button class="btn secondary small" data-rop="dispatch" ' + (full.status === 'loaded' ? '' : 'disabled') + '>' + esc(t('opDispatch')) + '</button></div>' +
        '<div class="hint">' + esc(t('hLoadReq')) + '</div></div></div>' +
        '<h3>' + esc(t('hStops')) + ' (' + stops.length + ')' + (canStops ? ' <button class="btn secondary small" data-act="addstop">' + esc(t('opStop')) + '</button>' : '') + '</h3>' +
        (!stops.length ? emptyHtml() : '<div class="table-wrap"><table><thead><tr><th>#</th><th>' + esc(t('customer')) + '</th><th>' + esc(t('fDoc')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('thCollected')) + '</th><th>' + esc(t('thOut')) + '</th><th></th></tr></thead><tbody>' +
          stops.map(function (x) {
            var acts = '';
            if (x.status === 'pending' && outFor) acts = '<button class="btn ghost small" data-done="' + x.id + '">' + esc(t('deliver')) + '</button> <button class="btn ghost small" data-fail="' + x.id + '">' + esc(t('stFailed')) + '</button>';
            else if (x.status === 'pending') acts = '<span class="hint">' + esc(t('hDispatchFirst')) + '</span>';
            else if (x.status === 'delivered' && (outByStop[x.id] || 0) > 0) acts = '<button class="btn ghost small" data-settle="' + x.id + '">' + esc(t('opSettle')) + ' ' + fmt(outByStop[x.id]) + '</button>';
            else if (x.status === 'delivered') acts = '<button class="btn ghost small" data-claim="' + x.id + '">' + esc(t('thClaim')) + '</button>';
            if ((full.status === 'planned' || full.status === 'loaded') && x.status === 'pending') acts += ' <button class="btn ghost small" data-rmstop="' + x.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">✖</button>';
            return '<tr><td>' + x.stop_no + '</td><td>' + esc(x.party_name || x.party_code) + '</td><td>' + (x.delivery_doc_id || '—') + '</td><td>' + badge(x.status) + '</td><td class="num">' + fmt(x.collected_amount) + '</td><td class="num">' + fmt(outByStop[x.id] || 0) + '</td><td><div class="row-actions">' + acts + '</div></td></tr>';
          }).join('') + '</tbody></table></div>') +
        '<div class="row-actions" style="margin-top:8px"><button class="btn secondary small" data-rop="c-delivered">' + esc(t('stDelivered')) + '</button><button class="btn secondary small" data-rop="c-partial">' + esc(t('stPartial')) + '</button><button class="btn secondary small" data-rop="c-failed">' + esc(t('stFailed')) + '</button><button class="btn danger small" data-rop="cancel">' + esc(t('cancel')) + '</button> <button class="btn ghost small" data-dclose>' + esc(t('close')) + '</button></div>' +
        '<div class="hint">' + esc(t('hCompleteReq')) + '</div></div>';
      var af = det.querySelector('#assignf');
      if (af) af.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var fd = new FormData(ev.target);
        var dRaw = String(fd.get('driverId') || '').trim();
        var vRaw = String(fd.get('vehicleId') || '').trim();
        unwrap(api.assignRoute(id, { driverId: dRaw ? Number(dRaw) : null, vehicleId: vRaw ? Number(vRaw) : null })).then(function () { toast('✓', 'ok'); showRouteDetail(id); if (state.routeTab === 'routes') routesTab(); }).catch(function (err) { toast(errMsg(err), 'err'); });
      });
      det.querySelector('[data-dclose]').addEventListener('click', function () { det.innerHTML = ''; state.routeDetailId = null; });
      det.querySelectorAll('[data-rop]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          var op = b.getAttribute('data-rop');
          withBtnBusy(b, function () {
            var p;
            if (op === 'load') p = unwrap(api.loadRoute(id));
            else if (op === 'dispatch') p = unwrap(api.dispatchRoute(id));
            else if (op === 'c-delivered') p = unwrap(api.completeRoute(id, 'delivered'));
            else if (op === 'c-partial') p = unwrap(api.completeRoute(id, 'partial'));
            else if (op === 'c-failed') p = unwrap(api.completeRoute(id, 'failed'));
            else if (op === 'cancel') {
              openModal({
                title: t('del') + ' ' + full.route_no, body: fld(t('cancelReason'), '<input name="reason" required />'),
                okLabel: t('del'),
                onOk: function (fd, close) {
                  var reason = String(fd.get('reason') || '').trim();
                  if (!reason) throw window.I18N.ex('errRequired', { field: t('fReason') });
                  return unwrap(api.cancelRoute(id, reason)).then(function () { toast('✓', 'ok'); close(); });
                }
              });
              return;
            } else return;
            return p.then(function () { toast('✓', 'ok'); showRouteDetail(id); routesTab(); });
          });
        });
      });
      var addB = det.querySelector('[data-act="addstop"]');
      if (addB) addB.addEventListener('click', function () {
        openModal({
          title: t('opStop'), body: fld(t('fParty'), '<input name="partyCode" required />') + fld(t('fDoc'), '<input name="deliveryDocId" inputmode="numeric" />'),
          onOk: function (fd, close) {
            var docRaw = String(fd.get('deliveryDocId') || '').trim();
            return unwrap(api.addStop(id, { partyCode: String(fd.get('partyCode') || '').trim(), deliveryDocId: docRaw ? Number(docRaw) : null })).then(function () { toast('✓', 'ok'); close(); showRouteDetail(id); routesTab(); });
          }
        });
      });
      det.querySelectorAll('[data-rmstop]').forEach(function (b) {
        b.addEventListener('click', function () {
            confirmDialog(t('del'), t('opStop') + ' #' + b.getAttribute('data-rmstop') + ' · ' + t('hStopDel'), t('del')).then(function (ok) {
            if (!ok) return;
            unwrap(api.removeStop(Number(b.getAttribute('data-rmstop')))).then(function () { toast('✓', 'ok'); showRouteDetail(id); routesTab(); }).catch(function (err) { toast(errMsg(err), 'err'); });
          });
        });
      });
      det.querySelectorAll('[data-done]').forEach(function (b) {
        b.addEventListener('click', function () {
          openModal({
            title: t('deliver') + ' #' + b.getAttribute('data-done'), body: fld(t('fCollected'), '<input name="collectedAmount" value="0" inputmode="numeric" />') + fld(t('fProof'), '<input name="proofRef" maxlength="200" />') + '<div class="hint">' + esc(t('hSettleClaim')) + '</div>',
            onOk: function (fd, close) {
              var input = { collectedAmount: parseIntField(String(fd.get('collectedAmount') || '0').trim() === '' ? '0' : fd.get('collectedAmount'), 'collectedAmount') };
              var pr = String(fd.get('proofRef') || '').trim();
              if (pr !== '') input.proofRef = pr;
              return unwrap(api.completeStop(Number(b.getAttribute('data-done')), input)).then(function () { toast('✓', 'ok'); close(); showRouteDetail(id); routesTab(); });
            }
          });
        });
      });
      det.querySelectorAll('[data-fail]').forEach(function (b) {
        b.addEventListener('click', function () {
          openModal({
            title: t('stFailed') + ' #' + b.getAttribute('data-fail'), body: fld(t('cancelReason'), '<select name="reason"><option value="customer_absent">' + esc(window.I18N.moveReason(lang, 'customer_absent')) + '</option><option value="refused">' + esc(window.I18N.moveReason(lang, 'refused')) + '</option><option value="wrong_address">' + esc(window.I18N.moveReason(lang, 'wrong_address')) + '</option><option value="vehicle_issue">' + esc(window.I18N.moveReason(lang, 'vehicle_issue')) + '</option><option value="other">' + esc(window.I18N.moveReason(lang, 'other')) + '</option></select>'),
            onOk: function (fd, close) {
              return unwrap(api.failStop(Number(b.getAttribute('data-fail')), { reason: String(fd.get('reason') || '').trim() })).then(function () { toast('✓', 'ok'); close(); showRouteDetail(id); routesTab(); });
            }
          });
        });
      });
      det.querySelectorAll('[data-settle]').forEach(function (b) {
        b.addEventListener('click', function () {
          var sid = Number(b.getAttribute('data-settle'));
          openModal({
            title: t('opSettle') + ' #' + sid, sub: t('hSettleHow'),
            body: fld(t('fAmount'), '<input name="amount" inputmode="numeric" />') + fld(t('fMethod'), '<select name="method"><option value="cash">' + esc(window.I18N.payMethod(lang, 'cash')) + '</option><option value="bank_transfer">' + esc(window.I18N.payMethod(lang, 'bank_transfer')) + '</option><option value="check">' + esc(window.I18N.payMethod(lang, 'check')) + '</option></select>') + fld(t('fCashAccount'), '<input name="cashAccountCode" value="TILL" />') + fld(t('fTarget'), '<input name="paymentId" />'),
            onOk: function (fd, close) {
              var input = {};
              var aRaw = String(fd.get('amount') || '').trim();
              if (aRaw !== '') input.amount = parseIntField(aRaw, 'amount');
              var pidRaw = String(fd.get('paymentId') || '').trim();
              if (pidRaw !== '') { input.paymentId = Number(pidRaw); }
              else {
                input.method = String(fd.get('method') || 'cash');
                if (input.method === 'cash') input.cashAccountCode = String(fd.get('cashAccountCode') || '').trim() || null;
              }
              return unwrap(api.settleStop(sid, input)).then(function () { toast(t('msgDone'), 'ok'); close(); showRouteDetail(id); });
            }
          });
        });
      });
      det.querySelectorAll('[data-claim]').forEach(function (b) {
        b.addEventListener('click', function () {
          var sid = Number(b.getAttribute('data-claim'));
          unwrap(api.getStopSettlement(sid)).then(function (s) { toast(t('msgClaim', { a: s.amount, b: s.settled_amount }), 'ok'); }).catch(function (err) { toast(errMsg(err), 'err'); });
        });
      });
      var resB = det.querySelector('[data-act="reserve"]');
      if (resB) resB.addEventListener('click', function () {
        openModal({
          title: t('opReserve') + ' · ' + full.route_no, sub: t('hPlanClaim'),
          body: fld('SKU*', '<input name="sku" required />') + fld(t('qty'), '<input name="qty" value="1" inputmode="numeric" />') + fld(t('warehouse'), '<input name="warehouseCode" />') + fld(t('fLot'), '<input name="lotId" />'),
          onOk: function (fd, close) {
            return findProductBySku(String(fd.get('sku') || '').trim()).then(function (p) {
              var input = { productId: p.id, qty: parseIntField(fd.get('qty'), 'qty') };
              var wh = String(fd.get('warehouseCode') || '').trim();
              if (wh !== '') input.warehouseCode = wh;
              var lotRaw = String(fd.get('lotId') || '').trim();
              if (lotRaw !== '') input.lotId = Number(lotRaw);
              return unwrap(api.reserveStock(id, input));
            }).then(function () { toast('✓', 'ok'); close(); showRouteDetail(id); });
          }
        });
      });
      var relB = det.querySelector('[data-act="release"]');
      if (relB) relB.addEventListener('click', function () {
        withBtnBusy(relB, function () { return unwrap(api.releaseReservations(id)).then(function (n) { toast(t('msgReleased', { n: n }), 'ok'); showRouteDetail(id); }); });
      });
      var avB = det.querySelector('[data-act="avail"]');
      if (avB) avB.addEventListener('click', function () {
        openModal({
          title: t('ttlAvail'), body: fld('SKU*', '<input name="sku" required />') + fld(t('warehouse'), '<input name="warehouseCode" />') + fld(t('fLot'), '<input name="lotId" />'),
          onOk: function (fd, close) {
            return findProductBySku(String(fd.get('sku') || '').trim()).then(function (p) {
              return getWarehouses().then(function (whs) {
                var code = String(fd.get('warehouseCode') || 'MAIN').trim() || 'MAIN';
                var w = whs.filter(function (x) { return x.code === code; })[0];
                if (!w) throw window.I18N.ex('errWarehouseNotFound', { code: code });
                var args = { productId: p.id, warehouseId: w.id };
                var lotRaw = String(fd.get('lotId') || '').trim();
                if (lotRaw !== '') args.lotId = Number(lotRaw);
                return unwrap(api.availableStock(args)).then(function (n) { toast(t('msgAvail', { n: n }), 'ok'); close(); });
              });
            });
          }
        });
      });
    }).catch(function (err) { det.innerHTML = '<div class="card"><div class="alert err">' + esc(errMsg(err)) + '</div></div>'; });
  }

  var REPORTS = [
    { group: 'Stock', key: 'getCurrentStock', label: 'current-stock', filters: ['warehouse', 'search'], drill: 'sku' },
    { group: 'Stock', key: 'getStockValuation', label: 'stock-valuation', filters: ['warehouse'], drill: 'sku' },
    { group: 'Stock', key: 'getMovementHistory', label: 'movement-history', filters: ['sku', 'warehouse', 'date', 'movementType', 'limit'], drill: null },
    { group: 'Stock', key: 'getLowStockProducts', label: 'low-stock', filters: ['warehouse'], drill: 'sku' },
    { group: 'Stock', key: 'getLotExpiryReport', label: 'lot-expiry', filters: ['warehouse', 'date'], drill: null },
    { group: 'Stock', key: 'getWarehouseComparison', label: 'warehouse-comparison', filters: ['sku'], drill: 'sku' },
    { group: 'Sales', key: 'getSalesByDate', label: 'sales-by-date', filters: ['date', 'warehouse'], drill: null },
    { group: 'Sales', key: 'getSalesByCustomer', label: 'sales-by-customer', filters: ['date', 'warehouse'], drill: 'party' },
    { group: 'Sales', key: 'getSalesByProduct', label: 'sales-by-product', filters: ['date', 'warehouse'], drill: 'sku' },
    { group: 'Sales', key: 'getSalesBySalesperson', label: 'sales-by-salesperson', filters: ['date', 'warehouse'], drill: null },
    { group: 'Sales', key: 'getSalesByRoute', label: 'sales-by-route', filters: ['date', 'warehouse'], drill: 'route' },
    { group: 'Sales', key: 'getSalesByDocumentType', label: 'sales-by-doctype', filters: ['date', 'warehouse'], drill: null },
    { group: 'Sales', key: 'getSalesMargin', label: 'sales-margin', filters: ['date', 'warehouse'], drill: null },
    { group: 'Receivables', key: 'getCustomerBalances', label: 'customer-balances', filters: ['date'], drill: 'party' },
    { group: 'Receivables', key: 'getOverdueAmounts', label: 'overdue', filters: ['asOf'], drill: 'party' },
    { group: 'Receivables', key: 'getPaymentHistory', label: 'payment-history', filters: ['party', 'date'], drill: 'party' },
    { group: 'Receivables', key: 'getAgingReport', label: 'aging', filters: ['asOf'], drill: null },
    { group: 'Purchases', key: 'getPurchasesBySupplier', label: 'purchases-by-supplier', filters: ['date', 'warehouse'], drill: 'party' },
    { group: 'Purchases', key: 'getPurchasesByProduct', label: 'purchases-by-product', filters: ['date', 'warehouse'], drill: 'sku' },
    { group: 'Purchases', key: 'getPurchasesByDate', label: 'purchases-by-date', filters: ['date', 'warehouse'], drill: null },
    { group: 'Purchases', key: 'getReceivedVsOrdered', label: 'received-vs-ordered', filters: ['date', 'supplier'], drill: null },
    { group: 'Purchases', key: 'getSupplierBalances', label: 'supplier-balances', filters: ['date'], drill: 'party' },
    { group: 'Delivery', key: 'getRouteCompletion', label: 'route-completion', filters: ['route', 'date'], drill: 'route' },
    { group: 'Delivery', key: 'getFailedDeliveries', label: 'failed-deliveries', filters: ['route', 'date'], drill: 'route' },
    { group: 'Delivery', key: 'getQuantityDelivered', label: 'quantity-delivered', filters: ['date', 'sku', 'warehouse'], drill: 'sku' },
    { group: 'Delivery', key: 'getCustomerCollections', label: 'customer-collections', filters: ['date', 'route'], drill: 'party' },
    { group: 'Delivery', key: 'getDriverVehiclePerformance', label: 'driver-vehicle', filters: ['date', 'driver', 'vehicle'], drill: null },
    { group: 'Cash', key: 'getSessionSummary', label: 'session-summary', filters: ['account', 'date'], drill: null },
    { group: 'Cash', key: 'getCashReceipts', label: 'cash-receipts', filters: ['account', 'date'], drill: null },
    { group: 'Cash', key: 'getCashPayments', label: 'cash-payments', filters: ['account', 'date'], drill: null },
    { group: 'Cash', key: 'getExpensesReport', label: 'expenses', filters: ['date'], drill: null },
    { group: 'Cash', key: 'getAdjustmentsReport', label: 'adjustments', filters: ['account', 'date'], drill: null },
    { group: 'Cash', key: 'getDiscrepanciesReport', label: 'discrepancies', filters: ['date'], drill: null },
    { group: 'Cash', key: 'getDailyCashPosition', label: 'daily-cash-position', filters: ['day', 'account'], drill: null },
  ];
  var REPORT_GROUPS = { Stock: 'stock', Sales: 'sales', Receivables: 'grpRecv', Purchases: 'purchases', Delivery: 'routes', Cash: 'cash' };
  var REPORT_TITLES = {
    getCurrentStock: 'repCurrentStock', getStockValuation: 'repValuation', getMovementHistory: 'repMovements',
    getLowStockProducts: 'repLow', getLotExpiryReport: 'repExpiry', getWarehouseComparison: 'repWhCompare',
    getSalesByDate: 'repSalesDate', getSalesByCustomer: 'repSalesCust', getSalesByProduct: 'repSalesProd',
    getSalesBySalesperson: 'repSalesRep', getSalesByRoute: 'repSalesRoute', getSalesByDocumentType: 'repSalesType',
    getSalesMargin: 'repMargin', getCustomerBalances: 'repCustBal', getOverdueAmounts: 'repOverdue',
    getPaymentHistory: 'repPayHist', getAgingReport: 'repAging',
    getPurchasesBySupplier: 'repPurchSup', getPurchasesByProduct: 'repPurchProd',
    getPurchasesByDate: 'repPurchDate', getReceivedVsOrdered: 'repRecVsOrd',
    getSupplierBalances: 'repSuppBal', getRouteCompletion: 'repRouteComp',
    getFailedDeliveries: 'repFailed', getQuantityDelivered: 'repQtyDel',
    getCustomerCollections: 'repCollect', getDriverVehiclePerformance: 'repDriver',
    getSessionSummary: 'repSession', getCashReceipts: 'repCashIn', getCashPayments: 'repCashOut',
    getExpensesReport: 'repExp', getAdjustmentsReport: 'repAdjust', getDiscrepanciesReport: 'repDiscrep',
    getDailyCashPosition: 'repCashPos'
  };
  function repDef(key) {
    var f = REPORTS.filter(function (r) { return r.key === key; });
    return f.length ? f[0] : null;
  }
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function rowsToCsv(rows) {
    if (!rows.length) return '';
    var cols = Object.keys(rows[0]);
    var out = cols.map(csvCell).join(',') + '\n';
    rows.forEach(function (r) { out += cols.map(function (c) { return csvCell(r[c]); }).join(',') + '\n'; });
    return out;
  }
  function downloadCsv(name, text) {
    var blob;
    try { blob = new Blob([text], { type: 'text/csv' }); } catch (e) { toast(t('errExport'), 'err'); return; }
    var a = document.createElement('a');
    a.href = (window.URL || window.webkitURL).createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 500);
  }
  function renderReports() {
    var groups = {};
    REPORTS.forEach(function (r) {
      if (!groups[r.group]) groups[r.group] = [];
      groups[r.group].push(r);
    });
    var def = repDef(state.repKey) || REPORTS[0];
    var show = function (name) { return def.filters.indexOf(name) !== -1; };
    view.innerHTML = pageHead(t('reports'), t('hReportsSub'), '') +
      '<div class="grid-2"><div class="card"><h2>' + esc(t('hRegistry')) + '</h2>' +
      Object.keys(groups).map(function (g) {
        return '<h3>' + esc(t(REPORT_GROUPS[g] || 'reports')) + '</h3><div class="tabs">' + groups[g].map(function (r) {
          var wired = typeof api[r.key] === 'function';
          return '<button class="tab' + (state.repKey === r.key ? ' active' : '') + '" data-rep="' + r.key + '"' + (wired ? '' : ' disabled title="' + esc(t('unsupported')) + '"') + '>' + esc(t(REPORT_TITLES[r.key] || 'reports')) + (wired ? '' : ' (—)') + '</button>';
        }).join('') + '</div>';
      }).join('') + '</div>' +
      '<div class="card"><h2>' + esc(t(REPORT_TITLES[def.key] || 'reports')) + '</h2><div class="hint mono">api.' + esc(def.key) + ' · ' + esc(t('detail')) + ': ' + esc(def.drill || '—') + '</div>' +
      '<form class="f" id="repform"><div class="f-grid">' +
      (show('date') ? fld(t('fStart'), '<input name="dateFrom" placeholder="YYYY-MM-DD" />') + fld(t('fEnd'), '<input name="dateTo" placeholder="YYYY-MM-DD" />') : '') +
      (show('asOf') ? fld(t('fDate'), '<input name="asOfDate" placeholder="YYYY-MM-DD" />') : '') +
      (show('day') ? fld(t('fDate'), '<input name="day" placeholder="YYYY-MM-DD" />') : '') +
      (show('warehouse') ? fld(t('warehouse'), '<input name="warehouseCode" placeholder="MAIN" />') : '') +
      (show('search') ? fld(t('searchLabel'), '<input name="search" />') : '') +
      (show('sku') ? fld('SKU', '<input name="sku" />') : '') +
      (show('party') ? fld(t('fParty'), '<input name="partyCode" />') : '') +
      (show('supplier') ? fld(t('thId'), '<input name="supplierId" inputmode="numeric" />') : '') +
      (show('route') ? fld(t('thId'), '<input name="routeId" inputmode="numeric" />') : '') +
      (show('driver') ? fld(t('thId'), '<input name="driverId" inputmode="numeric" />') : '') +
      (show('vehicle') ? fld(t('thId'), '<input name="vehicleId" inputmode="numeric" />') : '') +
      (show('account') ? fld(t('fCashAccount'), '<input name="cashAccountCode" />') : '') +
      (show('movementType') ? fld(t('fType'), '<input name="movementType" />') : '') +
      (show('limit') ? fld(t('fLimit'), '<input name="limit" value="200" inputmode="numeric" />') : fld(t('fLimit'), '<input name="limit" value="200" inputmode="numeric" />')) +
      '</div><div class="row-actions"><button class="btn small" type="submit">' + esc(t('opRun')) + '</button><button class="btn secondary small" type="button" data-act="csv">CSV</button><button class="btn secondary small" type="button" data-act="print">' + esc(t('print')) + '</button></div></form>' +
      '<div class="hint" id="repmeta">—</div><div id="out" style="margin-top:8px">' + (state.repRows ? '' : emptyHtml(t('hRunReport'))) + '</div></div></div>';
    view.querySelectorAll('[data-rep]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        state.repKey = b.getAttribute('data-rep');
        state.repRows = null;
        state.repAt = null;
        renderReports();
      });
    });
    if (state.repRows) paintRows(state.repRows, state.repAt);
    document.getElementById('repform').addEventListener('submit', function (e) {
      e.preventDefault();
      if (e.target.getAttribute('data-busy') === '1') return;
      e.target.setAttribute('data-busy', '1');
      var fd = new FormData(e.target);
      buildReportOpts(def, fd).then(function (opts) {
        var out = document.getElementById('out');
        out.innerHTML = loadingHtml();
        document.getElementById('repmeta').textContent = t('loading') + ' ' + def.key + ' ' + JSON.stringify(opts);
        return unwrap(api[def.key](opts)).then(function (data) {
          var rows = data.rows || data;
          state.repRows = rows;
          state.repAt = new Date().toISOString();
          paintRows(rows, state.repAt);
        });
      }).catch(function (err) {
        document.getElementById('out').innerHTML = '<div class="alert err">' + esc(errMsg(err)) + '</div>';
      }).then(function () { e.target.setAttribute('data-busy', ''); });
    });
    view.querySelector('[data-act="csv"]').addEventListener('click', function () {
      if (!state.repRows) { toast(t('empty'), 'err'); return; }
      downloadCsv(def.label + '.csv', rowsToCsv(state.repRows.slice(0, 500)));
      toast(t('msgCsvDone'), 'ok');
    });
    view.querySelector('[data-act="print"]').addEventListener('click', function () { window.print(); });
  }
  function buildReportOpts(def, fd) {
    var str = function (k) { return String(fd.get(k) || '').trim(); };
    var num = function (k) { var s = str(k); return s === '' ? null : Number(s); };
    var jobs = [];
    var opts = {};
    var needWh = def.filters.indexOf('warehouse') !== -1 && str('warehouseCode') !== '';
    var needSku = def.filters.indexOf('sku') !== -1 && str('sku') !== '';
    var needParty = (def.filters.indexOf('party') !== -1 && str('partyCode') !== '') || (def.filters.indexOf('supplier') !== -1 && str('supplierId') !== '');
    var done = Promise.resolve();
    if (needWh) {
      done = done.then(function () { return getWarehouses().then(function (list) {
        var w = list.filter(function (x) { return x.code === str('warehouseCode'); })[0];
        if (!w) throw window.I18N.ex('errWarehouseNotFound', { code: str('warehouseCode') });
        opts.warehouseId = w.id;
      }); });
    }
    if (needSku) {
      done = done.then(function () { return findProductBySku(str('sku')).then(function (p) {
        opts.productId = p.id;
        if (def.key === 'getCurrentStock' || def.key === 'getStockValuation') opts.search = p.sku;
      }); });
    } else if (def.filters.indexOf('search') !== -1 && str('search') !== '') {
      opts.search = str('search');
    }
    if (needParty) {
      if (str('supplierId') !== '' && def.filters.indexOf('supplier') !== -1) {
        var sid = num('supplierId');
        if (sid === null || !Number.isInteger(sid)) throw window.I18N.ex('errInteger', { field: t('thId') });
        opts.supplierId = sid;
      } else {
        done = done.then(function () { return findPartyByCode(str('partyCode')).then(function (party) {
          opts.partyId = party.id;
          if (def.key === 'getPaymentHistory') opts.partyId = party.id;
        }); });
      }
    }
    return done.then(function () {
      if (def.filters.indexOf('date') !== -1) {
        if (str('dateFrom') !== '') opts.dateFrom = str('dateFrom');
        if (str('dateTo') !== '') opts.dateTo = str('dateTo');
      }
      if (def.filters.indexOf('asOf') !== -1 && str('asOfDate') !== '') opts.asOfDate = str('asOfDate');
      if (def.filters.indexOf('day') !== -1) {
        if (str('day') !== '') { opts.date = str('day'); }
      }
      ['routeId', 'driverId', 'vehicleId', 'limit', 'cashAccountId', 'expenseCategoryId'].forEach(function (k) {
        // only pass documented numeric filters; codes resolved above
      });
      if (str('routeId') !== '' && def.filters.indexOf('route') !== -1) opts.routeId = parseIntField(str('routeId'), 'routeId');
      if (str('driverId') !== '' && def.filters.indexOf('driver') !== -1) opts.driverId = parseIntField(str('driverId'), 'driverId');
      if (str('vehicleId') !== '' && def.filters.indexOf('vehicle') !== -1) opts.vehicleId = parseIntField(str('vehicleId'), 'vehicleId');
      if (str('cashAccountCode') !== '' && def.filters.indexOf('account') !== -1) {
        // cash reports take cashAccountId; resolve code → id honestly
        jobs.push(unwrap(api.listCashAccounts()).then(function (list) {
          var a = list.filter(function (x) { return x.code === str('cashAccountCode'); })[0];
          if (!a) throw window.I18N.ex('errAccountNotFound', { code: str('cashAccountCode') });
          opts.cashAccountId = a.id;
        }));
      }
      if (str('movementType') !== '' && def.filters.indexOf('movementType') !== -1) opts.movementType = str('movementType');
      var limRaw = str('limit');
      if (limRaw !== '') {
        var lim = Number(limRaw);
        if (!Number.isInteger(lim) || lim <= 0 || lim > 2000) throw window.I18N.ex('errInteger', { field: t('fLimit') });
        opts.limit = lim;
      }
      return Promise.all(jobs).then(function () { return opts; });
    });
  }
  function paintRows(rows, at) {
    var out = document.getElementById('out');
    var meta = document.getElementById('repmeta');
    if (!out) return;
    if (!rows || !rows.length) { out.innerHTML = emptyHtml(); if (meta) meta.textContent = t('hGen') + ' (' + (at || '—') + ') · 0 ' + t('hRows'); return; }
    var cols = Object.keys(rows[0]);
    var shown = rows.slice(0, 200);
    var sums = {};
    cols.forEach(function (c) {
      var vals = shown.map(function (r) { return r[c]; }).filter(function (v) { return typeof v === 'number' && isFinite(v); });
      if (vals.length && /total|amount|qty|count|balance|grand|receivable|payable|net|claim|settled|outstanding/i.test(c)) sums[c] = vals.reduce(function (a, b) { return a + b; }, 0);
    });
    if (meta) meta.textContent = t('hGen') + ' (' + (at || '') + ') · ' + rows.length + ' ' + t('hRows') + (rows.length > 200 ? ' (' + t('hShowing') + ' 200)' : '') + Object.keys(sums).map(function (k) { return ' · ' + t('hShowing') + ' ' + k + ' Σ=' + sums[k]; }).join('');
    var def = repDef(state.repKey);
    out.innerHTML = '<div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      shown.map(function (r) {
        var drill = '';
        if (def && def.drill === 'sku' && (r.sku || r.product_sku)) drill = '<button class="btn ghost small" data-drill-sku="' + esc(r.sku || r.product_sku) + '">' + esc(t('stock')) + '</button>';
        else if (def && def.drill === 'party' && (r.party_code || r.code)) drill = '<button class="btn ghost small" data-drill-party="' + esc(r.party_code || r.code) + '">' + esc(t('thBalance')) + '</button>';
        else if (def && def.drill === 'route' && (r.route_id || r.routeId)) drill = '<button class="btn ghost small" data-drill-route="' + esc(String(r.route_id != null ? r.route_id : r.routeId)) + '">' + esc(t('routes')) + '</button>';
        return '<tr>' + cols.map(function (c) { return '<td class="' + (typeof r[c] === 'number' ? 'num' : (String(c).indexOf('date') !== -1 ? 'mono' : '')) + '">' + esc(r[c] == null ? '' : r[c]) + '</td>'; }).join('') + '<td>' + drill + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="hint">columns = server schema · sums = shown rows only, not accounting truth</div>';
    out.querySelectorAll('[data-drill-sku]').forEach(function (b) {
      b.addEventListener('click', function () { state.stockQ = b.getAttribute('data-drill-sku'); window.location.hash = '#/stock'; });
    });
    out.querySelectorAll('[data-drill-party]').forEach(function (b) {
      b.addEventListener('click', function () { state.balCode = b.getAttribute('data-drill-party'); state.cashTab = 'balances'; window.location.hash = '#/cash'; setTimeout(function () {
        var i = document.getElementById('bcode'); if (i) { i.value = state.balCode; }
      }, 300); });
    });
    out.querySelectorAll('[data-drill-route]').forEach(function (b) {
      b.addEventListener('click', function () { state.routeDetailId = Number(b.getAttribute('data-drill-route')); state.routeTab = 'routes'; window.location.hash = '#/routes'; });
    });
  }

  function renderSettings() {
    view.innerHTML = pageHead(t('settings'), t('warehouse') + ' · ' + t('catCategories') + ' · ' + t('hFiscalT') + ' · ' + t('hAuditT') + ' · ' + t('hExpT') + ' · ' + t('hAboutT'), '') +
      '<div class="grid-2"><div class="card"><h2>' + esc(t('warehouse')) + ' <button class="btn small" data-act="newwh">' + esc(t('create')) + ' — ' + esc(t('warehouse')) + '</button></h2><div class="hint">' + esc(t('hWhGuards')) + '</div><div id="wh" style="margin-top:8px">' + loadingHtml() + '</div></div>' +
      '<div class="card"><h2>' + esc(t('catCategories')) + '</h2><div class="hint">' + esc(t('hCatRO')) + '</div><div id="cat" style="margin-top:8px">' + loadingHtml() + '</div></div></div>' +
      '<div class="card"><h2>' + esc(t('hFiscalT')) + '</h2><div class="hint">' + esc(t('hFiscalH')) + '</div><div class="toolbar"><button class="btn small" data-act="newfy">' + esc(t('create')) + ' — ' + esc(t('fFiscal')) + '</button></div><div id="fys">' + loadingHtml() + '</div><div id="fyd" style="margin-top:8px"></div></div>' +
      '<div class="grid-2"><div class="card"><h2>' + esc(t('hAuditT')) + '</h2><div class="toolbar"><input type="search" id="afilter" placeholder="' + esc(t('searchLabel')) + '" /><select id="alimit"><option>50</option><option>100</option><option>200</option></select></div><div id="audit">' + loadingHtml() + '</div></div>' +
      '<div class="card"><h2>' + esc(t('hExpT')) + '</h2><div class="hint">' + esc(t('hExpH')) + '</div><div class="toolbar"><button class="btn secondary small" data-exp="products">' + esc(t('articles')) + '</button><button class="btn secondary small" data-exp="parties">' + esc(t('parties')) + '</button><button class="btn secondary small" data-exp="stock">' + esc(t('stock')) + ' (MAIN)</button><button class="btn secondary small" data-exp="payments">' + esc(t('payments')) + '</button></div><div id="expmsg" class="hint"></div>' +
      '<h3>' + esc(t('hAboutT')) + '</h3><div class="hint">' + esc(t('hAboutH', { a: 'npm run db:integrity', b: 'npm run import:source [-- --apply]' })) + '</div>' +
      '<h3>' + esc(t('hNoApiT')) + '</h3><div class="hint">' + esc(t('hNoApiH')) + '</div></div></div>';
    function loadWh() {
      var el = document.getElementById('wh');
      unwrap(api.listWarehouses()).then(function (rows) {
        el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('name')) + '</th><th>' + esc(t('active')) + '</th><th></th></tr></thead><tbody>' +
          rows.map(function (w) {
            var active = w.is_active !== 0;
            return '<tr><td class="mono">' + esc(w.code) + '</td><td>' + esc(w.name || '') + '</td><td>' + badge(active ? 'active' : 'inactive') + '</td>' +
              '<td><div class="row-actions"><button class="btn ghost small" data-whtoggle="' + w.id + '" data-a="' + (active ? 1 : 0) + '" title="' + esc(active ? t('inactive') : t('active')) + '" aria-label="' + esc(active ? t('inactive') : t('active')) + '">' + (active ? '✖' : '✔') + '</button><button class="btn ghost small" data-whdel="' + w.id + '" title="' + esc(t('del')) + '" aria-label="' + esc(t('del')) + '">🗑</button></div></td></tr>';
          }).join('') + '</tbody></table></div>';
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    view.querySelector('[data-act="newwh"]').addEventListener('click', function () {
      openModal({
        title: t('create') + ' — ' + t('warehouse'), body: fld(t('fCode'), '<input name="code" required maxlength="16" />') + fld(t('name'), '<input name="name" required maxlength="100" />'),
        onOk: function (fd, close) {
          return unwrap(api.createWarehouse({ code: String(fd.get('code') || '').trim(), name: String(fd.get('name') || '').trim() })).then(function () { toast('✓', 'ok'); close(); loadWh(); });
        }
      });
    });
    view.querySelector('#wh').addEventListener('click', function (e) {
      var tg = e.target.closest('[data-whtoggle]');
      if (tg) {
        var id = Number(tg.getAttribute('data-whtoggle'));
        var a = tg.getAttribute('data-a') === '1';
        unwrap(api.setWarehouseActive(id, !a)).then(function () { toast('✓', 'ok'); loadWh(); }).catch(function (err) { toast(errMsg(err), 'err'); });
        return;
      }
      var del = e.target.closest('[data-whdel]');
      if (del) {
          confirmDialog(t('del'), t('warehouse') + ' #' + del.getAttribute('data-whdel'), t('del')).then(function (ok) {
          if (!ok) return;
          unwrap(api.deleteWarehouse(Number(del.getAttribute('data-whdel')))).then(function () { toast('✓', 'ok'); loadWh(); }).catch(function (err) { toast(errMsg(err), 'err'); });
        });
      }
    });
    loadWh();
    var catBox = function () {
      var el = document.getElementById('cat');
      if (!el) return;
      getCategories().then(function (rows) {
        el.innerHTML = (rows.length ? '<div class="table-wrap"><table><thead><tr><th>' + esc(t('thId')) + '</th><th>' + esc(t('name')) + '</th></tr></thead><tbody>' +
          rows.map(function (c) { return '<tr><td>' + c.id + '</td><td>' + esc(c.name) + '</td></tr>'; }).join('') + '</tbody></table></div>' : emptyHtml());
      }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    };
    catBox();
    fiscalTab();
    auditTab();
    exportTab();
  }
  function auditTab() {
    var box = document.getElementById('audit');
    if (!box) return;
    function load() {
      var q = (document.getElementById('afilter').value || '').trim().toLowerCase();
      var lim = Number(document.getElementById('alimit').value) || 50;
      box.innerHTML = loadingHtml();
      unwrap(api.recentAudit({ limit: lim })).then(function (rows) {
        var list = rows.rows || rows || [];
        if (q) list = list.filter(function (a) { return String((a.operation || '') + ' ' + (a.actor || '') + ' ' + (a.entity_type || '')).toLowerCase().indexOf(q) !== -1; });
        if (!list.length) { box.innerHTML = emptyHtml(); return; }
        box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('thTime')) + '</th><th>' + esc(t('thActor')) + '</th><th>' + esc(t('thOperation')) + '</th><th>' + esc(t('thEntity')) + '</th></tr></thead><tbody>' +
          list.slice(0, lim).map(function (a) {
            return '<tr><td class="mono">' + esc(fmtDate(a.created_at || a.createdAt || '')) + '</td><td>' + esc(a.actor || '') + '</td><td class="mono">' + esc(a.operation || '') + '</td><td class="mono">' + esc((a.entity_type || '') + '#' + (a.entity_id != null ? a.entity_id : '')) + '</td></tr>';
          }).join('') + '</tbody></table></div><div class="hint">' + list.length + ' ' + esc(t('hShownRO')) + '</div>';
      }).catch(function (e) { box.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    }
    document.getElementById('afilter').addEventListener('input', load);
    document.getElementById('alimit').addEventListener('change', load);
    load();
  }
  function exportTab() {
    var buttons = view.querySelectorAll('[data-exp]');
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        b.disabled = true;
        var kind = b.getAttribute('data-exp');
        var msg = document.getElementById('expmsg');
        var expName = { products: t('articles'), parties: t('parties'), stock: t('stock'), payments: t('payments') }[kind] || kind;
        msg.textContent = t('loading') + ' ' + expName + '…';
        var p;
        if (kind === 'products') p = unwrap(api.listProducts({ limit: 500 }));
        else if (kind === 'parties') p = unwrap(api.listParties({}));
        else if (kind === 'stock') p = unwrap(api.listStock(state.warehouse));
        else p = unwrap(api.listPayments({}));
        p.then(function (res) {
          var rows = res.rows || res;
          if (!rows.length) { msg.textContent = t('empty'); b.disabled = false; return; }
          downloadCsv(kind + '.csv', rowsToCsv(rows.slice(0, 500)));
          msg.textContent = t('msgCsvDone') + ' (' + rows.length + '/500)';
          b.disabled = false;
        }).catch(function (e) { msg.textContent = errMsg(e); b.disabled = false; });
      });
    });
  }
  function fiscalTab() {
    var box = document.getElementById('fys');
    if (!box) return;
    box.innerHTML = loadingHtml();
    unwrap(api.listFiscalYears({})).then(function (rows) {
      if (!rows.length) { box.innerHTML = emptyHtml(); return; }
      box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('fCode')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('thPeriod')) + '</th><th></th></tr></thead><tbody>' +
        rows.map(function (f) {
            return '<tr><td class="mono">' + esc(f.code) + ' #' + f.id + '</td><td>' + badge(f.status) + '</td><td class="mono">' + esc(fmtDate(f.start_date || f.startDate || '')) + ' → ' + esc(fmtDate(f.end_date || f.endDate || '')) + '</td>' +
            '<td><div class="row-actions"><button class="btn ghost small" data-fev="' + f.id + '">' + esc(t('detail')) + '</button>' + (f.status === 'open' ? '<button class="btn ghost small" data-fclose="' + f.id + '">' + esc(t('close')) + '</button>' : '') + '</div></td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function (e) { box.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
    view.querySelector('[data-act="newfy"]').addEventListener('click', function () {
      openModal({
        title: t('create') + ' — ' + t('fFiscal'),           sub: t('hOneOpen'),
        body: fld(t('fCode'), '<input name="code" required maxlength="32" />') + fld(t('name'), '<input name="name" maxlength="200" />') + fld(t('fStart'), '<input name="startDate" required placeholder="YYYY-MM-DD" />') + fld(t('fEnd'), '<input name="endDate" required placeholder="YYYY-MM-DD" />'),
        onOk: function (fd, close) {
          return unwrap(api.openFiscalYear({ code: String(fd.get('code') || '').trim(), name: String(fd.get('name') || '').trim(), startDate: String(fd.get('startDate') || '').trim(), endDate: String(fd.get('endDate') || '').trim() })).then(function () { toast('✓', 'ok'); close(); fiscalTab(); });
        }
      });
    });
    box.addEventListener('click', function (e) {
      var ev = e.target.closest('[data-fev]');
      if (ev) { showFyEvents(Number(ev.getAttribute('data-fev'))); return; }
      var cl = e.target.closest('[data-fclose]');
      if (cl) {
          confirmDialog(t('close') + ' ' + t('fFiscal'), t('close') + ' #' + cl.getAttribute('data-fclose') + '? ' + t('hCloseFy'), t('close')).then(function (ok) {
          if (!ok) return;
          unwrap(api.closeFiscalYear(Number(cl.getAttribute('data-fclose')))).then(function () { toast('✓', 'ok'); fiscalTab(); }).catch(function (err) { toast(errMsg(err), 'err'); });
        });
      }
    });
  }
  function showFyEvents(fyid) {
    var el = document.getElementById('fyd');
    el.innerHTML = loadingHtml();
    unwrap(api.listAccountingEvents(fyid, {})).then(function (rows) {
      if (!rows.length) { el.innerHTML = emptyHtml(); return; }
      el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('thId')) + '</th><th>' + esc(t('fType')) + '</th><th>' + esc(t('fDoc')) + '</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 60).map(function (x) { return '<tr><td>' + x.id + '</td><td class="mono">' + esc(x.event_type || x.eventType || '') + '</td><td>' + esc(String(x.doc_id != null ? x.doc_id : (x.docId != null ? x.docId : ''))) + '</td><td><button class="btn ghost small" data-jev="' + x.id + '">' + esc(t('lines')) + '</button></td></tr>'; }).join('') + '</tbody></table></div><div id="jout" class="hint mono" style="margin-top:6px"></div>';
      el.querySelectorAll('[data-jev]').forEach(function (b) {
        b.addEventListener('click', function () {
          var eid = Number(b.getAttribute('data-jev'));
          Promise.all([unwrap(api.getAccountingEvent(eid)).catch(function (e) { return { _err: e }; }), unwrap(api.getJournalLines(eid)).catch(function (e) { return { _err: e }; })]).then(function (pair) {
            document.getElementById('jout').textContent = JSON.stringify(pair).slice(0, 2000);
          });
        });
      });
    }).catch(function (e) { el.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>'; });
  }

  /* ---------- router ---------- */
  var ROUTES = {
    dashboard: renderDashboard, articles: renderArticles, stock: renderStock,
    sales: renderSales, purchases: renderPurchases, parties: renderParties,
    cash: renderCash, counts: renderCounts, routes: renderRoutes,
    reports: renderReports, settings: renderSettings, notfound: renderNotFound
  };
  function currentRoute() {
    var h = String(window.location.hash || '#/dashboard');
    var m = h.match(/^#\/([a-z-]+)/);
    var id = m ? m[1] : 'dashboard';
    return ROUTES[id] ? id : 'notfound';
  }
  function renderNotFound() {
    view.innerHTML = pageHead(t('notFound'), t('notFoundHint'), '') +
      '<div class="card"><div class="toolbar">' +
      '<a class="btn secondary small" href="#/dashboard">' + esc(t('dashboard')) + '</a>' +
      '<a class="btn secondary small" href="#/articles">' + esc(t('articles')) + '</a>' +
      '<a class="btn secondary small" href="#/stock">' + esc(t('stock')) + '</a>' +
      '<a class="btn secondary small" href="#/sales">' + esc(t('sales')) + '</a>' +
      '<a class="btn secondary small" href="#/settings">' + esc(t('settings')) + '</a></div>' +
      '<div class="hint mono">' + esc(String(window.location.hash || '')) + '</div></div>';
  }
  function render() {
    state.route = currentRoute();
    renderNav();
    view = document.getElementById('view');
    try {
      ROUTES[state.route]();
    } catch (e) {
      view.innerHTML = '<div class="alert err">' + esc(errMsg(e)) + '</div>';
    }
    view.focus({ preventScroll: true });
  }

  var TRANSPORT = { ar: 'سطح المكتب · API محلي', fr: 'desktop · API locale' };
  function init() {
    view = document.getElementById('view');
    var tr = document.getElementById('transport');
    renderNav();
    document.getElementById('lang-sel').addEventListener('change', function (e) { setLang(e.target.value); });
    document.getElementById('nav-toggle').addEventListener('click', function (e) {
      var open = !document.body.classList.contains('nav-collapsed');
      document.body.classList.toggle('nav-collapsed', open);
      e.currentTarget.setAttribute('aria-expanded', String(!open));
    });
    document.getElementById('global-search').addEventListener('input', function (e) {
      state.q = e.target.value.trim();
      if (state.route === 'articles') renderArticles();
      else if (state.q !== '') window.location.hash = '#/articles';
    });
    window.addEventListener('hashchange', render);
    if (!window.location.hash) window.location.hash = '#/dashboard';
    setLang('ar');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
