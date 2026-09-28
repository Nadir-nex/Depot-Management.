/* Orders module — self-contained UI, talks only to window.api -> db */
(function () {
  const STATUS_AR = {
    draft: 'مسودة', confirmed: 'مؤكدة', waiting: 'بانتظار التوصيل',
    out_for_delivery: 'خارج للتوصيل', delivered: 'تم التوصيل', cancelled: 'ملغاة'
  };
  const NEXT_STATUS = { draft: 'confirmed', confirmed: 'waiting', waiting: 'out_for_delivery', out_for_delivery: 'delivered' };
  const NEXT_LABEL = { confirmed: 'تأكيد الطلبية', waiting: 'جدولة للتوصيل', out_for_delivery: 'خروج للتوصيل', delivered: 'تم التوصيل' };
  const SEARCH_PH = {
    id: 'ابحث برقم الطلب…', reference: 'ابحث بالمرجع (مثلا: C17-1042)…',
    customer_id: 'ابحث برقم الزبون…', customer_name: 'ابحث باسم الزبون…', phone: 'ابحث برقم الهاتف…'
  };

  let oMode = 'id';
  let oSort = 'newest';
  let oCard = 'all'; // all | draft | active | done
  let builder = null; // {editId, customer, items[], discount, notes}
  let pMode = 'name';

  async function ensureTemplate(root) {
    if (root.querySelector('.ord')) return;
    const res = await fetch('modules/orders/orders.html');
    root.innerHTML = await res.text();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function open(id) { document.getElementById(id).classList.remove('hidden'); }
  function close(id) { document.getElementById(id).classList.add('hidden'); }
  function statusPill(st) { return `<span class="status-pill st-${st}">${STATUS_AR[st] || st}</span>`; }

  function filters() {
    const cardStatus = oCard === 'draft' ? 'draft' : oCard === 'active' ? 'active' : oCard === 'done' ? 'delivered' : null;
    const selStatus = document.getElementById('o-filter-status')?.value || '';
    return {
      mode: oMode,
      query: document.getElementById('o-search')?.value || '',
      status: selStatus || cardStatus,
      districtId: document.getElementById('o-filter-district')?.value ? Number(document.getElementById('o-filter-district').value) : null,
      deliveryDate: document.getElementById('o-filter-date')?.value || null,
      sort: oSort
    };
  }

  async function loadDistricts() {
    const ds = await window.api.listDistricts();
    const f = document.getElementById('o-filter-district');
    const keep = f?.value;
    if (f) f.innerHTML = '<option value="">كل المناطق</option>' + ds.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    if (f && keep) f.value = keep;
  }

  async function refresh() {
    const f = filters();
    const rows = await window.api.listOrders(f);
    const body = document.getElementById('o-body');
    body.innerHTML = rows.length ? '' : '<tr><td colspan="9" style="text-align:center;color:#6b8aa0">لا طلبيات — أضف طلبية جديدة</td></tr>';
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${r.id}</strong></td>
        <td dir="ltr">${escapeHtml(r.reference)}</td>
        <td><strong>${escapeHtml(r.customer_name)}</strong> <small style="color:#6b8aa0">#${r.customer_id}</small></td>
        <td>${escapeHtml(r.district_name || '—')}</td>
        <td><small>${escapeHtml((r.created_at || '').slice(0, 16))}</small></td>
        <td>${escapeHtml(r.delivery_date || '—')}</td>
        <td><strong>${r.total}</strong></td>
        <td>${statusPill(r.status)}</td>
        <td><button class="link" data-open="${r.id}">عرض</button></td>`;
      body.appendChild(tr);
    }
    const [all, drafts, actives, dones] = await Promise.all([
      window.api.listOrders({ mode: 'id', query: '' }),
      window.api.listOrders({ mode: 'id', query: '', status: 'draft' }),
      window.api.listOrders({ mode: 'id', query: '', status: 'active' }),
      window.api.listOrders({ mode: 'id', query: '', status: 'delivered' })
    ]);
    document.getElementById('o-stat-all').textContent = all.length;
    document.getElementById('o-stat-draft').textContent = drafts.length;
    document.getElementById('o-stat-active').textContent = actives.length;
    document.getElementById('o-stat-done').textContent = dones.length;
  }

  function setCard(c) {
    oCard = c;
    ['all', 'draft', 'active', 'done'].forEach(k => document.getElementById('o-card-' + k)?.classList.toggle('active', k === c));
    document.getElementById('o-filter-status').value = '';
    refresh();
  }

  // ---------- builder ----------
  function newBuilder(editId = null) {
    builder = { editId, customer: null, items: [], discount: 0, notes: '' };
  }

  function builderTotals() {
    const subtotal = builder.items.reduce((a, i) => a + i.qty * i.price, 0);
    return { subtotal, total: subtotal - (Number(builder.discount) || 0) };
  }

  function renderBuilderCustomer() {
    const box = document.getElementById('o-customer-box');
    if (!builder.customer) { box.innerHTML = '<p class="hint">اختر زبوناً من البحث أدناه أو أنشئ زبوناً جديداً.</p>'; return; }
    const c = builder.customer;
    box.innerHTML = `<div class="o-customer-card"><strong>${escapeHtml(c.name)}</strong> <small style="color:#6b8aa0">رقم ${c.id}</small><br><small>${escapeHtml(c.district_name || 'بدون منطقة')}</small></div>`;
  }

  async function searchCustomersUI() {
    const q = document.getElementById('o-customer-search').value.trim();
    const box = document.getElementById('o-customer-results');
    if (!q) { box.innerHTML = ''; return; }
    const byId = /^\d+$/.test(q)
      ? await window.api.listCustomers({ mode: 'id', query: q })
      : await window.api.listCustomers({ mode: 'name', query: q });
    box.innerHTML = byId.length ? '' : '<p class="hint">لا زبون مطابق.</p>';
    for (const c of byId.slice(0, 8)) {
      const div = document.createElement('div');
      div.className = 'o-result-row';
      div.innerHTML = `<span><strong>${escapeHtml(c.name)}</strong> <small>#${c.id} — ${escapeHtml(c.district_name || 'بدون منطقة')}</small></span><button class="link" data-cid="${c.id}">اختيار</button>`;
      box.appendChild(div);
    }
  }

  async function searchProductsUI() {
    const q = document.getElementById('o-product-search').value.trim();
    const box = document.getElementById('o-product-results');
    if (!q) { box.innerHTML = ''; return; }
    const rows = await window.api.searchProductsForOrder(pMode, q);
    box.innerHTML = rows.length ? '' : '<p class="hint">لا منتج مطابق — أنشئ المنتج في المخزون أولاً.</p>';
    for (const p of rows.slice(0, 8)) {
      const div = document.createElement('div');
      div.className = 'o-result-row';
      const priceTxt = p.price > 0 ? `${p.price} DA` : 'بدون سعر!';
      div.innerHTML = `<span><strong>${escapeHtml(p.name)}</strong><br><small>المتوفر: ${p.stock} — السعر: ${priceTxt}</small></span>
        <span><input class="o-qty" type="number" min="1" step="1" value="1" dir="ltr" data-qty="${p.id}" /> <button class="link" data-add="${p.id}">إضافة</button></span>`;
      div._p = p;
      box.appendChild(div);
      div.querySelector('[data-add]').onclick = () => {
        const qty = Math.trunc(Number(div.querySelector('[data-qty]').value));
        addBuilderItem(p, qty);
      };
    }
  }

  function addBuilderItem(p, qty) {
    const err = document.getElementById('o-err');
    if (!Number.isInteger(qty) || qty <= 0) { err.textContent = 'الكمية يجب أن تكون عدداً صحيحاً أكبر من 0'; return; }
    if (!(p.price > 0)) { err.textContent = 'لا يوجد سعر بيع صالح لهذا المنتج — حدّث السعر في المخزون أولاً'; return; }
    err.textContent = '';
    const ex = builder.items.find(i => i.item_id === p.id);
    if (ex) ex.qty += qty;
    else builder.items.push({ item_id: p.id, name: p.name, qty, price: p.price, stock: p.stock });
    renderBuilderItems();
  }

  function renderBuilderItems() {
    const box = document.getElementById('o-items');
    box.innerHTML = builder.items.length ? '' : '<p class="hint">لا منتجات بعد.</p>';
    builder.items.forEach((it, idx) => {
      const div = document.createElement('div');
      div.className = 'o-item-row';
      const warn = it.qty > it.stock ? ' ⚠ المخزون غير كافٍ' : '';
      div.innerHTML = `<span class="grow"><strong>${escapeHtml(it.name)}</strong><br><small>${it.qty} × ${it.price} = ${it.qty * it.price} DA${warn}</small></span>
        <input type="number" min="1" step="1" value="${it.qty}" dir="ltr" data-eqty="${idx}" />
        <button class="c-phone-del" data-rm="${idx}">×</button>`;
      box.appendChild(div);
    });
    const t = builderTotals();
    document.getElementById('o-subtotal').textContent = t.subtotal;
    document.getElementById('o-total').textContent = t.total;
    const w = document.getElementById('o-stock-warn');
    const shorts = builder.items.filter(i => i.qty > i.stock);
    if (shorts.length) {
      w.classList.remove('hidden');
      w.innerHTML = '⚠ تنبيه: الكمية المطلوبة تتجاوز المخزون المتوفر — ' + shorts.map(s => `${escapeHtml(s.name)} (مطلوب ${s.qty}، متوفر ${s.stock})`).join('، ');
    } else { w.classList.add('hidden'); w.innerHTML = ''; }
  }

  function openBuilder() {
    newBuilder(null);
    document.getElementById('o-modal-title').textContent = 'طلبية جديدة';
    document.getElementById('o-customer-search').value = '';
    document.getElementById('o-customer-results').innerHTML = '';
    document.getElementById('o-product-search').value = '';
    document.getElementById('o-product-results').innerHTML = '';
    document.getElementById('o-f-notes').value = '';
    document.getElementById('o-f-discount').value = 0;
    document.getElementById('o-err').textContent = '';
    renderBuilderCustomer();
    renderBuilderItems();
    open('o-modal');
  }

  async function openEditDraft(id) {
    const o = await window.api.getOrder(id);
    if (!o || o.status !== 'draft') return;
    newBuilder(id);
    builder.customer = { id: o.customer_id, name: o.customer_name, district_name: o.district_name };
    builder.items = o.items.map(i => ({ item_id: i.item_id, name: i.item_name, qty: i.qty, price: i.unit_price, stock: i.qty }));
    // refresh current price/stock for display
    for (const it of builder.items) {
      try { const pr = await window.api.getProductPricing(it.item_id); it.stock = pr.stock; } catch {}
    }
    builder.discount = o.discount_amount || 0;
    builder.notes = o.notes || '';
    document.getElementById('o-modal-title').textContent = `تعديل المسودة #${id}`;
    document.getElementById('o-f-notes').value = builder.notes;
    document.getElementById('o-f-discount').value = builder.discount;
    document.getElementById('o-err').textContent = '';
    document.getElementById('o-customer-search').value = '';
    document.getElementById('o-customer-results').innerHTML = '';
    document.getElementById('o-product-search').value = '';
    document.getElementById('o-product-results').innerHTML = '';
    renderBuilderCustomer();
    renderBuilderItems();
    open('o-modal');
  }

  async function saveBuilder() {
    const err = document.getElementById('o-err');
    if (!builder.customer) { err.textContent = 'اختر الزبون أولاً'; return; }
    if (!builder.items.length) { err.textContent = 'الطلبية يجب أن تحتوي على منتج واحد على الأقل'; return; }
    const payload = {
      customer_id: builder.customer.id,
      notes: document.getElementById('o-f-notes').value,
      discount_amount: Number(document.getElementById('o-f-discount').value) || 0,
      items: builder.items.map(i => ({ item_id: i.item_id, qty: i.qty }))
    };
    if (payload.discount_amount < 0) { err.textContent = 'التخفيض يجب أن يكون 0 أو أكثر'; return; }
    try {
      if (builder.editId) await window.api.updateDraftOrder({ id: builder.editId, ...payload });
      else await window.api.createOrder(payload);
      err.textContent = '';
      close('o-modal');
      refresh();
    } catch (e) { err.textContent = e.message; }
  }

  // ---------- detail / receipt ----------
  async function openDetail(id) {
    const o = await window.api.getOrder(id);
    if (!o) return;
    const det = document.getElementById('o-detail');
    const lines = o.items.map(i => `<tr><td>${escapeHtml(i.item_name)}</td><td>${i.qty} × ${i.unit_price}</td><td><strong>${i.qty * i.unit_price}</strong></td></tr>`).join('');
    const warnHtml = o.warnings.length
      ? `<div class="warnbox">⚠ المخزون غير كافٍ: ${o.warnings.map(w => `منتج #${w.item_id} (مطلوب ${w.qty}، متوفر ${w.stock})`).join('، ')}</div>` : '';
    det.innerHTML = `
      <div class="receipt">
        <h2>طلبية #${o.id}</h2>
        <div class="ref" dir="ltr">C${o.customer_id}-${o.id}${o.customer_deleted ? ' — الزبون محذوف' : ''}</div>
        <div>الزبون: <strong>${escapeHtml(o.customer_name)}</strong> (رقم ${o.customer_id}) <button class="link" data-gocust="${o.customer_id}">عرض الزبون</button></div>
        <div>المنطقة: ${escapeHtml(o.district_name || '—')}</div>
        <div>أُنشئت: ${escapeHtml((o.created_at || '').slice(0, 16))} — التوصيل الفعلي: ${escapeHtml(o.delivery_date || '—')}</div>
        <div style="margin:6px 0">الحالة: ${statusPill(o.status)}</div>
        <table>${lines}</table>
        <div>المجموع: ${o.subtotal} DA</div>
        ${Number(o.discount_amount) ? `<div>التخفيض: ${o.discount_amount} DA</div>` : ''}
        <div class="r-total">الإجمالي: ${o.total} DA</div>
        ${o.notes ? `<div>الملاحظات: ${escapeHtml(o.notes)}</div>` : ''}
        ${warnHtml}
      </div>`;
    const acts = document.getElementById('o-detail-actions');
    acts.innerHTML = '';
    document.getElementById('o-detail-err').textContent = '';
    const addBtn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn;
      acts.appendChild(b);
    };
    if (o.status === 'draft') addBtn('تعديل المسودة', 'cyan', () => { close('o-modal-detail'); openEditDraft(o.id); });
    if (NEXT_STATUS[o.status]) addBtn(NEXT_LABEL[NEXT_STATUS[o.status]], 'primary', async () => {
      try {
        let r;
        if (o.status === 'draft') { r = await window.api.confirmOrder(o.id); }
        else r = await window.api.setOrderStatus(o.id, NEXT_STATUS[o.status]);
        if (r && r.warnings && r.warnings.length) {
          document.getElementById('o-detail-err').textContent = '⚠ تم التأكيد مع تنبيه مخزون غير كافٍ.';
        }
        close('o-modal-detail'); refresh();
      } catch (e) { document.getElementById('o-detail-err').textContent = e.message; }
    });
    if (!['delivered', 'cancelled'].includes(o.status)) {
      addBtn('إلغاء الطلبية', 'ghost', async () => {
        if (!window.confirm('إلغاء الطلبية؟ تبقى في السجل.')) return;
        try { await window.api.setOrderStatus(o.id, 'cancelled'); close('o-modal-detail'); refresh(); }
        catch (e) { document.getElementById('o-detail-err').textContent = e.message; }
      });
    }
    addBtn('حذف نهائي', 'danger', async () => {
      if (!window.confirm(`حذف الطلبية #${o.id} نهائياً؟ سيبقى الرقم مستهلكاً.`)) return;
      try { await window.api.deleteOrder(o.id); close('o-modal-detail'); refresh(); }
      catch (e) { document.getElementById('o-detail-err').textContent = e.message; }
    });
    det.querySelector('[data-gocust]').onclick = (e) => {
      const cid = Number(e.target.dataset.gocust);
      close('o-modal-detail');
      window.CustomersModule.openDetail(cid);
    };
    open('o-modal-detail');
  }

  async function mount(root) {
    if (!root.querySelector('.ord')) {
      const res = await fetch('modules/orders/orders.html');
      root.innerHTML = await res.text();
    }
    await loadDistricts();

    document.getElementById('o-btn-add').onclick = openBuilder;
    document.getElementById('o-btn-refresh').onclick = refresh;
    document.getElementById('o-search').oninput = () => refresh();
    document.getElementById('o-search').placeholder = SEARCH_PH[oMode];
    document.querySelectorAll('#o-modes .seg-btn').forEach(b => b.onclick = () => {
      oMode = b.dataset.mode;
      document.querySelectorAll('#o-modes .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      document.getElementById('o-search').placeholder = SEARCH_PH[oMode];
      document.getElementById('o-search').value = '';
      refresh();
    });
    document.getElementById('o-filter-status').onchange = refresh;
    document.getElementById('o-filter-district').onchange = refresh;
    document.getElementById('o-filter-date').onchange = refresh;
    document.getElementById('o-btn-sort').onclick = (e) => {
      oSort = oSort === 'newest' ? 'oldest' : 'newest';
      e.target.textContent = oSort === 'newest' ? 'الأحدث ↓' : 'الأقدم ↓';
      refresh();
    };
    ['all', 'draft', 'active', 'done'].forEach(k => document.getElementById('o-card-' + k).onclick = () => setCard(k));
    root.querySelectorAll('.close-modal').forEach(b => b.onclick = () => close(b.dataset.close));

    // customer search + select + new
    document.getElementById('o-customer-search').oninput = searchCustomersUI;
    document.getElementById('o-customer-results').onclick = async (e) => {
      const b = e.target.closest('[data-cid]');
      if (!b) return;
      const c = await window.api.getCustomer(Number(b.dataset.cid));
      if (!c || c.deleted_at) return;
      builder.customer = { id: c.id, name: c.name, district_name: c.district_name };
      document.getElementById('o-customer-results').innerHTML = '';
      document.getElementById('o-customer-search').value = '';
      renderBuilderCustomer();
    };
    document.getElementById('o-btn-customer-new').onclick = () => {
      window.CustomersModule.openCreate((newId) => {
        window.api.getCustomer(newId).then(c => {
          builder.customer = { id: c.id, name: c.name, district_name: c.district_name };
          renderBuilderCustomer();
        });
      });
    };

    // product search
    document.querySelectorAll('#o-pmodes .seg-btn').forEach(b => b.onclick = () => {
      pMode = b.dataset.mode;
      document.querySelectorAll('#o-pmodes .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      document.getElementById('o-product-search').placeholder = pMode === 'barcode' ? 'ابحث بالباركود…' : 'ابحث باسم المنتج…';
      searchProductsUI();
    });
    document.getElementById('o-product-search').oninput = searchProductsUI;

    // items edit/remove + discount live totals
    document.getElementById('o-items').onclick = (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { builder.items.splice(Number(rm.dataset.rm), 1); renderBuilderItems(); }
    };
    document.getElementById('o-items').onchange = (e) => {
      const q = e.target.closest('[data-eqty]');
      if (!q) return;
      const v = Math.trunc(Number(q.value));
      if (!Number.isInteger(v) || v <= 0) { renderBuilderItems(); return; }
      builder.items[Number(q.dataset.eqty)].qty = v;
      renderBuilderItems();
    };
    document.getElementById('o-f-discount').oninput = (e) => {
      builder.discount = Number(e.target.value) || 0;
      const t = builderTotals();
      document.getElementById('o-subtotal').textContent = t.subtotal;
      document.getElementById('o-total').textContent = t.total;
    };

    document.getElementById('o-btn-save').onclick = saveBuilder;
    document.getElementById('o-body').onclick = (e) => {
      const b = e.target.closest('[data-open]');
      if (b) openDetail(Number(b.dataset.open));
    };

    refresh();
  }

  window.OrdersModule = { mount, openDetail };
})();
