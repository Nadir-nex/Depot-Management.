/* Sidebar warnings widget — counts + clickable drill-down to edit menus.
   Talks only to window.api; navigates via window.__loadModule. */
(function () {
  const CAT_AR = {
    inventory: 'المخزون', pricing: 'الأسعار', customers: 'الزبائن',
    orders: 'الطلبيات', deliveries: 'التوصيل', employees: 'الموظفون',
    vehicles: 'المركبات', consistency: 'سلامة البيانات', activity: 'النشاط'
  };
  const SEV_AR = { danger: 'مشاكل حرجة', warn: 'تحتاج مراجعة', info: 'معلومات' };

  let cache = null;

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function refresh() {
    try {
      cache = await window.api.getWarnings({});
    } catch { return; }
    let d = 0, w = 0, i = 0;
    for (const x of cache.warnings) {
      if (x.severity === 'danger') d++;
      else if (x.severity === 'warn') w++;
      else i++;
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('w-danger', d); set('w-warn', w); set('w-info', i);
  }

  function ensureModal() {
    let m = document.getElementById('w-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'w-modal';
      m.className = 'modal hidden';
      m.innerHTML = `<div class="modal-box wide">
        <h3 id="w-modal-title">التنبيهات</h3>
        <div id="w-list" style="max-height:60vh;overflow-y:auto"></div>
        <div class="row"><button class="btn ghost close-modal" data-close="w-modal">إغلاق</button></div>
      </div>`;
      document.body.appendChild(m);
      m.querySelector('.close-modal').onclick = () => m.classList.add('hidden');
      m.onclick = (e) => { if (e.target === m) m.classList.add('hidden'); };
    }
    return m;
  }

  const CODE_AR = { zero_stock: 'بدون مخزون', no_cost: 'بدون تكلفة', no_price: 'بدون سعر' };
  const PRODUCT_CODES = ['zero_stock', 'no_cost', 'no_price'];

  // Build display entries for one severity: overlapping product warnings
  // (zero_stock/no_cost/no_price for the same item) collapse into ONE product
  // entry carrying its codes; every other warning stays individual.
  // `filter` is 'all' | a product code | 'other'. No diagnostic data is dropped:
  // the full `cache.warnings` array is untouched; only presentation groups.
  function buildEntries(severity, filter) {
    const rows = cache.warnings.filter(x => x.severity === severity);
    const groups = new Map();
    const singles = [];
    for (const x of rows) {
      const iid = x.ref && x.ref.item_id != null ? Number(x.ref.item_id) : null;
      if (iid != null && PRODUCT_CODES.includes(x.code)) {
        if (!groups.has(iid)) groups.set(iid, { kind: 'product', item_id: iid, codes: [], raws: [] });
        const g = groups.get(iid);
        if (!g.codes.includes(x.code)) g.codes.push(x.code);
        g.raws.push(x);
      } else {
        singles.push({ kind: 'single', warning: x });
      }
    }
    let entries = [];
    for (const g of groups.values()) {
      if (filter === 'all' || g.codes.includes(filter)) entries.push(g);
    }
    for (const s of singles) {
      if (filter === 'all' || filter === 'other') entries.push(s);
    }
    entries.sort((a, b) => {
      const ai = a.kind === 'product' ? a.item_id : Number.MAX_SAFE_INTEGER;
      const bi = b.kind === 'product' ? b.item_id : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
    return { entries, detailCount: rows.length };
  }

  function routeEntry(entry) {
    if (entry.kind === 'product') {
      const onlyStock = entry.codes.length === 1 && entry.codes[0] === 'zero_stock';
      if (onlyStock) return go('inventory', () => window.InventoryModule.focusProduct(entry.item_id));
      return go('inventory', () => window.InventoryModule.openEditItem(entry.item_id));
    }
    route(entry.warning);
  }

  function openList(severity) {
    if (!cache) return;
    const m = ensureModal();
    document.getElementById('w-modal-title').textContent = 'التنبيهات — ' + (SEV_AR[severity] || severity);
    const box = document.getElementById('w-list');
    // paginate product-group entries (not duplicated rows) so hundreds of
    // products stay readable; header always shows affected products vs details.
    const PAGE = 100;
    let page = 0;
    let filter = 'all';
    const render = () => {
      const { entries, detailCount } = buildEntries(severity, filter);
      const affected = entries.filter(e => e.kind === 'product').length;
      const totalPages = Math.max(1, Math.ceil(entries.length / PAGE));
      if (page > totalPages - 1) page = totalPages - 1;
      const slice = entries.slice(page * PAGE, page * PAGE + PAGE);
      box.innerHTML = '';
      const filters = document.createElement('div');
      filters.className = 'row';
      const opts = [['all', 'الكل'], ['zero_stock', 'بدون مخزون'], ['no_cost', 'بدون تكلفة'], ['no_price', 'بدون سعر'], ['other', 'أخرى']];
      filters.innerHTML = opts.map(([v, l]) => `<button class="btn ${filter === v ? 'cyan' : 'ghost'}" data-wf="${v}">${l}</button>`).join('');
      box.appendChild(filters);
      filters.onclick = (e) => {
        const b = e.target.closest('[data-wf]');
        if (!b) return;
        filter = b.dataset.wf;
        page = 0;
        render();
      };
      const info = document.createElement('p');
      info.className = 'hint';
      info.textContent = entries.length
        ? `منتجات متأثرة: ${affected} — تفاصيل: ${detailCount} — عرض ${entries.length} سجل (صفحة ${page + 1} من ${totalPages})${cache.truncated ? ' — مقتطعة عند حد الأمان' : ''}`
        : 'لا شيء هنا ✓';
      box.appendChild(info);
      slice.forEach((entry) => {
        const b = document.createElement('button');
        b.className = 'w-item';
        if (entry.kind === 'product') {
          const name = entry.raws[0] ? entry.raws[0].message.match(/«(.+)»/) : null;
          const label = name ? name[1] : ('#' + entry.item_id);
          b.innerHTML = `<span class="w-cat">منتج: </span>${escapeHtml(label)} <small>(#${entry.item_id}) — ${entry.codes.map(c => CODE_AR[c] || c).join('، ')}</small>`;
        } else {
          const x = entry.warning;
          b.innerHTML = `<span class="w-cat">${CAT_AR[x.category] || x.category} — </span>${escapeHtml(x.message)}`;
        }
        b.onclick = () => { m.classList.add('hidden'); routeEntry(entry); };
        box.appendChild(b);
      });
      if (totalPages > 1) {
        const pager = document.createElement('div');
        pager.className = 'row';
        pager.innerHTML = `<button class="btn ghost" id="w-prev">السابق</button><span class="hint">صفحة ${page + 1} من ${totalPages}</span><button class="btn ghost" id="w-next">التالي</button>`;
        box.appendChild(pager);
        pager.querySelector('#w-prev').onclick = (e) => { e.stopPropagation(); if (page > 0) { page--; render(); } };
        pager.querySelector('#w-next').onclick = (e) => { e.stopPropagation(); if (page < totalPages - 1) { page++; render(); } };
      }
    };
    render();
    m.classList.remove('hidden');
  }

  function go(module, fn) {
    if (window.__loadModule) window.__loadModule(module);
    if (fn) setTimeout(fn, 250);
  }

  // Route a warning to the workflow that fixes it.
  // NO edit popup for informational stock warnings: zero_stock navigates to
  // inventory and highlights the product; cost/price warnings open the unified
  // product editor where cost/pricing can actually be corrected.
  function route(x) {
    const r = x.ref || {};
    const code = x.code || '';
    if (code === 'zero_stock') {
      if (r.item_id) return go('inventory', () => window.InventoryModule.focusProduct(r.item_id));
      return go('inventory');
    }
    if (code === 'no_cost' || code === 'no_price') {
      if (r.item_id) return go('inventory', () => window.InventoryModule.openEditItem(r.item_id));
      return go('inventory');
    }
    if (r.item_id) return go('inventory', () => window.InventoryModule.openEditItem(r.item_id));
    if (r.shipment_id) return go('inventory', () => window.InventoryModule.openEditShipment(r.shipment_id));
    if (r.customer_id) {
      // customer card works from anywhere, but land on customers for context
      return go('customers', () => window.CustomersModule.openDetail(r.customer_id));
    }
    if (r.order_id) return go('orders', () => window.OrdersModule.openDetail(r.order_id));
    if (r.delivery_id) return go('deliveries', () => window.DeliveryModule.openDetail(r.delivery_id));
    if (r.employee_id || r.vehicle_id) return go('staff');
    if (r.type_id) return go('customers');
    // no direct record: land on the most relevant list
    const landing = { inventory: 'inventory', pricing: 'inventory', customers: 'customers', orders: 'orders', deliveries: 'deliveries', employees: 'staff', vehicles: 'staff', consistency: 'customers', activity: 'orders' };
    return go(landing[x.category] || 'inventory');
  }

  function bind() {
    document.querySelectorAll('#side-warnings .warn-row').forEach(el => {
      el.onclick = () => openList(el.dataset.sev);
    });
  }

  window.WarningsWidget = { refresh, openList };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bind(); refresh(); });
  else { bind(); refresh(); }
})();
