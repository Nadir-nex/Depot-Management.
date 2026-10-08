/* Inventory module — منتجات + فئات + شركات + شحنات (add + edit prefill + delete) */
(function () {
  let view = 'products'; // 'products' | 'expiry'
  let editingItemId = null;
  let editingCatId = null;
  let editingCompId = null;
  let editingShipmentId = null;

  async function ensureTemplate(root) {
    if (root.querySelector('.inv')) return;
    const res = await fetch('modules/inventory/inventory.html');
    root.innerHTML = await res.text();
  }

  function expiryBadge(dateStr) {
    if (!dateStr) return '<span class="badge ok">—</span>';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays < 0) return `<span class="badge danger">${dateStr} — منتهي</span>`;
    if (diffDays <= 90) return `<span class="badge warn">${dateStr} — قريب</span>`;
    return `<span class="badge ok">${dateStr}</span>`;
  }

  function isNearExpiry(dateStr) {
    if (!dateStr) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000) <= 90;
  }

  function colorPill(name, color) {
    if (!name) return '<span style="color:#6b8aa0">—</span>';
    const c = color || '#0288d1';
    return `<span class="pill" style="background:${c}22;border:1px solid ${c};color:${c}">${escapeHtml(name)}</span>`;
  }

  function filters() {
    return {
      search: document.getElementById('search')?.value || '',
      catId: document.getElementById('filter-cat')?.value ? Number(document.getElementById('filter-cat').value) : null,
      compId: document.getElementById('filter-comp')?.value ? Number(document.getElementById('filter-comp').value) : null,
      sort: document.getElementById('sort-exp')?.value || 'expiry_asc'
    };
  }

  async function loadLookups() {
    const [cats, comps] = await Promise.all([window.api.listCategories(), window.api.listCompanies()]);
    const fc = document.getElementById('filter-cat');
    const fp = document.getElementById('filter-comp');
    const fiC = document.getElementById('f-item-cat');
    const fiP = document.getElementById('f-item-comp');
    const keepFc = fc?.value, keepFp = fp?.value;
    if (fc) fc.innerHTML = '<option value="">كل الفئات</option>' + cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (fp) fp.innerHTML = '<option value="">كل الشركات</option>' + comps.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (fc && keepFc) fc.value = keepFc;
    if (fp && keepFp) fp.value = keepFp;
    if (fiC) {
      const keep = fiC.value;
      fiC.innerHTML = '<option value="">— بدون —</option>' + cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      fiC.value = keep || '';
    }
    if (fiP) {
      const keep = fiP.value;
      fiP.innerHTML = '<option value="">— بدون —</option>' + comps.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      fiP.value = keep || '';
    }
  }

  function setView(v) {
    view = v;
    document.getElementById('card-products')?.classList.toggle('active', v === 'products');
    document.getElementById('card-qty')?.classList.toggle('active', v === 'products');
    document.getElementById('card-exp')?.classList.toggle('active', v === 'expiry');
    document.getElementById('products-wrap')?.classList.toggle('hidden', v !== 'products');
    document.getElementById('expiry-wrap')?.classList.toggle('hidden', v !== 'expiry');
    document.getElementById('sort-exp')?.classList.toggle('hidden', v !== 'expiry');
    document.getElementById('view-title').textContent = v === 'expiry' ? 'الشحنات — كل شحنة على حدة' : 'قائمة المنتجات';
    refresh();
  }

  async function refresh() {
    const f = filters();
    const [items, detailed] = await Promise.all([
      window.api.listItems(f.search, f.catId, f.compId),
      window.api.listShipmentsDetailed(f.search, f.catId, f.compId, false, f.sort)
    ]);

    // stats follow current search/filters
    document.getElementById('stat-items').textContent = items.length;
    document.getElementById('stat-qty').textContent = items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
    document.getElementById('stat-exp').textContent = detailed.filter(d => isNearExpiry(d.expiry_date)).length;

    if (view === 'products') {
      const body = document.getElementById('items-body');
      body.innerHTML = items.length ? '' : '<tr><td colspan="9" style="text-align:center;color:#6b8aa0">لا منتجات — أضف منتج جديد</td></tr>';
      for (const it of items) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escapeHtml(it.name)}</strong></td>
          <td dir="ltr">${escapeHtml(it.barcode || '—')}</td>
          <td>${colorPill(it.category_name, it.category_color)}</td>
          <td>${colorPill(it.company_name, it.company_color)}</td>
          <td><strong>${it.qty}</strong></td>
          <td>${expiryBadge(it.nearest_expiry)}</td>
          <td>${it.last_buy ?? '—'}</td>
          <td>${it.avg_cost != null ? Number(it.avg_cost).toFixed(2) : '—'}</td>
          <td><button class="link" data-edit-item="${it.id}">تعديل</button> <button class="link" data-ship="${it.id}">+ شحنة</button></td>`;
        body.appendChild(tr);
      }
      const sel = document.getElementById('f-sh-item');
      if (sel) {
        const keep = sel.value;
        sel.innerHTML = items.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
        if (keep) sel.value = keep;
      }
    } else {
      // expiry view: one row per shipment WITH expiry date, same search/cat/comp filters
      const rows = detailed.filter(d => d.expiry_date);
      const body = document.getElementById('expiry-body');
      body.innerHTML = rows.length ? '' : '<tr><td colspan="8" style="text-align:center;color:#6b8aa0">لا شحنات بتواريخ انتهاء مطابقة للبحث</td></tr>';
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escapeHtml(r.item_name)}</strong><br><small dir="ltr" style="color:#6b8aa0">${escapeHtml(r.barcode || '')}</small></td>
          <td>${colorPill(r.category_name, r.category_color)}</td>
          <td>${colorPill(r.company_name, r.company_color)}</td>
          <td><strong>${r.qty}</strong></td>
          <td>${expiryBadge(r.expiry_date)}</td>
          <td>${r.buy_price ?? '—'}</td>
          <td>${escapeHtml(r.supplier || '—')}</td>
          <td><button class="link" data-edit-sh="${r.id}">تعديل</button></td>`;
        body.appendChild(tr);
      }
    }
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function open(id) { document.getElementById(id).classList.remove('hidden'); }
  function close(id) { document.getElementById(id).classList.add('hidden'); }

  // ---- receipt CSV import (locked format: product,purchase_price,quantity) ----
  function parseCsv(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const lines = clean.split(/\r?\n/);
    if (!lines.length) return [];
    const delim = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
    const splitRow = (line) => {
      const cells = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = false;
          } else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === delim) { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      return cells.map(c => c.trim());
    };
    const rows = [];
    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      const cells = splitRow(line);
      if (idx === 0 && cells[0].toLowerCase() === 'product') return; // header
      rows.push({ product: cells[0] || '', purchase_price: cells[1] || '', quantity: cells[2] || '' });
    });
    return rows;
  }

  function showImportResult(report) {
    const el = document.getElementById('import-result');
    const parts = [`صفوف: ${report.total}`, `منتجات جديدة: ${report.created}`, `مطابقة: ${report.matched}`, `شحنات: ${report.shipments}`, `بدون شحنة: ${report.product_only}`];
    if (report.skipped.length) parts.push(`ملاحظات: ${report.skipped.length} (أولها: ${report.skipped[0].row} — ${report.skipped[0].reason})`);
    el.textContent = 'نتيجة الاستيراد — ' + parts.join('، ');
    el.classList.remove('hidden');
  }

  // ---- unified product editor (metadata + cost + customer-type pricing + history) ----
  // Pricing is rendered as independent div rows (ONE ROW = ONE CUSTOMER TYPE),
  // never an HTML table. `editingPriceTypeId` tracks which row shows its inline editor.
  let editingPriceTypeId = null;
  function openAddItem() {
    editingItemId = null;
    editingPriceTypeId = null;
    document.getElementById('item-modal-title').textContent = 'منتج جديد';
    document.getElementById('f-item-name').value = '';
    document.getElementById('f-item-barcode').value = '';
    document.getElementById('f-item-cat').value = '';
    document.getElementById('f-item-comp').value = '';
    document.getElementById('err-item').textContent = '';
    document.getElementById('err-item-cost').textContent = '';
    document.getElementById('err-item-pricing').textContent = '';
    document.getElementById('del-item').classList.add('hidden');
    // no pricing for a not-yet-created product
    document.getElementById('item-pricing-section').classList.add('hidden');
    document.getElementById('item-pricing-section-info').classList.add('hidden');
    open('modal-item');
  }

  async function openEditItem(id) {
    const it = await window.api.getItem(id);
    if (!it) return;
    editingItemId = id;
    editingPriceTypeId = null;
    await loadLookups();
    document.getElementById('item-modal-title').textContent = `تعديل المنتج #${id}`;
    document.getElementById('f-item-name').value = it.name || '';
    document.getElementById('f-item-barcode').value = it.barcode || '';
    document.getElementById('f-item-cat').value = it.category_id || '';
    document.getElementById('f-item-comp').value = it.company_id || '';
    document.getElementById('err-item').textContent = '';
    document.getElementById('err-item-cost').textContent = '';
    document.getElementById('err-item-pricing').textContent = '';
    document.getElementById('del-item').classList.remove('hidden');
    document.getElementById('item-pricing-section').classList.remove('hidden');
    document.getElementById('item-pricing-section-info').classList.remove('hidden');
    await refreshItemPricing();
    open('modal-item');
  }

  // Navigate to inventory and highlight a product (used for informational warnings
  // such as no-stock: NO edit popup is opened).
  async function focusProduct(id) {
    setView('products');
    try {
      const it = await window.api.getItem(Number(id));
      const search = document.getElementById('search');
      if (search && it) { search.value = it.name || String(id); }
      await refresh();
      const btn = document.querySelector(`[data-edit-item="${Number(id)}"]`);
      const tr = btn ? btn.closest('tr') : null;
      if (tr) {
        tr.classList.add('flash');
        tr.scrollIntoView({ block: 'center' });
        setTimeout(() => tr.classList.remove('flash'), 1700);
      }
    } catch {}
  }

  // Render dynamic customer-type pricing rows: ONE ROW = ONE TYPE, works for 1..N
  // types with no special cases. Data always comes from the database
  // (customer_types.name/markup_percentage + product_prices.auto_price and
  // COALESCE(manual_price, auto_price)); the renderer never computes prices.
  function renderItemPriceRows(prices) {
    const box = document.getElementById('item-price-rows');
    if (!prices.length) {
      box.innerHTML = '<p class="hint" style="text-align:center">لا أسعار بعد — أضف شحنة شراء بتكلفة صالحة أولاً، أو أضف نوع زبون.</p>';
      return;
    }
    box.innerHTML = '';
    for (const p of prices) {
      const tid = p.customer_type_id;
      const isMan = Number(p.is_manual) === 1;
      const eff = p.effective_price;
      const row = document.createElement('div');
      row.className = 'price-row' + (isMan ? ' is-manual' : '');
      const stateTxt = isMan ? 'معدل يدوياً' : 'محسوب تلقائياً';
      const stateCls = isMan ? 'manual' : 'auto';
      if (editingPriceTypeId === tid) {
        row.innerHTML =
          `<span class="pr-name">${escapeHtml(p.customer_type_name)}</span>` +
          `<span class="pr-pct" dir="ltr">+${p.markup_percentage}%</span>` +
          `<span class="pr-price">${eff != null ? eff : '—'}${eff != null ? ' DA' : ''}</span>` +
          `<span class="pr-actions"><span class="pr-edit"><input type="number" min="1" step="1" dir="ltr" data-row-input="${tid}" value="${p.manual_price ?? ''}" placeholder="${p.auto_price}" /><button class="btn cyan" data-row-save="${tid}">حفظ</button><button class="btn ghost" data-row-cancel="${tid}">إلغاء</button></span></span>` +
          `<span class="pr-state ${stateCls}">${stateTxt}</span>`;
      } else {
        row.innerHTML =
          `<span class="pr-name">${escapeHtml(p.customer_type_name)}</span>` +
          `<span class="pr-pct" dir="ltr">+${p.markup_percentage}%</span>` +
          `<span class="pr-price">${eff != null ? eff : '—'}${eff != null ? ' DA' : ''}</span>` +
          `<span class="pr-actions"><button class="link" data-row-edit="${tid}">تعديل السعر</button>` +
          (isMan ? ` <button class="link" data-row-clear="${tid}">مسح التعديل</button>` : '') + `</span>` +
          `<span class="pr-state ${stateCls}">${stateTxt}</span>`;
      }
      box.appendChild(row);
    }
  }

  async function refreshItemPricing() {
    if (!editingItemId) return;
    let cost = { current_cost: 0, wavg_cost: 0, stock: 0, last_buy: null };
    let prices = [];
    try { cost = await window.api.getProductCost(editingItemId); } catch {}
    try { prices = await window.api.getProductPrices(editingItemId); } catch {}
    const hasCost = (Number(cost.stock) || 0) > 0 && (Number(cost.current_cost) || 0) > 0;
    document.getElementById('item-cost-meta').innerHTML =
      `<p class="hint">آخر شراء: <strong>${cost.last_buy ?? '—'}</strong> — ` +
      `متوسط التكلفة: <strong>${Number(cost.wavg_cost || 0).toFixed(2)}</strong> — ` +
      `المخزون: <strong>${cost.stock ?? 0}</strong>` +
      (hasCost ? '' : ' — <strong>لا توجد تكلفة</strong> (أسعار البيع غير متوفرة حتى إضافة شحنة شراء)') + `</p>`;
    // Do not clobber the cost field while the user is editing it.
    if (document.activeElement !== document.getElementById('f-item-cost')) {
      document.getElementById('f-item-cost').value = cost.current_cost ?? 0;
    }
    renderItemPriceRows(prices);
  }

  async function renderCatList() {
    const cats = await window.api.listCategories();
    const box = document.getElementById('cat-list');
    box.innerHTML = cats.length ? '' : '<p class="hint">لا فئات بعد.</p>';
    for (const c of cats) {
      const div = document.createElement('div');
      div.className = 'c-district-row';
      div.innerHTML = `<span>${escapeHtml(c.name)}</span><span><button class="link" data-cat-edit="${c.id}">تعديل</button> <button class="link" data-cat-del="${c.id}">حذف</button></span>`;
      box.appendChild(div);
    }
  }

  async function renderCompList() {
    const comps = await window.api.listCompanies();
    const box = document.getElementById('comp-list');
    box.innerHTML = comps.length ? '' : '<p class="hint">لا شركات بعد.</p>';
    for (const c of comps) {
      const div = document.createElement('div');
      div.className = 'c-district-row';
      div.innerHTML = `<span>${escapeHtml(c.name)}</span><span><button class="link" data-comp-edit="${c.id}">تعديل</button> <button class="link" data-comp-del="${c.id}">حذف</button></span>`;
      box.appendChild(div);
    }
  }

  function openAddCat() {
    editingCatId = null;
    document.getElementById('cat-modal-title').textContent = 'فئة جديدة';
    document.getElementById('f-cat-name').value = '';
    document.getElementById('err-cat').textContent = '';
    document.getElementById('del-cat').classList.add('hidden');
  }

  function openAddComp() {
    editingCompId = null;
    document.getElementById('comp-modal-title').textContent = 'شركة جديدة';
    document.getElementById('f-comp-name').value = '';
    document.getElementById('err-comp').textContent = '';
    document.getElementById('del-comp').classList.add('hidden');
  }

  function openAddShipment(presetItemId) {
    editingShipmentId = null;
    document.getElementById('sh-modal-title').textContent = 'شحنة جديدة';
    document.getElementById('f-sh-item').disabled = false;
    if (presetItemId) document.getElementById('f-sh-item').value = presetItemId;
    document.getElementById('f-sh-qty').value = 10;
    document.getElementById('f-sh-buy').value = 0;
    document.getElementById('f-sh-exp').value = '';
    document.getElementById('f-sh-supplier').value = '';
    document.getElementById('err-sh').textContent = '';
    document.getElementById('del-shipment').classList.add('hidden');
    open('modal-shipment');
  }

  async function openEditShipment(id) {
    const s = await window.api.getShipment(id);
    if (!s) return;
    editingShipmentId = id;
    document.getElementById('sh-modal-title').textContent = `تعديل الشحنة #${id} (المنتج ثابت)`;
    document.getElementById('f-sh-item').value = s.item_id;
    document.getElementById('f-sh-item').disabled = true;
    document.getElementById('f-sh-qty').value = s.qty;
    document.getElementById('f-sh-buy').value = s.buy_price ?? 0;
    document.getElementById('f-sh-exp').value = (s.expiry_date || '').slice(0, 10);
    document.getElementById('f-sh-supplier').value = s.supplier || '';
    document.getElementById('err-sh').textContent = '';
    document.getElementById('del-shipment').classList.remove('hidden');
    open('modal-shipment');
  }

  // ---- product pricing table (ONE product, types as columns) ----
  // Legacy standalone pricing popup removed: pricing now lives inside the unified
  // product editor (openEditItem + refreshItemPricing). Kept as a thin alias so any
  // external caller lands in the unified editor instead of a second modal.
  async function openPricing(itemId) {
    return openEditItem(Number(itemId));
  }

  async function mount(root) {
    await ensureTemplate(root);
    await loadLookups();

    document.getElementById('btn-add-item').onclick = openAddItem;
    document.getElementById('btn-add-shipment').onclick = () => { document.getElementById('err-sh').textContent = ''; openAddShipment(null); };
    document.getElementById('btn-cat').onclick = async () => { document.getElementById('err-cat').textContent = ''; openAddCat(); await renderCatList(); open('modal-cat'); };
    document.getElementById('btn-comp').onclick = async () => { document.getElementById('err-comp').textContent = ''; openAddComp(); await renderCompList(); open('modal-comp'); };
    document.getElementById('btn-import').onclick = () => document.getElementById('file-import').click();
    document.getElementById('file-import').onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const text = await f.text();
      const rows = parseCsv(text);
      if (!rows.length) { window.alert('الملف فارغ أو بدون صفوف صالحة'); return; }
      const names = new Set(rows.map(r => r.product.trim()).filter(Boolean));
      const withShip = rows.filter(r => r.product.trim() && r.purchase_price.trim() && r.quantity.trim()).length;
      if (!window.confirm(`استيراد ${rows.length} صف (${names.size} منتج مميز، ${withShip} شحنة محتملة)؟\nالمنتج الموجود يُطابق بالاسم، والصف بدون سعر/كمية يُنشئ المنتج فقط.`)) return;
      try {
        const report = await window.api.importReceipt(rows);
        showImportResult(report);
        await loadLookups(); await refresh();
      } catch (err) { window.alert('فشل الاستيراد: ' + err.message); }
    };
    document.getElementById('btn-refresh').onclick = refresh;
    document.getElementById('search').oninput = () => refresh();
    document.getElementById('filter-cat').onchange = () => refresh();
    document.getElementById('filter-comp').onchange = () => refresh();
    document.getElementById('sort-exp').onchange = () => refresh();
    document.getElementById('card-products').onclick = () => setView('products');
    document.getElementById('card-qty').onclick = () => setView('products');
    document.getElementById('card-exp').onclick = () => setView('expiry');
    root.querySelectorAll('.close-modal').forEach(b => b.onclick = () => close(b.dataset.close));

    document.getElementById('save-item').onclick = async () => {
      const payload = {
        name: document.getElementById('f-item-name').value,
        barcode: document.getElementById('f-item-barcode').value,
        category_id: Number(document.getElementById('f-item-cat').value) || null,
        company_id: Number(document.getElementById('f-item-comp').value) || null
      };
      try {
        if (editingItemId) await window.api.updateItem({ id: editingItemId, ...payload });
        else await window.api.addItem(payload);
        document.getElementById('f-item-name').value = '';
        document.getElementById('f-item-barcode').value = '';
        editingItemId = null;
        close('modal-item');
        await refresh();
      } catch (e) { document.getElementById('err-item').textContent = e.message; }
    };

    document.getElementById('del-item').onclick = async () => {
      if (!editingItemId) return;
      if (!window.confirm('حذف هذا المنتج نهائياً؟ (ممنوع إذا لديه شحنات أو طلبيات)')) return;
      try {
        await window.api.deleteItem(editingItemId);
        editingItemId = null;
        close('modal-item');
        await refresh();
      } catch (e) { document.getElementById('err-item').textContent = e.message; }
    };

    document.getElementById('save-cat').onclick = async () => {
      const payload = { name: document.getElementById('f-cat-name').value, color: document.getElementById('f-cat-color').value };
      try {
        if (editingCatId) await window.api.updateCategory({ id: editingCatId, ...payload });
        else await window.api.addCategory(payload);
        document.getElementById('f-cat-name').value = '';
        editingCatId = null;
        document.getElementById('cat-modal-title').textContent = 'فئة جديدة';
        document.getElementById('del-cat').classList.add('hidden');
        await renderCatList();
        await loadLookups(); await refresh();
      } catch (e) { document.getElementById('err-cat').textContent = e.message; }
    };

    document.getElementById('del-cat').onclick = async () => {
      if (!editingCatId) return;
      if (!window.confirm('حذف هذه الفئة؟ ستصبح منتجاتها بدون فئة.')) return;
      try {
        await window.api.deleteCategory(editingCatId);
        editingCatId = null;
        document.getElementById('f-cat-name').value = '';
        document.getElementById('cat-modal-title').textContent = 'فئة جديدة';
        document.getElementById('del-cat').classList.add('hidden');
        await renderCatList();
        await loadLookups(); await refresh();
      } catch (e) { document.getElementById('err-cat').textContent = e.message; }
    };

    document.getElementById('cat-list').onclick = async (e) => {
      const ed = e.target.closest('[data-cat-edit]');
      const del = e.target.closest('[data-cat-del]');
      if (ed) {
        const cats = await window.api.listCategories();
        const c = cats.find(x => x.id === Number(ed.dataset.catEdit));
        if (!c) return;
        editingCatId = c.id;
        document.getElementById('cat-modal-title').textContent = `تعديل الفئة #${c.id}`;
        document.getElementById('f-cat-name').value = c.name;
        document.getElementById('f-cat-color').value = c.color || '#0288d1';
        document.getElementById('del-cat').classList.remove('hidden');
      } else if (del) {
        if (!window.confirm('حذف هذه الفئة؟ ستصبح منتجاتها بدون فئة.')) return;
        try {
          await window.api.deleteCategory(Number(del.dataset.catDel));
          if (editingCatId === Number(del.dataset.catDel)) { editingCatId = null; document.getElementById('f-cat-name').value = ''; document.getElementById('del-cat').classList.add('hidden'); }
          await renderCatList();
          await loadLookups(); await refresh();
        } catch (err) { document.getElementById('err-cat').textContent = err.message; }
      }
    };

    document.getElementById('save-comp').onclick = async () => {
      const payload = { name: document.getElementById('f-comp-name').value, color: document.getElementById('f-comp-color').value };
      try {
        if (editingCompId) await window.api.updateCompany({ id: editingCompId, ...payload });
        else await window.api.addCompany(payload);
        document.getElementById('f-comp-name').value = '';
        editingCompId = null;
        document.getElementById('comp-modal-title').textContent = 'شركة جديدة';
        document.getElementById('del-comp').classList.add('hidden');
        await renderCompList();
        await loadLookups(); await refresh();
      } catch (e) { document.getElementById('err-comp').textContent = e.message; }
    };

    document.getElementById('del-comp').onclick = async () => {
      if (!editingCompId) return;
      if (!window.confirm('حذف هذه الشركة؟ ستصبح منتجاتها بدون شركة.')) return;
      try {
        await window.api.deleteCompany(editingCompId);
        editingCompId = null;
        document.getElementById('f-comp-name').value = '';
        document.getElementById('comp-modal-title').textContent = 'شركة جديدة';
        document.getElementById('del-comp').classList.add('hidden');
        await renderCompList();
        await loadLookups(); await refresh();
      } catch (e) { document.getElementById('err-comp').textContent = e.message; }
    };

    document.getElementById('comp-list').onclick = async (e) => {
      const ed = e.target.closest('[data-comp-edit]');
      const del = e.target.closest('[data-comp-del]');
      if (ed) {
        const comps = await window.api.listCompanies();
        const c = comps.find(x => x.id === Number(ed.dataset.compEdit));
        if (!c) return;
        editingCompId = c.id;
        document.getElementById('comp-modal-title').textContent = `تعديل الشركة #${c.id}`;
        document.getElementById('f-comp-name').value = c.name;
        document.getElementById('f-comp-color').value = c.color || '#6a1b9a';
        document.getElementById('del-comp').classList.remove('hidden');
      } else if (del) {
        if (!window.confirm('حذف هذه الشركة؟ ستصبح منتجاتها بدون شركة.')) return;
        try {
          await window.api.deleteCompany(Number(del.dataset.compDel));
          if (editingCompId === Number(del.dataset.compDel)) { editingCompId = null; document.getElementById('f-comp-name').value = ''; document.getElementById('del-comp').classList.add('hidden'); }
          await renderCompList();
          await loadLookups(); await refresh();
        } catch (err) { document.getElementById('err-comp').textContent = err.message; }
      }
    };

    document.getElementById('save-shipment').onclick = async () => {
      const payload = {
        item_id: Number(document.getElementById('f-sh-item').value),
        qty: document.getElementById('f-sh-qty').value,
        buy_price: document.getElementById('f-sh-buy').value,
        sell_price: 0,
        expiry_date: document.getElementById('f-sh-exp').value,
        supplier: document.getElementById('f-sh-supplier').value
      };
      try {
        if (editingShipmentId) await window.api.updateShipment({ id: editingShipmentId, ...payload });
        else await window.api.addShipment(payload);
        editingShipmentId = null;
        close('modal-shipment');
        await refresh();
      } catch (e) { document.getElementById('err-sh').textContent = e.message; }
    };

    document.getElementById('del-shipment').onclick = async () => {
      if (!editingShipmentId) return;
      if (!window.confirm('حذف هذه الشحنة؟ سيعيد حساب التكلفة الحالية والأسعار التلقائية (الأسعار اليدوية تبقى).')) return;
      try {
        await window.api.deleteShipment(editingShipmentId);
        editingShipmentId = null;
        close('modal-shipment');
        await refresh();
      } catch (e) { document.getElementById('err-sh').textContent = e.message; }
    };

    // Cost saves inline on change (blur/Enter) — no separate save button.
    document.getElementById('f-item-cost').onchange = async (e) => {
      if (!editingItemId) return;
      try {
        document.getElementById('err-item-cost').textContent = '';
        await window.api.setProductCost(editingItemId, e.target.value);
        await refreshItemPricing();
        await refresh();
      } catch (err) {
        document.getElementById('err-item-cost').textContent = err.message;
        // restore last saved value so the field never shows an unsaved invalid number
        try {
          const cost = await window.api.getProductCost(editingItemId);
          e.target.value = cost.current_cost ?? 0;
        } catch {}
      }
    };

    document.getElementById('item-price-rows').onclick = async (e) => {
      const ed = e.target.closest('[data-row-edit]');
      const sv = e.target.closest('[data-row-save]');
      const cx = e.target.closest('[data-row-cancel]');
      const cl = e.target.closest('[data-row-clear]');
      try {
        document.getElementById('err-item-pricing').textContent = '';
        if (ed) {
          editingPriceTypeId = Number(ed.dataset.rowEdit);
          await refreshItemPricing();
          const inp = document.querySelector(`[data-row-input="${editingPriceTypeId}"]`);
          if (inp) inp.focus();
        } else if (sv) {
          const tid = Number(sv.dataset.rowSave);
          const inp = document.querySelector(`[data-row-input="${tid}"]`);
          const v = inp ? inp.value : '';
          if (String(v).trim() === '') { document.getElementById('err-item-pricing').textContent = 'أدخل السعر الجديد أولاً'; return; }
          await window.api.setManualPrice(editingItemId, tid, v);
          editingPriceTypeId = null;
          await refreshItemPricing();
        } else if (cx) {
          editingPriceTypeId = null;
          await refreshItemPricing();
        } else if (cl) {
          await window.api.clearManualPrice(editingItemId, Number(cl.dataset.rowClear));
          editingPriceTypeId = null;
          await refreshItemPricing();
        }
      } catch (err) { document.getElementById('err-item-pricing').textContent = err.message; }
    };

    document.getElementById('items-body').onclick = (e) => {
      const ed = e.target.closest('[data-edit-item]');
      const sh = e.target.closest('[data-ship]');
      if (ed) openEditItem(Number(ed.dataset.editItem));
      else if (sh) openAddShipment(Number(sh.dataset.ship));
    };

    document.getElementById('expiry-body').onclick = (e) => {
      const ed = e.target.closest('[data-edit-sh]');
      if (ed) openEditShipment(Number(ed.dataset.editSh));
    };

    setView('products');
  }

  window.InventoryModule = { mount, openEditItem, openEditShipment, openPricing, focusProduct };
})();
