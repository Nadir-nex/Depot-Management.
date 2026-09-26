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
    const cols = 4;
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
  function openCreate(onCreated) {
    editingId = null;
    createPhones = [];
    afterCreate = typeof onCreated === 'function' ? onCreated : null;
    document.getElementById('c-modal-title').textContent = 'زبون جديد';
    document.getElementById('c-idline').classList.add('hidden');
    document.getElementById('c-meta').classList.add('hidden');
    document.getElementById('c-f-name').value = '';
    document.getElementById('c-f-district').value = '';
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
    open('c-modal');
  }

  async function refreshDistrictList() {
    const ds = await window.api.listDistricts();
    const box = document.getElementById('c-district-list');
    box.innerHTML = ds.length ? '' : '<p class="hint">لا مناطق بعد.</p>';
    for (const d of ds) {
      const div = document.createElement('div');
      div.className = 'c-district-row';
      div.innerHTML = `<span>${escapeHtml(d.name)}</span>`;
      box.appendChild(div);
    }
  }

  async function mount(root) {
    // fetch template if not already mounted
    if (!root.querySelector('.cus')) {
      const res = await fetch('modules/customers/customers.html');
      root.innerHTML = await res.text();
    }
    await loadDistricts();

    document.getElementById('c-btn-add').onclick = () => openCreate();
    document.getElementById('c-btn-district').onclick = async () => {
      document.getElementById('c-err-district').textContent = '';
      document.getElementById('c-f-district-name').value = '';
      await refreshDistrictList();
      open('c-modal-district');
    };
    document.getElementById('c-btn-refresh').onclick = refresh;
    document.getElementById('c-search').oninput = () => refresh();
    document.getElementById('c-filter-district').onchange = () => refresh();
    document.querySelectorAll('#c-modes .seg-btn').forEach(b => b.onclick = () => setSearchMode(b.dataset.mode));
    document.getElementById('c-card-active').onclick = () => setListView('active');
    document.getElementById('c-card-deleted').onclick = () => setListView('deleted');
    document.getElementById('c-card-districts').onclick = () => document.getElementById('c-btn-district').click();
    root.querySelectorAll('.close-modal').forEach(b => b.onclick = () => close(b.dataset.close));

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
          refresh();
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
      const payload = {
        name: document.getElementById('c-f-name').value,
        district_id: Number(document.getElementById('c-f-district').value) || null,
        latitude: document.getElementById('c-f-lat').value,
        longitude: document.getElementById('c-f-lng').value,
        notes: document.getElementById('c-f-notes').value
      };
      try {
        if (editingId === null) {
          const r = await window.api.addCustomer({ ...payload, phones: createPhones });
          close('c-modal');
          await loadDistricts(); await refresh();
          if (afterCreate) { const cb = afterCreate; afterCreate = null; cb(r.id); }
          else if (r.duplicatePhones && r.duplicatePhones.length) {
            // non-blocking: show the new card with the warning visible
            await openDetail(r.id);
            showDupWarn(r.duplicatePhones);
          }
        } else {
          await window.api.updateCustomer({ id: editingId, ...payload });
          close('c-modal');
          await refresh();
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
        await refresh();
      } catch (e) { document.getElementById('c-err').textContent = e.message; }
    };

    document.getElementById('c-btn-restore').onclick = async () => {
      if (!editingId) return;
      try {
        await window.api.restoreCustomer(editingId);
        close('c-modal');
        await refresh();
      } catch (e) { document.getElementById('c-err').textContent = e.message; }
    };

    document.getElementById('c-btn-save-district').onclick = async () => {
      try {
        await window.api.addDistrict({ name: document.getElementById('c-f-district-name').value });
        document.getElementById('c-f-district-name').value = '';
        document.getElementById('c-err-district').textContent = '';
        await refreshDistrictList();
        await loadDistricts();
        refresh();
      } catch (e) { document.getElementById('c-err-district').textContent = e.message; }
    };

    document.getElementById('c-body').onclick = async (e) => {
      const o = e.target.closest('[data-open]');
      const r = e.target.closest('[data-restore]');
      if (o) { await loadDistricts(); openDetail(Number(o.dataset.open)); }
      else if (r) {
        try { await window.api.restoreCustomer(Number(r.dataset.restore)); refresh(); }
        catch (err) { window.alert(err.message); }
      }
    };

    document.getElementById('c-search').placeholder = PLACEHOLDERS[searchMode];
    await refresh();
  }

  window.CustomersModule = { mount, openCreate };
})();
