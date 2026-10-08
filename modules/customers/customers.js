/* Customers module — self-contained UI, talks only to window.api -> db */
(function () {
  let searchMode = 'name';      // 'id' | 'name' | 'phone'
  let listView = 'active';      // 'active' | 'deleted'
  let editingId = null;         // null = create mode
  let createPhones = [];        // local phone rows in create mode
  let afterCreate = null;       // callback for cross-module reuse (Orders later)

  const PLACEHOLDERS = {
    id: 'ابحث برقم الزبون…',
    name: 'ابحث باسم الزبون…',
    phone: 'ابحث برقم الهاتف…'
  };

  async function ensureTemplate(root) {
    if (root.querySelector('.cus')) return;
    const res = await fetch('modules/customers/customers.html');
    root.innerHTML = await res.text();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function open(id) { document.getElementById(id).classList.remove('hidden'); }
  function close(id) { document.getElementById(id).classList.add('hidden'); }

  async function loadDistricts() {
    const ds = await window.api.listDistricts();
    const keepF = document.getElementById('c-filter-district')?.value;
    const keepM = document.getElementById('c-f-district')?.value;
    const f = document.getElementById('c-filter-district');
    const m = document.getElementById('c-f-district');
    if (f) f.innerHTML = '<option value="">كل المناطق</option>' + ds.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    if (m) m.innerHTML = '<option value="">— بدون —</option>' + ds.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    if (f && keepF) f.value = keepF;
    if (m && keepM) m.value = keepM;
    return ds;
  }

  // DB-driven types — never hardcoded. You add names + % yourself.
  async function loadTypes() {
    const ts = await window.api.listCustomerTypes();
    const m = document.getElementById('c-f-type');
    if (m) {
      const keep = m.value;
      m.innerHTML = '<option value="">— بدون نوع (سعر التكلفة) —</option>' + ts.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (+${t.markup_percentage}%)</option>`).join('');
      if (keep) m.value = keep;
    }
    return ts;
  }

  function typeLabel(r) {
    if (!r.customer_type_name) return '<span style="color:#6b8aa0">— بدون نوع —</span>';
    return `<span class="pill" style="background:#e8f5e9;border:1px solid #2e7d32;color:#2e7d32">${escapeHtml(r.customer_type_name)} +${r.customer_markup}%</span>`;
  }

  function setSearchMode(mode) {
    searchMode = mode;
    document.querySelectorAll('#c-modes .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    document.getElementById('c-search').placeholder = PLACEHOLDERS[mode];
    document.getElementById('c-search').value = '';
    refresh();
  }

  function setListView(v) {
    listView = v;
    document.getElementById('c-card-active')?.classList.toggle('active', v === 'active');
    document.getElementById('c-card-deleted')?.classList.toggle('active', v === 'deleted');
    document.getElementById('c-card-districts')?.classList.remove('active');
    document.getElementById('c-view-title').textContent = v === 'deleted' ? 'الزبائن المحذوفون — قابلة للاستعادة' : 'قائمة الزبائن';
    refresh();
  }

  async function refresh() {
    const query = document.getElementById('c-search')?.value || '';
    const d = document.getElementById('c-filter-district')?.value;
    const districtId = d ? Number(d) : null;
    const rows = await window.api.listCustomers({ mode: searchMode, query, districtId, deleted: listView });
    const body = document.getElementById('c-body');
    const cols = 5;
    body.innerHTML = rows.length ? '' : `<tr><td colspan="${cols}" style="text-align:center;color:#6b8aa0">${listView === 'deleted' ? 'لا زبائن محذوفين' : 'لا زبائن — أضف زبون جديد'}</td></tr>`;
    for (const r of rows) {
      const tr = document.createElement('tr');
      const action = listView === 'deleted'
        ? `<button class="link" data-restore="${r.id}">استعادة</button> <button class="link" data-open="${r.id}">عرض</button>`
        : `<button class="link" data-open="${r.id}">عرض / تعديل</button>`;
      tr.innerHTML = `
        <td><strong>${r.id}</strong></td>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td>${escapeHtml(r.district_name || '—')}</td>
        <td>${typeLabel(r)}</td>
        <td>${action}</td>`;
      body.appendChild(tr);
    }
    // stats (totals, unfiltered)
    const [actives, districts, deleteds] = await Promise.all([
      window.api.listCustomers({ mode: 'name', query: '', districtId: null, deleted: 'active' }),
      window.api.listDistricts(),
      window.api.listCustomers({ mode: 'name', query: '', districtId: null, deleted: 'deleted' })
    ]);
    document.getElementById('c-stat-active').textContent = actives.length;
    document.getElementById('c-stat-districts').textContent = districts.length;
    document.getElementById('c-stat-deleted').textContent = deleteds.length;
  }

  // ---- phone rows ----
  function renderCreatePhones() {
    const box = document.getElementById('c-phones');
    box.innerHTML = createPhones.length ? '' : '<p class="hint">لا أرقام بعد — اختياري.</p>';
    createPhones.forEach((ph, i) => {
      const div = document.createElement('div');
      div.className = 'c-phone-row';
      div.innerHTML = `<span dir="ltr">${escapeHtml(ph)}</span><button class="c-phone-del" data-i="${i}">×</button>`;
      box.appendChild(div);
    });
  }

  async function renderEditPhones(cust) {
    const box = document.getElementById('c-phones');
    box.innerHTML = cust.phones.length ? '' : '<p class="hint">لا أرقام بعد — اختياري.</p>';
    for (const p of cust.phones) {
      const div = document.createElement('div');
      div.className = 'c-phone-row';
      div.innerHTML = `<span dir="ltr">${escapeHtml(p.phone_number)}</span><button class="c-phone-del" data-ph="${p.id}">×</button>`;
      box.appendChild(div);
    }
  }

  function showDupWarn(ownersByPhone) {
    const w = document.getElementById('c-phone-warn');
    const parts = ownersByPhone.filter(x => x.owners && x.owners.length)
      .map(x => `«${escapeHtml(x.phone)}» مسجل أيضاً لدى: ${x.owners.map(o => `${escapeHtml(o.name)} (رقم ${o.id})`).join('، ')}`);
    if (!parts.length) { w.classList.add('hidden'); w.innerHTML = ''; return; }
    w.classList.remove('hidden');
    w.innerHTML = '⚠ تنبيه (غير مانع): هذا الرقم مسجل لدى زبون آخر.<br>' + parts.join('<br>');
  }

  // ---- reusable create popup (Orders will call this later) ----
  // Modals live in document.body (moved there once) so the popup works
  // from any module without mounting the whole Customers screen.
  let modalsBound = false;

  async function ensureModals() {
    if (!document.getElementById('c-modal')) {
      const res = await fetch('modules/customers/customers.html');
      const tmp = document.createElement('div');
      tmp.innerHTML = await res.text();
      for (const id of ['c-modal', 'c-modal-district', 'c-modal-type']) {
        const n = tmp.querySelector('#' + id);
        if (n) document.body.appendChild(n);
      }
    }
    if (!modalsBound) { bindModalHandlers(); modalsBound = true; }
  }

  function maybeRefreshList() {
    if (document.querySelector('.cus')) refresh();
  }

  async function openCreate(onCreated) {
    await ensureModals();
    await Promise.all([loadDistricts(), loadTypes()]);
    editingId = null;
    createPhones = [];
    afterCreate = typeof onCreated === 'function' ? onCreated : null;
    document.getElementById('c-modal-title').textContent = 'زبون جديد';
    document.getElementById('c-idline').classList.add('hidden');
    document.getElementById('c-meta').classList.add('hidden');
    document.getElementById('c-f-name').value = '';
    document.getElementById('c-f-district').value = '';
    document.getElementById('c-f-type').value = '';
    document.getElementById('c-f-newphone').value = '';
    document.getElementById('c-f-lat').value = '';
    document.getElementById('c-f-lng').value = '';
    document.getElementById('c-f-notes').value = '';
    document.getElementById('c-err').textContent = '';
    document.getElementById('c-phone-warn').classList.add('hidden');
    document.getElementById('c-btn-save').classList.remove('hidden');
    document.getElementById('c-btn-delete').classList.add('hidden');
    document.getElementById('c-btn-restore').classList.add('hidden');
    renderCreatePhones();
    open('c-modal');
  }

  async function openDetail(id) {
    await ensureModals();
    await Promise.all([loadDistricts(), loadTypes()]);
    const cust = await window.api.getCustomer(id);
    if (!cust) return;
    editingId = id;
    afterCreate = null;
    const deleted = !!cust.deleted_at;
    document.getElementById('c-modal-title').textContent = deleted ? 'زبون محذوف — عرض' : 'بطاقة الزبون';
    document.getElementById('c-idline').classList.remove('hidden');
    document.getElementById('c-field-id').textContent = cust.id;
    document.getElementById('c-f-name').value = cust.name || '';
    document.getElementById('c-f-district').value = cust.district_id || '';
    document.getElementById('c-f-type').value = cust.customer_type_id || '';
    document.getElementById('c-f-newphone').value = '';
    document.getElementById('c-f-lat').value = cust.latitude ?? '';
    document.getElementById('c-f-lng').value = cust.longitude ?? '';
    document.getElementById('c-f-notes').value = cust.notes || '';
    document.getElementById('c-err').textContent = '';
    document.getElementById('c-phone-warn').classList.add('hidden');
    const meta = document.getElementById('c-meta');
    meta.classList.remove('hidden');
    meta.textContent = `أُنشئ: ${cust.created_at || '—'} — آخر تعديل: ${cust.updated_at || '—'}`;
    document.getElementById('c-btn-save').classList.toggle('hidden', deleted);
    document.getElementById('c-btn-delete').classList.toggle('hidden', deleted);
    document.getElementById('c-btn-restore').classList.toggle('hidden', !deleted);
    await renderEditPhones(cust);
    await renderOrderHistory(cust.id);
    open('c-modal');
  }

  async function renderOrderHistory(customerId) {
    const box = document.getElementById('c-history');
    if (typeof window.api.listCustomerOrders !== 'function') return;
    let orders = [];
    try { orders = await window.api.listCustomerOrders(customerId); } catch { return; }
    if (!orders.length) { box.innerHTML = 'لا طلبيات لهذا الزبون بعد. سجل الدفعات سيظهر هنا لاحقاً.'; return; }
    box.innerHTML = '<strong>طلبيات الزبون:</strong>' + orders.slice(0, 10).map(o =>
      `<div class="c-district-row"><span>#${o.id} <small dir="ltr">C${customerId}-${o.id}</small> — ${o.total} DA — ${o.created_at ? escapeHtml(o.created_at.slice(0, 10)) : ''}</span><button class="link" data-oh="${o.id}">عرض</button></div>`
    ).join('') + (orders.length > 10 ? `<small>… و ${orders.length - 10} أخرى</small>` : '') + '<br><small>سجل الدفعات سيظهر هنا لاحقاً.</small>';
  }

  let editingDistrictId = null;

  async function refreshDistrictList() {
    const ds = await window.api.listDistricts();
    const box = document.getElementById('c-district-list');
    box.innerHTML = ds.length ? '' : '<p class="hint">لا مناطق بعد.</p>';
    for (const d of ds) {
      const div = document.createElement('div');
      div.className = 'c-district-row';
      div.innerHTML = `<span>${escapeHtml(d.name)}</span><span><button class="link" data-d-edit="${d.id}">تعديل</button> <button class="link" data-d-del="${d.id}">حذف</button></span>`;
      box.appendChild(div);
    }
  }

  function resetDistrictForm() {
    editingDistrictId = null;
    document.getElementById('c-district-title').textContent = 'المناطق';
    document.getElementById('c-f-district-name').value = '';
    document.getElementById('c-btn-save-district').textContent = 'إضافة';
    document.getElementById('c-btn-del-district').classList.add('hidden');
  }

  async function refreshTypeList() {
    const ts = await window.api.listCustomerTypes();
    const box = document.getElementById('c-type-list');
    box.innerHTML = ts.length ? '' : '<p class="hint">لا أنواع بعد — أضف النوع الأول (الاسم + النسبة).</p>';
    for (const t of ts) {
      const div = document.createElement('div');
      div.className = 'c-district-row';
      div.innerHTML = `<span><strong>${escapeHtml(t.name)}</strong> <small>+${t.markup_percentage}%</small></span>
        <span><button class="link" data-tedit="${t.id}">تعديل</button> <button class="link" data-tdel="${t.id}">حذف</button></span>`;
      box.appendChild(div);
    }
  }

  function bindModalHandlers() {
    document.querySelectorAll('#c-modal .close-modal, #c-modal-district .close-modal, #c-modal-type .close-modal')
      .forEach(b => b.onclick = () => close(b.dataset.close));

    // add phone (create: local row + live dup check; edit: immediate save)
    document.getElementById('c-btn-addphone').onclick = async () => {
      const inp = document.getElementById('c-f-newphone');
      const ph = inp.value.trim();
      if (!ph) return;
      if (editingId === null) {
        if (!createPhones.includes(ph)) createPhones.push(ph);
        inp.value = '';
        renderCreatePhones();
        const owners = await window.api.checkPhoneOwners(ph, null);
        showDupWarn([{ phone: ph, owners }]);
      } else {
        try {
          const r = await window.api.addCustomerPhone({ customer_id: editingId, phone_number: ph });
          inp.value = '';
          document.getElementById('c-err').textContent = '';
          showDupWarn([{ phone: ph, owners: r.owners || [] }]);
          const cust = await window.api.getCustomer(editingId);
          await renderEditPhones(cust);
          maybeRefreshList();
        } catch (e) { document.getElementById('c-err').textContent = e.message; }
      }
    };

    // remove phone (create: drop local row; edit: delete relation)
    document.getElementById('c-phones').onclick = async (e) => {
      const btn = e.target.closest('[data-i],[data-ph]');
      if (!btn) return;
      if (editingId === null && btn.dataset.i !== undefined) {
        createPhones.splice(Number(btn.dataset.i), 1);
        renderCreatePhones();
      } else if (editingId !== null && btn.dataset.ph) {
        try {
          await window.api.deleteCustomerPhone(Number(btn.dataset.ph));
          const cust = await window.api.getCustomer(editingId);
          await renderEditPhones(cust);
        } catch (err) { document.getElementById('c-err').textContent = err.message; }
      }
    };

    // save (create) / update (edit)
    document.getElementById('c-btn-save').onclick = async () => {
      const typeVal = document.getElementById('c-f-type').value;
      const payload = {
        name: document.getElementById('c-f-name').value,
        district_id: Number(document.getElementById('c-f-district').value) || null,
        customer_type_id: typeVal ? Number(typeVal) : null,
        latitude: document.getElementById('c-f-lat').value,
        longitude: document.getElementById('c-f-lng').value,
        notes: document.getElementById('c-f-notes').value
      };
      try {
        if (editingId === null) {
          const r = await window.api.addCustomer({ ...payload, phones: createPhones });
          close('c-modal');
          await loadDistricts(); maybeRefreshList();
          if (afterCreate) { const cb = afterCreate; afterCreate = null; cb(r.id); }
          else if (r.duplicatePhones && r.duplicatePhones.length) {
            // non-blocking: show the new card with the warning visible
            await openDetail(r.id);
            showDupWarn(r.duplicatePhones);
          }
        } else {
          await window.api.updateCustomer({ id: editingId, ...payload });
          close('c-modal');
          maybeRefreshList();
        }
        document.getElementById('c-err').textContent = '';
      } catch (e) { document.getElementById('c-err').textContent = e.message; }
    };

    document.getElementById('c-btn-delete').onclick = async () => {
      if (!editingId) return;
      if (!window.confirm('حذف الزبون؟ يمكن استعادته لاحقاً.')) return;
      try {
        await window.api.deleteCustomer(editingId);
        close('c-modal');
        maybeRefreshList();
      } catch (e) { document.getElementById('c-err').textContent = e.message; }
    };

    document.getElementById('c-btn-restore').onclick = async () => {
      if (!editingId) return;
      try {
        await window.api.restoreCustomer(editingId);
        close('c-modal');
        maybeRefreshList();
      } catch (e) { document.getElementById('c-err').textContent = e.message; }
    };

    document.getElementById('c-btn-save-district').onclick = async () => {
      try {
        if (editingDistrictId) await window.api.updateDistrict({ id: editingDistrictId, name: document.getElementById('c-f-district-name').value });
        else await window.api.addDistrict({ name: document.getElementById('c-f-district-name').value });
        document.getElementById('c-err-district').textContent = '';
        resetDistrictForm();
        await refreshDistrictList();
        await loadDistricts();
        maybeRefreshList();
      } catch (e) { document.getElementById('c-err-district').textContent = e.message; }
    };

    document.getElementById('c-btn-del-district').onclick = async () => {
      if (!editingDistrictId) return;
      if (!window.confirm('حذف هذه المنطقة؟ ستصبح زبائنها بدون منطقة.')) return;
      try {
        await window.api.deleteDistrict(editingDistrictId);
        document.getElementById('c-err-district').textContent = '';
        resetDistrictForm();
        await refreshDistrictList();
        await loadDistricts();
        maybeRefreshList();
      } catch (e) { document.getElementById('c-err-district').textContent = e.message; }
    };

    document.getElementById('c-district-list').onclick = async (e) => {
      const ed = e.target.closest('[data-d-edit]');
      const del = e.target.closest('[data-d-del]');
      if (ed) {
        const ds = await window.api.listDistricts();
        const d = ds.find(x => x.id === Number(ed.dataset.dEdit));
        if (!d) return;
        editingDistrictId = d.id;
        document.getElementById('c-district-title').textContent = `تعديل المنطقة #${d.id}`;
        document.getElementById('c-f-district-name').value = d.name;
        document.getElementById('c-btn-save-district').textContent = 'حفظ';
        document.getElementById('c-btn-del-district').classList.remove('hidden');
      } else if (del) {
        if (!window.confirm('حذف هذه المنطقة؟ ستصبح زبائنها بدون منطقة.')) return;
        try {
          await window.api.deleteDistrict(Number(del.dataset.dDel));
          if (editingDistrictId === Number(del.dataset.dDel)) resetDistrictForm();
          await refreshDistrictList();
          await loadDistricts();
          maybeRefreshList();
        } catch (err) { document.getElementById('c-err-district').textContent = err.message; }
      }
    };

    document.getElementById('c-btn-save-type').onclick = async () => {
      try {
        await window.api.addCustomerType({
          name: document.getElementById('c-f-type-name').value,
          markup_percentage: document.getElementById('c-f-type-pct').value
        });
        document.getElementById('c-f-type-name').value = '';
        document.getElementById('c-err-type').textContent = '';
        await refreshTypeList();
        await loadTypes();
        maybeRefreshList();
      } catch (e) { document.getElementById('c-err-type').textContent = e.message; }
    };

    document.getElementById('c-type-list').onclick = async (e) => {
      const ed = e.target.closest('[data-tedit]');
      const del = e.target.closest('[data-tdel]');
      if (ed) {
        const cur = (await window.api.listCustomerTypes()).find(t => t.id === Number(ed.dataset.tedit));
        if (!cur) return;
        const nn = window.prompt('اسم النوع:', cur.name);
        if (nn === null) return;
        const np = window.prompt('النسبة %:', String(cur.markup_percentage));
        if (np === null) return;
        try {
          await window.api.updateCustomerType({ id: cur.id, name: nn, markup_percentage: np });
          document.getElementById('c-err-type').textContent = '';
          await refreshTypeList(); await loadTypes(); maybeRefreshList();
        } catch (err) { document.getElementById('c-err-type').textContent = err.message; }
      } else if (del) {
        if (!window.confirm('حذف هذا النوع؟')) return;
        try {
          await window.api.deleteCustomerType(Number(del.dataset.tdel));
          document.getElementById('c-err-type').textContent = '';
          await refreshTypeList(); await loadTypes(); maybeRefreshList();
        } catch (err) { document.getElementById('c-err-type').textContent = err.message; }
      }
    };

    document.getElementById('c-history').onclick = (e) => {
      const b = e.target.closest('[data-oh]');
      if (!b || !window.OrdersModule) return;
      const oid = Number(b.dataset.oh);
      close('c-modal');
      document.querySelector('.nav-btn[data-module="orders"]')?.click();
      setTimeout(() => window.OrdersModule.openDetail(oid), 250);
    };
  }

  async function mount(root) {
    // content template only — modals live in document.body via ensureModals()
    if (!root.querySelector('.cus')) {
      const res = await fetch('modules/customers/customers.html');
      const tmp = document.createElement('div');
      tmp.innerHTML = await res.text();
      tmp.querySelectorAll('#c-modal, #c-modal-district, #c-modal-type').forEach(n => n.remove());
      root.innerHTML = tmp.innerHTML;
    }
    await ensureModals();
    await Promise.all([loadDistricts(), loadTypes()]);

    document.getElementById('c-btn-add').onclick = () => openCreate();
    document.getElementById('c-btn-district').onclick = async () => {
      document.getElementById('c-err-district').textContent = '';
      resetDistrictForm();
      await refreshDistrictList();
      open('c-modal-district');
    };
    document.getElementById('c-btn-type').onclick = async () => {
      document.getElementById('c-err-type').textContent = '';
      await refreshTypeList();
      open('c-modal-type');
    };
    document.getElementById('c-btn-refresh').onclick = refresh;
    document.getElementById('c-search').oninput = () => refresh();
    document.getElementById('c-filter-district').onchange = () => refresh();
    document.querySelectorAll('#c-modes .seg-btn').forEach(b => b.onclick = () => setSearchMode(b.dataset.mode));
    document.getElementById('c-card-active').onclick = () => setListView('active');
    document.getElementById('c-card-deleted').onclick = () => setListView('deleted');
    document.getElementById('c-card-districts').onclick = () => document.getElementById('c-btn-district').click();

    document.getElementById('c-body').onclick = async (e) => {
      const o = e.target.closest('[data-open]');
      const r = e.target.closest('[data-restore]');
      if (o) { openDetail(Number(o.dataset.open)); }
      else if (r) {
        try { await window.api.restoreCustomer(Number(r.dataset.restore)); refresh(); }
        catch (err) { window.alert(err.message); }
      }
    };

    document.getElementById('c-search').placeholder = PLACEHOLDERS[searchMode];
    await refresh();
  }

  window.CustomersModule = { mount, openCreate, openDetail };
})();
