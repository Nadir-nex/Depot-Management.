/* Deliveries module — شحنة التوصيل, talks only to window.api -> db */
(function () {
  const STATUS_AR = { planned: 'مخططة', in_progress: 'قيد التوصيل', completed: 'مكتملة' };

  let dStatus = 'all';
  let selOrders = []; // create-modal selection [{id, reference, customer_id, customer_name, district_name, total}]

  async function ensureTemplate(root) {
    if (root.querySelector('.dlv')) return;
    const res = await fetch('modules/deliveries/deliveries.html');
    root.innerHTML = await res.text();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function open(id) { document.getElementById(id).classList.remove('hidden'); }
  function close(id) { document.getElementById(id).classList.add('hidden'); }
  function statusPill(st) { return `<span class="status-pill st-${st === 'planned' ? 'waiting' : st === 'in_progress' ? 'out_for_delivery' : 'delivered'}">${STATUS_AR[st] || st}</span>`; }

  async function loadDistricts(selId, keepVal) {
    const ds = await window.api.listDistricts();
    const sel = document.getElementById(selId);
    if (!sel) return;
    const keep = keepVal !== undefined ? keepVal : sel.value;
    sel.innerHTML = '<option value="">— بدون —</option>' + ds.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    if (keep) sel.value = keep;
  }

  async function refresh() {
    const rows = await window.api.listDeliveries({
      status: dStatus === 'all' ? null : dStatus,
      date: document.getElementById('d-filter-date')?.value || null,
      districtId: document.getElementById('d-filter-district')?.value ? Number(document.getElementById('d-filter-district').value) : null
    });
    const body = document.getElementById('d-body');
    body.innerHTML = rows.length ? '' : '<tr><td colspan="9" style="text-align:center;color:#6b8aa0">لا شحنات — أنشئ شحنة توصيل</td></tr>';
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#${r.id}</strong></td>
        <td>${escapeHtml(r.delivery_date || '—')}</td>
        <td>${escapeHtml(r.district_name || '—')}</td>
        <td>${escapeHtml(r.driver_name || '—')}</td>
        <td>${escapeHtml(r.vehicle_name || '—')}</td>
        <td>${r.stop_count}</td>
        <td>${r.order_count} <small style="color:#6b8aa0">(${r.delivered_count} ✓)</small></td>
        <td>${statusPill(r.status)}</td>
        <td><button class="link" data-open="${r.id}">فتح</button></td>`;
      body.appendChild(tr);
    }
    const [all, planned, prog, done] = await Promise.all([
      window.api.listDeliveries({}),
      window.api.listDeliveries({ status: 'planned' }),
      window.api.listDeliveries({ status: 'in_progress' }),
      window.api.listDeliveries({ status: 'completed' })
    ]);
    document.getElementById('d-stat-all').textContent = all.length;
    document.getElementById('d-stat-planned').textContent = planned.length;
    document.getElementById('d-stat-progress').textContent = prog.length;
    document.getElementById('d-stat-done').textContent = done.length;
  }

  function setCard(c) {
    dStatus = c;
    ['all', 'planned', 'progress', 'done'].forEach(k => document.getElementById('d-card-' + k)?.classList.toggle('active', k === c));
    const map = { all: null, planned: 'planned', progress: 'in_progress', done: 'completed' };
    dStatus = map[c];
    refresh();
  }

  // ---------- create ----------
  async function openCreate() {
    selOrders = [];
    document.getElementById('d-err').textContent = '';
    document.getElementById('d-warn').classList.add('hidden');
    document.getElementById('d-f-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('d-order-search').value = '';
    document.getElementById('d-order-results').innerHTML = '';
    await loadDistricts('d-f-district');
    document.getElementById('d-f-district').value = '';
    const drivers = await window.api.listEmployeesByRole('driver');
    document.getElementById('d-f-driver').innerHTML = drivers.length
      ? drivers.map(d => `<option value="${d.id}">${escapeHtml(d.name)} (#${d.id})</option>`).join('')
      : '<option value="">— لا سائقين —</option>';
    const vehs = (await window.api.listVehicles({ mode: 'name', query: '' })).filter(v => v.is_available);
    document.getElementById('d-f-vehicle').innerHTML = vehs.length
      ? vehs.map(v => `<option value="${v.id}">${escapeHtml(v.name)}${v.plate_number ? ' — ' + escapeHtml(v.plate_number) : ''}</option>`).join('')
      : '<option value="">— لا مركبات متوفرة —</option>';
    renderSelected();
    open('d-modal');
  }

  function renderSelected() {
    document.getElementById('d-sel-count').textContent = selOrders.length;
    const box = document.getElementById('d-selected');
    box.innerHTML = selOrders.length ? '' : '<p class="hint">اختر طلبية واحدة على الأقل.</p>';
    selOrders.forEach((o, i) => {
      const div = document.createElement('div');
      div.className = 'o-result-row';
      div.innerHTML = `<span><strong dir="ltr">${escapeHtml(o.reference)}</strong> — ${escapeHtml(o.customer_name)} <small>${escapeHtml(o.district_name || '')} — ${o.total} DA</small></span><button class="c-phone-del" data-rm="${i}">×</button>`;
      box.appendChild(div);
    });
  }

  async function searchEligible() {
    const q = document.getElementById('d-order-search').value.trim();
    const box = document.getElementById('d-order-results');
    const rows = await window.api.eligibleOrders({ query: q });
    const fresh = rows.filter(r => !selOrders.some(s => s.id === r.id));
    // suggestions: same-customer orders of last selected first
    let sugg = [];
    if (selOrders.length) {
      const last = selOrders[selOrders.length - 1];
      sugg = (await window.api.eligibleOrders({ customerId: last.customer_id }))
        .filter(r => !selOrders.some(s => s.id === r.id));
    }
    const seen = new Set();
    const ordered = [...sugg, ...fresh].filter(r => !seen.has(r.id) && (seen.add(r.id), true)).slice(0, 12);
    box.innerHTML = ordered.length ? '' : '<p class="hint">لا طلبيات مؤهلة مطابقة.</p>';
    for (const r of ordered) {
      const div = document.createElement('div');
      div.className = 'o-result-row';
      const same = selOrders.length && r.customer_id === selOrders[selOrders.length - 1].customer_id ? ' <small>★ نفس الزبون</small>' : '';
      div.innerHTML = `<span><strong dir="ltr">${escapeHtml(r.reference)}</strong> — ${escapeHtml(r.customer_name)}${same}<br><small>${escapeHtml(r.district_name || 'بدون حي')} — ${r.total} DA — ${r.item_count} منتجات</small></span><button class="link" data-add="${r.id}">إضافة</button>`;
      div._r = r;
      box.appendChild(div);
      div.querySelector('[data-add]').onclick = () => {
        if (!selOrders.some(s => s.id === r.id)) selOrders.push(r);
        renderSelected();
        searchEligible();
      };
    }
  }

  async function saveCreate() {
    const err = document.getElementById('d-err');
    try {
      const r = await window.api.createDelivery({
        delivery_date: document.getElementById('d-f-date').value,
        district_id: document.getElementById('d-f-district').value ? Number(document.getElementById('d-f-district').value) : null,
        driver_id: Number(document.getElementById('d-f-driver').value),
        vehicle_id: Number(document.getElementById('d-f-vehicle').value),
        order_ids: selOrders.map(o => o.id)
      });
      err.textContent = '';
      close('d-modal');
      refresh();
      openDetail(r.id);
    } catch (e) { err.textContent = e.message; }
  }

  // ---------- detail ----------
  async function openDetail(id) {
    const d = await window.api.getDelivery(id);
    if (!d) return;
    const det = document.getElementById('d-detail');
    const warns = d.warnings && d.warnings.length
      ? `<div class="warnbox">⚠ مخزون غير كافٍ لبعض المنتجات: ${d.warnings.map(w => `${escapeHtml(w.item_name)} (مطلوب ${w.need} + ${w.other_demand} ملتزم، متوفر ${w.stock})`).join('، ')}</div>` : '';

    let stopsHtml = '';
    d.stops.forEach((s, si) => {
      const ordersHtml = s.orders.filter(m => !m.removed_at).map(m => {
        const done = m.delivered_at ? `<span class="done-mark">✓ ${escapeHtml(m.delivered_at.slice(0, 16))}</span>` : '';
        let btns = ` <button class="link" data-goorder="${m.order_id}">عرض الطلبية</button>`;
        if (d.status === 'planned') btns += ` <button class="link" data-rmorder="${m.order_id}">إزالة</button>`;
        else if (d.status === 'in_progress' && !m.delivered_at) btns += ` <button class="link" data-deliver="${m.order_id}">[ تسليم ]</button> <button class="link" data-rmorder="${m.order_id}">إزالة</button>`;
        return `<div class="dorder-row"><span class="grow"><strong dir="ltr">${escapeHtml(m.reference)}</strong> — ${m.total} DA ${done}</span>${btns}</div>`;
      }).join('') || '<p class="hint">لا طلبيات نشطة في هذا التوقف.</p>';
      const moveBtns = d.status === 'planned' && d.stops.length > 1
        ? `<button class="link" data-up="${s.id}">↑</button><button class="link" data-down="${s.id}">↓</button>` : '';
      stopsHtml += `<div class="stop"><div class="stop-head"><span class="stop-num">${s.sequence}</span><span>${escapeHtml(s.customer_name)} <small style="color:#6b8aa0">#${s.customer_id} — ${escapeHtml(s.district_name || 'بدون حي')}</small></span> ${moveBtns} <button class="link" data-gocust="${s.customer_id}">الزبون</button></div><div class="stop-orders">${ordersHtml}</div></div>`;
    });

    det.innerHTML = `
      <div class="dlv-info">
        <h2>شحنة التوصيل #${d.id}</h2>
        <div>التاريخ: <strong>${escapeHtml(d.delivery_date)}</strong> — الحالة: ${statusPill(d.status)}</div>
        <div>السائق: <strong>${escapeHtml(d.driver_name || '—')}</strong> — المركبة: <strong>${escapeHtml(d.vehicle_name || '—')}</strong></div>
        <div>الحي الرئيسي: ${escapeHtml(d.district_name || '—')}</div>
        <div><small style="color:#6b8aa0">بدأت: ${escapeHtml((d.started_at || '—').slice(0, 16))} — انتهت: ${escapeHtml((d.completed_at || '—').slice(0, 16))}</small></div>
      </div>
      ${warns}
      ${d.status === 'planned' ? `<div class="row"><input id="d-add-search" placeholder="إضافة طلبية: ابحث باسم الزبون…" /><button id="d-add-go" class="btn cyan">بحث</button></div><div id="d-add-results"></div>` : ''}
      ${stopsHtml}`;

    const acts = document.getElementById('d-detail-actions');
    acts.innerHTML = '';
    document.getElementById('d-detail-err').textContent = '';
    const addBtn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn;
      acts.appendChild(b);
    };
    if (d.status === 'planned') {
      addBtn('تعديل', 'cyan', () => openEdit(d));
      addBtn('بدء التوصيل', 'primary', async () => {
        if (!window.confirm('بدء شحنة التوصيل؟')) return;
        try {
          const r = await window.api.startDelivery(d.id);
          if (r.warnings && r.warnings.length) {
            document.getElementById('d-detail-err').textContent = '⚠ بدأت الشحنة مع تنبيه مخزون: ' +
              r.warnings.map(w => `${w.item_name} (مطلوب ${w.need}، متوفر ${w.stock})`).join('، ');
          }
          openDetail(d.id); refresh();
        } catch (e) { document.getElementById('d-detail-err').textContent = e.message; }
      });
      addBtn('حذف', 'danger', async () => {
        if (!window.confirm(`حذف الشحنة #${d.id}؟`)) return;
        try { await window.api.deleteDelivery(d.id); close('d-modal-detail'); refresh(); }
        catch (e) { document.getElementById('d-detail-err').textContent = e.message; }
      });
    }
    if (d.status === 'in_progress') {
      addBtn('إنهاء التوصيل', 'primary', async () => {
        if (!window.confirm('إنهاء الشحنة؟ تبقى سجلاً تاريخياً.')) return;
        try { await window.api.completeDelivery(d.id); openDetail(d.id); refresh(); }
        catch (e) { document.getElementById('d-detail-err').textContent = e.message; }
      });
      addBtn('إخفاء', 'ghost', async () => {
        if (!window.confirm('إخفاء الشحنة من القوائم؟')) return;
        try { await window.api.hideDelivery(d.id); close('d-modal-detail'); refresh(); }
        catch (e) { document.getElementById('d-detail-err').textContent = e.message; }
      });
    }
    if (d.status === 'completed') {
      addBtn('إخفاء', 'ghost', async () => {
        if (!window.confirm('إخفاء الشحنة من القوائم؟')) return;
        try { await window.api.hideDelivery(d.id); close('d-modal-detail'); refresh(); }
        catch (e) { document.getElementById('d-detail-err').textContent = e.message; }
      });
    }

    // stop/order row actions (delegate)
    det.onclick = async (e) => {
      const up = e.target.closest('[data-up]');
      const down = e.target.closest('[data-down]');
      const rm = e.target.closest('[data-rmorder]');
      const dl = e.target.closest('[data-deliver]');
      const go = e.target.closest('[data-goorder]');
      const gc = e.target.closest('[data-gocust]');
      const errBox = document.getElementById('d-detail-err');
      try {
        if (up || down) {
          const ids = d.stops.map(s => s.id);
          const i = ids.indexOf(Number((up || down).dataset.up || (up || down).dataset.down));
          const j = i + (up ? -1 : 1);
          if (i < 0 || j < 0 || j >= ids.length) return;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          await window.api.reorderStops({ delivery_id: d.id, stop_ids: ids });
          openDetail(d.id); refresh();
        } else if (rm) {
          await window.api.removeOrderFromDelivery({ delivery_id: d.id, order_id: Number(rm.dataset.rmorder) });
          openDetail(d.id); refresh();
        } else if (dl) {
          await window.api.deliverOrder({ delivery_id: d.id, order_id: Number(dl.dataset.deliver) });
          openDetail(d.id); refresh();
        } else if (go) {
          close('d-modal-detail');
          document.querySelector('.nav-btn[data-module="orders"]')?.click();
          const oid = Number(go.dataset.goorder);
          setTimeout(() => window.OrdersModule && window.OrdersModule.openDetail(oid), 250);
        } else if (gc) {
          close('d-modal-detail');
          window.CustomersModule.openDetail(Number(gc.dataset.gocust));
        }
      } catch (err) { errBox.textContent = err.message; }
    };

    // planned: inline add-order search
    const addGo = document.getElementById('d-add-go');
    if (addGo) {
      addGo.onclick = async () => {
        const q = document.getElementById('d-add-search').value.trim();
        const box = document.getElementById('d-add-results');
        const rows = await window.api.eligibleOrders({ query: q });
        box.innerHTML = rows.length ? '' : '<p class="hint">لا طلبيات مؤهلة.</p>';
        for (const r of rows.slice(0, 8)) {
          const div = document.createElement('div');
          div.className = 'o-result-row';
          div.innerHTML = `<span><strong dir="ltr">${escapeHtml(r.reference)}</strong> — ${escapeHtml(r.customer_name)}</span><button class="link" data-a="${r.id}">إضافة</button>`;
          box.appendChild(div);
          div.querySelector('[data-a]').onclick = async () => {
            try {
              await window.api.addOrderToDelivery({ delivery_id: d.id, order_id: r.id });
              openDetail(d.id); refresh();
            } catch (err) { document.getElementById('d-detail-err').textContent = err.message; }
          };
        }
      };
    }

    open('d-modal-detail');
  }

  async function openEdit(d) {
    await loadDistricts('d-e-district', d.district_id);
    document.getElementById('d-e-date').value = d.delivery_date || '';
    const drivers = await window.api.listEmployeesByRole('driver');
    document.getElementById('d-e-driver').innerHTML = drivers.map(x => `<option value="${x.id}">${escapeHtml(x.name)} (#${x.id})</option>`).join('');
    document.getElementById('d-e-driver').value = d.driver_id;
    const vehs = await window.api.listVehicles({ mode: 'name', query: '' });
    document.getElementById('d-e-vehicle').innerHTML = vehs.filter(v => v.is_available || v.id === d.vehicle_id)
      .map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
    document.getElementById('d-e-vehicle').value = d.vehicle_id;
    document.getElementById('d-e-err').textContent = '';
    document.getElementById('d-e-save').onclick = async () => {
      try {
        await window.api.updateDelivery({
          id: d.id,
          delivery_date: document.getElementById('d-e-date').value,
          district_id: document.getElementById('d-e-district').value ? Number(document.getElementById('d-e-district').value) : null,
          driver_id: Number(document.getElementById('d-e-driver').value),
          vehicle_id: Number(document.getElementById('d-e-vehicle').value)
        });
        close('d-modal-edit');
        openDetail(d.id); refresh();
      } catch (e) { document.getElementById('d-e-err').textContent = e.message; }
    };
    open('d-modal-edit');
  }

  async function mount(root) {
    await ensureTemplate(root);
    const ds = await window.api.listDistricts();
    const f = document.getElementById('d-filter-district');
    if (f) f.innerHTML = '<option value="">كل الأحياء</option>' + ds.map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');

    document.getElementById('d-btn-add').onclick = openCreate;
    document.getElementById('d-btn-refresh').onclick = refresh;
    document.getElementById('d-filter-date').onchange = refresh;
    document.getElementById('d-filter-district').onchange = refresh;
    ['all', 'planned', 'progress', 'done'].forEach(k => document.getElementById('d-card-' + k).onclick = () => setCard(k));
    root.querySelectorAll('.close-modal').forEach(b => b.onclick = () => close(b.dataset.close));

    document.getElementById('d-order-search').oninput = searchEligible;
    document.getElementById('d-selected').onclick = (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { selOrders.splice(Number(rm.dataset.rm), 1); renderSelected(); }
    };
    document.getElementById('d-btn-create').onclick = saveCreate;
    document.getElementById('d-body').onclick = (e) => {
      const b = e.target.closest('[data-open]');
      if (b) openDetail(Number(b.dataset.open));
    };

    refresh();
  }

  window.DeliveryModule = { mount, openDetail };
})();
