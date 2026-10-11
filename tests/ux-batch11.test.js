'use strict';
// Batch 11 gate: UX/a11y/i18n/responsive/print polish without semantic change.
// Static checks over renderer source + styles; behavior verified by suite.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'i18n.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'styles.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'index.html'), 'utf8');

function strKeys(lang) {
  // Authoritative dictionaries live in i18n.js (STR.{ar,fr}); app.js only calls t().
  const anchor = '\n    ' + lang + ': {';
  const start = I18N_SRC.indexOf(anchor);
  assert.ok(start !== -1, `dict block missing for ${lang}`);
  let end = I18N_SRC.indexOf('\n  },', start);
  for (const other of ['ar', 'fr']) {
    if (other === lang) continue;
    const o = I18N_SRC.indexOf('\n    ' + other + ': {', start);
    if (o !== -1 && (end === -1 || o < end)) end = o;
  }
  const block = I18N_SRC.slice(start, end === -1 ? undefined : end);
  const out = new Set();
  let m;
  const re = /([A-Za-z0-9_]+):/g;
  while ((m = re.exec(block))) out.add(m[1]);
  return out;
}

describe('batch11 ux/a11y/i18n/print polish', () => {
  it('every t() key exists in both languages (no broken placeholders)', () => {
    const used = new Set();
    let m;
    const re = /\bt\('([A-Za-z0-9_]+)'\)/g;
    while ((m = re.exec(FRONT))) used.add(m[1]);
    assert.ok(used.size > 50, `expected a real key catalog, got ${used.size}`);
    const ar = strKeys('ar');
    const fr = strKeys('fr');
    for (const k of used) {
      assert.ok(ar.has(k), `ar missing: ${k}`);
      assert.ok(fr.has(k), `fr missing: ${k}`);
    }
    for (const id of ['dashboard', 'articles', 'stock', 'sales', 'purchases', 'parties', 'cash', 'counts', 'routes', 'reports', 'settings']) {
      assert.ok(ar.has(id) && fr.has(id), `nav key missing: ${id}`);
    }
    assert.ok(ar.has('notFound') && fr.has('notFound'), 'not-found title key translated (wired via alias)');
  });

  it('global search is labeled and honest (catalog-scoped, navigates)', () => {
    assert.ok(HTML.includes('aria-label') && HTML.includes('global-search'), 'search has a static label');
    assert.ok(FRONT.includes("setAttribute('aria-label'"), 'search label localized at runtime');
    assert.ok(/window\.location\.hash = '#\/articles'/.test(FRONT), 'typing outside articles routes to the catalog it filters');
  });

  it('layout is direction-aware (no physical left/right hacks)', () => {
    assert.ok(!/margin-left|margin-right|padding-left|padding-right|text-align:\s*(left|right)|inset:[^;]*\bleft\b/.test(CSS), 'no physical direction properties');
    assert.ok(CSS.includes('inset-inline-start') && CSS.includes('text-align:start'), 'logical properties used');
    assert.ok(/\[dir="ltr"\]/.test(FRONT) || /\[dir="ltr"\]/.test(CSS), 'LTR override present');
    assert.ok(/document\.documentElement\.dir/.test(FRONT), 'dir flips with language');
  });

  it('dialogs manage focus, announce errors, and clean up Escape handlers', () => {
    assert.ok(/role.*dialog/.test(FRONT) && /aria-modal/.test(FRONT), 'dialog semantics');
    assert.ok(/role.*alertdialog/.test(FRONT), 'confirm semantics');
    assert.ok(/\.focus\(\)/.test(FRONT), 'initial focus set');
    assert.ok(/removeEventListener\('keydown', onKey\)/.test(FRONT), 'Escape listeners removed on close');
    assert.ok(/role.*alert/.test(FRONT), 'validation messages announced');
    assert.ok(HTML.includes('class="skip"'), 'skip link present');
  });

  it('icon-only buttons carry accessible names', () => {
    for (const attr of ['data-ptoggle', 'data-pdel', 'data-cdel', 'data-ldel', 'data-rline', 'data-brm', 'data-lotdel', 'data-lrm', 'data-lr', 'data-dt', 'data-vt', 'data-rmstop', 'data-whtoggle', 'data-whdel']) {
      const i = FRONT.indexOf(attr);
      assert.ok(i !== -1, `template with ${attr} exists`);
      const window_ = FRONT.slice(i, i + 600);
      assert.ok(/aria-label/.test(window_), `${attr} button labeled`);
    }
  });

  it('print is usable and never mutates state', () => {
    assert.ok(/body\.print-dialog/.test(CSS) && /@media print/.test(CSS), 'print stylesheet handles dialog + page');
    assert.ok(!/#dialog-root\s*\{[^}]*display:\s*none/.test(CSS.replace(/@media print\{[\s\S]*print-dialog[\s\S]*$/, '')), 'dialog no longer hidden in print');
    const prints = (FRONT.match(/window\.print\(\)/g) || []).length;
    assert.ok(prints >= 2, `expected doc + report print paths, got ${prints}`);
    assert.ok(/t\('hServer'\)/.test(FRONT), 'print labeled with server-value marker');
  });

  it('badges carry text (never color-only) and destructive actions confirm', () => {
    assert.ok(/badge[^}]*I18N\.status\(lang/.test(FRONT) && /esc\(window\.I18N\.status\(lang/.test(FRONT), 'badge renders localized status text');
    assert.ok(/btn danger/.test(FRONT) && /confirmDialog/.test(FRONT), 'destructive style + confirmation');
  });

  it('no zoom property and no oversized unbounded tables', () => {
    assert.ok(!/(^|\s)zoom\s*:/.test(CSS), 'no zoom (project decision)');
    assert.ok(/slice\(0, (60|100|200|500)\)/.test(FRONT), 'tables capped');
    assert.ok(/data-busy/.test(FRONT), 'double-submit guard retained');
  });

  it('renderer stays display-only after batch 11', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
  });
});
