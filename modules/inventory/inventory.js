/* Inventory module — منتجات + فئات + شركات + شحنات */
(function () {
  let view = 'products'; // 'products' | 'expiry'

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
          <td>${it.last_sell ?? '—'}</td>
          <td><button class="link" data-ship="${it.id}">+ شحنة</button></td>`;
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
          <td>${r.sell_price ?? '—'}</td>
          <td>${escapeHtml(r.supplier || '—')}</td>`;
        body.appendChild(tr);
      }
    }
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function open(id) { document.getElementById(id).classList.remove('hidden'); }
  function close(id) { document.getElementById(id).classList.add('hidden'); }

  async function mount(root) {
    await ensureTemplate(root);
    await loadLookups();

    document.getElementById('btn-add-item').onclick = () => { document.getElementById('err-item').textContent = ''; open('modal-item'); };
    document.getElementById('btn-add-shipment').onclick = () => { document.getElementById('err-sh').textContent = ''; open('modal-shipment'); };
    document.getElementById('btn-cat').onclick = () => { document.getElementById('err-cat').textContent = ''; open('modal-cat'); };
    document.getElementById('btn-comp').onclick = () => { document.getElementById('err-comp').textContent = ''; open('modal-comp'); };
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
      try {
        await window.api.addItem({
          name: document.getElementById('f-item-name').value,
          barcode: document.getElementById('f-item-barcode').value,
          category_id: Number(document.getElementById('f-item-cat').value) || null,
          company_id: Number(document.getElementById('f-item-comp').value) || null
        });
        document.getElementById('f-item-name').value = '';
        document.getElementById('f-item-barcode').value = '';
        close('modal-item');
        await refresh();
      } catch (e) { document.getElementById('err-item').textContent = e.message; }
    };

    document.getElementById('save-cat').onclick = async () => {
      try {
        await window.api.addCategory({ name: document.getElementById('f-cat-name').value, color: document.getElementById('f-cat-color').value });
        document.getElementById('f-cat-name').value = '';
        close('modal-cat');
        await loadLookups(); await refresh();
      } catch (e) { document.getElementById('err-cat').textContent = e.message; }
    };

    document.getElementById('save-comp').onclick = async () => {
      try {
        await window.api.addCompany({ name: document.getElementById('f-comp-name').value, color: document.getElementById('f-comp-color').value });
        document.getElementById('f-comp-name').value = '';
        close('modal-comp');
        await loadLookups(); await refresh();
      } catch (e) { document.getElementById('err-comp').textContent = e.message; }
    };

    document.getElementById('save-shipment').onclick = async () => {
      const payload = {
        item_id: Number(document.getElementById('f-sh-item').value),
        qty: document.getElementById('f-sh-qty').value,
        buy_price: document.getElementById('f-sh-buy').value,
        sell_price: document.getElementById('f-sh-sell').value,
        expiry_date: document.getElementById('f-sh-exp').value,
        supplier: document.getElementById('f-sh-supplier').value
      };
      try {
        await window.api.addShipment(payload);
        close('modal-shipment');
        await refresh();
      } catch (e) { document.getElementById('err-sh').textContent = e.message; }
    };

    document.getElementById('items-body').onclick = (e) => {
      const btn = e.target.closest('[data-ship]');
      if (btn) {
        document.getElementById('f-sh-item').value = btn.dataset.ship;
        open('modal-shipment');
      }
    };

    setView('products');
  }

  window.InventoryModule = { mount };
})();
