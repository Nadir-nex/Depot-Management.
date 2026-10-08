/* Dashboard — warnings board (read-only, talks only to window.api) */
(function () {
  const CAT_AR = {
    inventory: 'المخزون', pricing: 'الأسعار', customers: 'الزبائن',
    orders: 'الطلبيات', deliveries: 'التوصيل', employees: 'الموظفون',
    vehicles: 'المركبات', consistency: 'سلامة البيانات', activity: 'النشاط'
  };
  const SEV_AR = { danger: 'خطر', warn: 'تنبيه', info: 'معلومة' };

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const CODE_AR = { zero_stock: 'بدون مخزون', no_cost: 'بدون تكلفة', no_price: 'بدون سعر' };
  const PRODUCT_CODES = ['zero_stock', 'no_cost', 'no_price'];

  // Same grouping semantics as the sidebar widget: overlapping product warnings
  // collapse into one product-group row; other warnings stay individual.
  // `by_code`/`affected_products` from the backend keep counts meaningful.
  function buildEntries(warnings, filter) {
    const groups = new Map();
    const singles = [];
    for (const x of warnings) {
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
    return entries;
  }

  async function refresh() {
    const data = await window.api.getWarnings({});
    const cards = document.getElementById('d-cards');
    const cats = Object.keys(CAT_AR);
    cards.innerHTML = '';
    for (const c of cats) {
      const n = (data.by_category && data.by_category[c]) || 0;
      const div = document.createElement('div');
      div.className = 'card dash-cat' + (n ? ' warn' : '');
      div.innerHTML = `<div class="card-label">${CAT_AR[c]}</div><div class="card-val">${n}</div>`;
      cards.appendChild(div);
    }
    document.getElementById('d-generated').textContent = 'آخر فحص: ' + (data.generated_at || '').slice(0, 19).replace('T', ' ');
    // Paginate product-group entries (not duplicated rows): header shows
    // affected products vs warning details, plus per-code breakdown.
    const PAGE = 100;
    let page = 0;
    let filter = 'all';
    const render = () => {
      const entries = buildEntries(data.warnings, filter);
      const affected = entries.filter(e => e.kind === 'product').length;
      const byCode = data.by_code || {};
      const totalPages = Math.max(1, Math.ceil(entries.length / PAGE));
      if (page > totalPages - 1) page = totalPages - 1;
      const slice = entries.slice(page * PAGE, page * PAGE + PAGE);
      const filt = document.getElementById('d-filters');
      if (filt) {
        const opts = [['all', 'الكل'], ['zero_stock', 'بدون مخزون'], ['no_cost', 'بدون تكلفة'], ['no_price', 'بدون سعر'], ['other', 'أخرى']];
        filt.innerHTML = opts.map(([v, l]) => `<button class="btn ${filter === v ? 'cyan' : 'ghost'}" data-df="${v}">${l}</button>`).join('');
        filt.onclick = (e) => {
          const b = e.target.closest('[data-df]');
          if (!b) return;
          filter = b.dataset.df;
          page = 0;
          render();
        };
      }
      const head = document.getElementById('d-count');
      if (head) head.textContent = entries.length
        ? `مشاكل المنتجات: ${data.affected_products ?? affected} — بدون مخزون: ${byCode.zero_stock || 0}، بدون تكلفة: ${byCode.no_cost || 0}، بدون سعر: ${byCode.no_price || 0} — عرض ${entries.length} سجل (صفحة ${page + 1} من ${totalPages})`
        : 'إجمالي التنبيهات: 0';
      const body = document.getElementById('d-body');
      body.innerHTML = slice.length ? '' : '<tr><td colspan="3" style="text-align:center;color:#2e7d32">لا تنبيهات — كل شيء سليم ✓</td></tr>';
      for (const entry of slice) {
        const tr = document.createElement('tr');
        if (entry.kind === 'product') {
          const m = entry.raws[0] ? entry.raws[0].message.match(/«(.+)»/) : null;
          const label = m ? m[1] : ('#' + entry.item_id);
          const sev = entry.raws.some(r => r.severity === 'danger') ? 'danger' : 'warn';
          tr.innerHTML = `<td>المخزون/الأسعار</td><td>منتج: ${escapeHtml(label)} (#${entry.item_id}) — ${entry.codes.map(c => CODE_AR[c] || c).join('، ')}</td><td><span class="sev ${sev}">${SEV_AR[sev] || sev}</span></td>`;
        } else {
          const w = entry.warning;
          tr.innerHTML = `<td>${CAT_AR[w.category] || w.category}</td><td>${escapeHtml(w.message)}</td><td><span class="sev ${w.severity}">${SEV_AR[w.severity] || w.severity}</span></td>`;
        }
        body.appendChild(tr);
      }
      const pager = document.getElementById('d-pager');
      if (pager) {
        pager.innerHTML = totalPages > 1
          ? `<button class="btn ghost" id="d-prev">السابق</button><span class="hint">صفحة ${page + 1} من ${totalPages}</span><button class="btn ghost" id="d-next">التالي</button>` : '';
        const pv = document.getElementById('d-prev');
        const nx = document.getElementById('d-next');
        if (pv) pv.onclick = () => { if (page > 0) { page--; render(); } };
        if (nx) nx.onclick = () => { if (page < totalPages - 1) { page++; render(); } };
      }
    };
    render();
  }

  async function mount(root) {
    if (!root.querySelector('.dash')) {
      const res = await fetch('modules/dashboard/dashboard.html');
      root.innerHTML = await res.text();
    }
    document.getElementById('d-btn-refresh').onclick = refresh;
    await refresh();
  }

  window.DashboardModule = { mount, refresh };
})();
