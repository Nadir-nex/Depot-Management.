/* Staff module — employees + vehicles tabs, talks only to window.api -> db */
(function () {
  const ROLE_AR = { collector: 'جمع الطلبات', driver: 'سائق' };
  const ROLE_COLOR = { collector: '#0288d1', driver: '#6a1b9a' };
  const SEARCH_PH = {
    emp: { id: 'ابحث برقم الموظف…', name: 'ابحث باسم الموظف…', phone: 'ابحث برقم الهاتف…' },
    veh: { id: 'ابحث برقم المركبة…', name: 'ابحث باسم المركبة…', plate: 'ابحث برقم اللوحة…' }
  };

  let empMode = 'name', empDeleted = false;
  let vehMode = 'name', vehDeleted = false;
  let editingEmp = null;   // null = create
  let editingVeh = null;
  let createEmpPhones = [];

  async function ensureTemplate(root) {
    if (root.querySelector('.stf')) return;
    const res = await fetch('modules/staff/staff.html');
    root.innerHTML = await res.text();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function open(id) { document.getElementById(id).classList.remove('hidden'); }
  function close(id) { document.getElementById(id).classList.add('hidden'); }

  function rolePills(roles) {
    if (!roles || !roles.length) return '<span style="color:#6b8aa0">—</span>';
    return roles.map(r => {
      const c = ROLE_COLOR[r] || '#455a64';
      return `<span class="pill" style="background:${c}22;border:1px solid ${c};color:${c}">${ROLE_AR[r] || escapeHtml(r)}</span>`;
    }).join(' ');
  }

  function setTab(which) {
    document.getElementById('s-tab-emp')?.classList.toggle('active', which === 'emp');
    document.getElementById('s-tab-veh')?.classList.toggle('active', which === 'veh');
    document.getElementById('s-pane-emp')?.classList.toggle('hidden', which !== 'emp');
    document.getElementById('s-pane-veh')?.classList.toggle('hidden', which !== 'veh');
  }

  // ---------- employees ----------
  async function refreshEmps() {
    const query = document.getElementById('s-emp-search')?.value || '';
    const rows = await window.api.listEmployees({ mode: empMode, query, deleted: empDeleted ? 'deleted' : 'active' });
    const body = document.getElementById('s-emp-body');
    body.innerHTML = rows.length ? '' : '<tr><td colspan="5" style="text-align:center;color:#6b8aa0">لا موظفين — أضف موظف جديد</td></tr>';
    for (const r of rows) {
      const tr = document.createElement('tr');
      const phones = r.phones.length ? r.phones.map(p => `<span dir="ltr">${escapeHtml(p.phone_number)}</span>`).join('، ') : '—';
      const action = empDeleted
        ? `<button class="link" data-emprestore="${r.id}">استعادة</button>`
        : `<button class="link" data-empopen="${r.id}">عرض / تعديل</button>`;
      tr.innerHTML = `<td><strong>${r.id}</strong></td><td><strong>${escapeHtml(r.name)}</strong></td><td>${rolePills(r.roles)}</td><td>${phones}</td><td>${action}</td>`;
      body.appendChild(tr);
    }
  }

  function renderCreateEmpPhones() {
    const box = document.getElementById('s-e-phones');
    box.innerHTML = createEmpPhones.length ? '' : '<p class="hint">لا أرقام بعد — اختياري.</p>';
    createEmpPhones.forEach((ph, i) => {
      const div = document.createElement('div');
      div.className = 'c-phone-row';
      div.innerHTML = `<span dir="ltr">${escapeHtml(ph)}</span><button class="c-phone-del" data-i="${i}">×</button>`;
      box.appendChild(div);
    });
  }

  function openEmpCreate() {
    editingEmp = null;
    createEmpPhones = [];
    document.getElementById('s-emp-title').textContent = 'موظف جديد';
    document.getElementById('s-emp-idline').classList.add('hidden');
    document.getElementById('s-e-meta').classList.add('hidden');
    document.getElementById('s-e-name').value = '';
    document.getElementById('s-e-role-collector').checked = false;
    document.getElementById('s-e-role-driver').checked = false;
    document.getElementById('s-e-newphone').value = '';
    document.getElementById('s-e-notes').value = '';
    document.getElementById('s-e-err').textContent = '';
    document.getElementById('s-e-delete').classList.add('hidden');
    document.getElementById('s-e-restore').classList.add('hidden');
    renderCreateEmpPhones();
    open('s-modal-emp');
  }

  async function openEmpDetail(id) {
    const e = await window.api.getEmployee(id);
    if (!e) return;
    editingEmp = id;
    const deleted = !!e.deleted_at;
    document.getElementById('s-emp-title').textContent = deleted ? 'موظف محذوف — عرض' : 'بطاقة الموظف';
    document.getElementById('s-emp-idline').classList.remove('hidden');
    document.getElementById('s-emp-id').textContent = e.id;
    document.getElementById('s-e-name').value = e.name || '';
    document.getElementById('s-e-role-collector').checked = e.roles.includes('collector');
    document.getElementById('s-e-role-driver').checked = e.roles.includes('driver');
    document.getElementById('s-e-newphone').value = '';
    document.getElementById('s-e-notes').value = e.notes || '';
    document.getElementById('s-e-err').textContent = '';
    const meta = document.getElementById('s-e-meta');
    meta.classList.remove('hidden');
    meta.textContent = `أُنشئ: ${e.created_at || '—'} — آخر تعديل: ${e.updated_at || '—'}`;
    document.getElementById('s-e-delete').classList.toggle('hidden', deleted);
    document.getElementById('s-e-restore').classList.toggle('hidden', !deleted);
    renderEditEmpPhones(e);
    open('s-modal-emp');
  }

  function renderEditEmpPhones(e) {
    const box = document.getElementById('s-e-phones');
    box.innerHTML = e.phones.length ? '' : '<p class="hint">لا أرقام بعد — اختياري.</p>';
    for (const p of e.phones) {
      const div = document.createElement('div');
      div.className = 'c-phone-row';
      div.innerHTML = `<span dir="ltr">${escapeHtml(p.phone_number)}</span><button class="c-phone-del" data-ph="${p.id}">×</button>`;
      box.appendChild(div);
    }
  }

  function selectedRoles() {
    const out = [];
    if (document.getElementById('s-e-role-collector').checked) out.push('collector');
    if (document.getElementById('s-e-role-driver').checked) out.push('driver');
    return out;
  }

  // ---------- vehicles ----------
  async function refreshVehs() {
    const query = document.getElementById('s-veh-search')?.value || '';
    const rows = await window.api.listVehicles({ mode: vehMode, query, deleted: vehDeleted ? 'deleted' : 'active' });
    const body = document.getElementById('s-veh-body');
    body.innerHTML = rows.length ? '' : '<tr><td colspan="5" style="text-align:center;color:#6b8aa0">لا مركبات — أضف مركبة جديدة</td></tr>';
    for (const r of rows) {
      const tr = document.createElement('tr');
      const avail = r.is_available
        ? '<span class="pill avail-ok">متوفرة</span>'
        : '<span class="pill avail-no">غير متوفرة</span>';
      const action = vehDeleted
        ? `<button class="link" data-vehrestore="${r.id}">استعادة</button>`
        : `<button class="link" data-vehopen="${r.id}">عرض / تعديل</button>`;
      tr.innerHTML = `<td><strong>${r.id}</strong></td><td><strong>${escapeHtml(r.name)}</strong></td><td dir="ltr">${escapeHtml(r.plate_number || '—')}</td><td>${avail}</td><td>${action}</td>`;
      body.appendChild(tr);
    }
  }

  function openVehCreate() {
    editingVeh = null;
    document.getElementById('s-veh-title').textContent = 'مركبة جديدة';
    document.getElementById('s-veh-idline').classList.add('hidden');
    document.getElementById('s-v-meta').classList.add('hidden');
    document.getElementById('s-v-name').value = '';
    document.getElementById('s-v-plate').value = '';
    document.getElementById('s-v-available').checked = true;
    document.getElementById('s-v-notes').value = '';
    document.getElementById('s-v-err').textContent = '';
    document.getElementById('s-v-delete').classList.add('hidden');
    document.getElementById('s-v-restore').classList.add('hidden');
    open('s-modal-veh');
  }

  async function openVehDetail(id) {
    const v = await window.api.getVehicle(id);
    if (!v) return;
    editingVeh = id;
    const deleted = !!v.deleted_at;
    document.getElementById('s-veh-title').textContent = deleted ? 'مركبة محذوفة — عرض' : 'بطاقة المركبة';
    document.getElementById('s-veh-idline').classList.remove('hidden');
    document.getElementById('s-veh-id').textContent = v.id;
    document.getElementById('s-v-name').value = v.name || '';
    document.getElementById('s-v-plate').value = v.plate_number || '';
    document.getElementById('s-v-available').checked = !!v.is_available;
    document.getElementById('s-v-notes').value = v.notes || '';
    document.getElementById('s-v-err').textContent = '';
    const meta = document.getElementById('s-v-meta');
    meta.classList.remove('hidden');
    meta.textContent = `أُنشئت: ${v.created_at || '—'} — آخر تعديل: ${v.updated_at || '—'}`;
    document.getElementById('s-v-delete').classList.toggle('hidden', deleted);
    document.getElementById('s-v-restore').classList.toggle('hidden', !deleted);
    open('s-modal-veh');
  }

  async function mount(root) {
    await ensureTemplate(root);

    document.getElementById('s-tab-emp').onclick = () => setTab('emp');
    document.getElementById('s-tab-veh').onclick = () => setTab('veh');

    // employees list
    document.querySelectorAll('#s-emp-modes .seg-btn').forEach(b => b.onclick = () => {
      empMode = b.dataset.mode;
      document.querySelectorAll('#s-emp-modes .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      document.getElementById('s-emp-search').placeholder = SEARCH_PH.emp[empMode];
      document.getElementById('s-emp-search').value = '';
      refreshEmps();
    });
    document.getElementById('s-emp-search').oninput = () => refreshEmps();
    document.getElementById('s-emp-refresh').onclick = refreshEmps;
    document.getElementById('s-emp-deleted').onclick = (e) => {
      empDeleted = !empDeleted;
      e.target.textContent = empDeleted ? 'النشطون' : 'المحذوفون';
      refreshEmps();
    };
    document.getElementById('s-btn-add-emp').onclick = openEmpCreate;
    document.getElementById('s-emp-body').onclick = async (e) => {
      const o = e.target.closest('[data-empopen]');
      const r = e.target.closest('[data-emprestore]');
      if (o) openEmpDetail(Number(o.dataset.empopen));
      else if (r) {
        try { await window.api.restoreEmployee(Number(r.dataset.emprestore)); refreshEmps(); }
        catch (err) { window.alert(err.message); }
      }
    };

    // employee modal
    document.getElementById('s-e-addphone').onclick = async () => {
      const inp = document.getElementById('s-e-newphone');
      const ph = inp.value.trim();
      if (!ph) return;
      if (editingEmp === null) {
        if (!createEmpPhones.includes(ph)) createEmpPhones.push(ph);
        inp.value = '';
        renderCreateEmpPhones();
      } else {
        try {
          await window.api.addEmployeePhone({ employee_id: editingEmp, phone_number: ph });
          inp.value = '';
          document.getElementById('s-e-err').textContent = '';
          openEmpDetail(editingEmp);
          refreshEmps();
        } catch (e) { document.getElementById('s-e-err').textContent = e.message; }
      }
    };
    document.getElementById('s-e-phones').onclick = async (e) => {
      const btn = e.target.closest('[data-i],[data-ph]');
      if (!btn) return;
      if (editingEmp === null && btn.dataset.i !== undefined) {
        createEmpPhones.splice(Number(btn.dataset.i), 1);
        renderCreateEmpPhones();
      } else if (editingEmp !== null && btn.dataset.ph) {
        try {
          await window.api.deleteEmployeePhone(Number(btn.dataset.ph));
          openEmpDetail(editingEmp);
        } catch (err) { document.getElementById('s-e-err').textContent = err.message; }
      }
    };
    document.getElementById('s-e-save').onclick = async () => {
      const err = document.getElementById('s-e-err');
      try {
        if (editingEmp === null) {
          await window.api.addEmployee({
            name: document.getElementById('s-e-name').value,
            notes: document.getElementById('s-e-notes').value,
            phones: createEmpPhones,
            roles: selectedRoles()
          });
          close('s-modal-emp');
          refreshEmps();
        } else {
          await window.api.updateEmployee({ id: editingEmp, name: document.getElementById('s-e-name').value, notes: document.getElementById('s-e-notes').value });
          await window.api.setEmployeeRoles({ employee_id: editingEmp, roles: selectedRoles() });
          close('s-modal-emp');
          refreshEmps();
        }
        err.textContent = '';
      } catch (e) { err.textContent = e.message; }
    };
    document.getElementById('s-e-delete').onclick = async () => {
      if (!editingEmp) return;
      if (!window.confirm('حذف الموظف؟ يمكن استعادته لاحقاً.')) return;
      try { await window.api.deleteEmployee(editingEmp); close('s-modal-emp'); refreshEmps(); }
      catch (e) { document.getElementById('s-e-err').textContent = e.message; }
    };
    document.getElementById('s-e-restore').onclick = async () => {
      if (!editingEmp) return;
      try { await window.api.restoreEmployee(editingEmp); close('s-modal-emp'); refreshEmps(); }
      catch (e) { document.getElementById('s-e-err').textContent = e.message; }
    };

    // vehicles list
    document.querySelectorAll('#s-veh-modes .seg-btn').forEach(b => b.onclick = () => {
      vehMode = b.dataset.mode;
      document.querySelectorAll('#s-veh-modes .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      document.getElementById('s-veh-search').placeholder = SEARCH_PH.veh[vehMode];
      document.getElementById('s-veh-search').value = '';
      refreshVehs();
    });
    document.getElementById('s-veh-search').oninput = () => refreshVehs();
    document.getElementById('s-veh-refresh').onclick = refreshVehs;
    document.getElementById('s-veh-deleted').onclick = (e) => {
      vehDeleted = !vehDeleted;
      e.target.textContent = vehDeleted ? 'النشطون' : 'المحذوفون';
      refreshVehs();
    };
    document.getElementById('s-btn-add-veh').onclick = openVehCreate;
    document.getElementById('s-veh-body').onclick = async (e) => {
      const o = e.target.closest('[data-vehopen]');
      const r = e.target.closest('[data-vehrestore]');
      if (o) openVehDetail(Number(o.dataset.vehopen));
      else if (r) {
        try { await window.api.restoreVehicle(Number(r.dataset.vehrestore)); refreshVehs(); }
        catch (err) { window.alert(err.message); }
      }
    };

    // vehicle modal
    document.getElementById('s-v-save').onclick = async () => {
      const err = document.getElementById('s-v-err');
      const payload = {
        name: document.getElementById('s-v-name').value,
        plate_number: document.getElementById('s-v-plate').value,
        notes: document.getElementById('s-v-notes').value,
        is_available: document.getElementById('s-v-available').checked
      };
      try {
        if (editingVeh === null) await window.api.addVehicle(payload);
        else await window.api.updateVehicle({ id: editingVeh, ...payload });
        close('s-modal-veh');
        refreshVehs();
        err.textContent = '';
      } catch (e) { err.textContent = e.message; }
    };
    document.getElementById('s-v-delete').onclick = async () => {
      if (!editingVeh) return;
      if (!window.confirm('حذف المركبة؟ يمكن استعادتها لاحقاً.')) return;
      try { await window.api.deleteVehicle(editingVeh); close('s-modal-veh'); refreshVehs(); }
      catch (e) { document.getElementById('s-v-err').textContent = e.message; }
    };
    document.getElementById('s-v-restore').onclick = async () => {
      if (!editingVeh) return;
      try { await window.api.restoreVehicle(editingVeh); close('s-modal-veh'); refreshVehs(); }
      catch (e) { document.getElementById('s-v-err').textContent = e.message; }
    };

    root.querySelectorAll('.close-modal').forEach(b => b.onclick = () => close(b.dataset.close));

    setTab('emp');
    await refreshEmps();
    await refreshVehs();
  }

  window.StaffModule = { mount };
})();
