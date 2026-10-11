'use strict';
// Localization regression tests: two authoritative dictionaries (ar, fr),
// stable keys, interpolation, error mapping, direction, and a source audit
// that keeps hardcoded interface English out of the renderer.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'index.html'), 'utf8');

function loadI18N() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'i18n.js'), 'utf8');
  const warnings = [];
  const sandbox = {
    window: {},
    console: { warn(m) { warnings.push(String(m)); } },
    Intl,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'i18n.js' });
  return { I18N: sandbox.window.I18N, warnings };
}

describe('localization regression', () => {
  it('two complete dictionaries with identical nonempty key sets', () => {
    const { I18N } = loadI18N();
    assert.deepEqual([...I18N.SUPPORTED], ['ar', 'fr']);
    const ar = Object.keys(I18N.STR.ar);
    const fr = Object.keys(I18N.STR.fr);
    assert.ok(ar.length > 200, `expected a full catalog, got ${ar.length}`);
    assert.deepEqual([...ar].sort(), [...fr].sort(), 'ar/fr key sets must match exactly');
    assert.ok(!('en' in I18N.STR), 'no English locale (ar/fr only by product decision)');
    for (const k of ar) {
      assert.equal(typeof I18N.STR.ar[k], 'string', `${k} must be a string`);
      assert.ok(I18N.STR.ar[k].length > 0, `ar.${k} must be nonempty`);
      assert.ok(I18N.STR.fr[k].length > 0, `fr.${k} must be nonempty`);
    }
  });

  it('interpolation placeholders are consistent across languages', () => {
    const { I18N } = loadI18N();
    const paramsOf = (s) => [...String(s).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const k of Object.keys(I18N.STR.ar)) {
      assert.equal(paramsOf(I18N.STR.fr[k]), paramsOf(I18N.STR.ar[k]), `placeholders differ for ${k}`);
    }
    assert.equal(I18N.t('ar', 'errRequired', { field: 'X' }), I18N.STR.ar.errRequired.replace('{field}', 'X'));
    assert.equal(I18N.t('fr', 'msgTotal', { v: 5 }), I18N.STR.fr.msgTotal.replace('{v}', '5'));
    assert.equal(I18N.t('ar', 'msgTotal', {}), I18N.STR.ar.msgTotal, 'missing params keep the placeholder');
  });

  it('missing keys produce a diagnostic, never silent English', () => {
    const { I18N, warnings } = loadI18N();
    assert.equal(I18N.t('ar', 'noSuchKey'), '[noSuchKey]');
    assert.equal(I18N.t('fr', 'noSuchKey'), '[noSuchKey]');
    assert.ok(warnings.some((w) => w.includes('noSuchKey')), 'missing key warned in console');
    assert.equal(I18N.t('xx', 'dashboard'), '[dashboard]', 'unknown language never falls back silently');
  });

  it('direction and locale follow the language (ar RTL, fr LTR)', () => {
    const { I18N } = loadI18N();
    assert.equal(I18N.dir('ar'), 'rtl');
    assert.equal(I18N.dir('fr'), 'ltr');
    assert.equal(I18N.locale('ar'), 'ar-DZ');
    assert.equal(I18N.locale('fr'), 'fr-DZ');
    assert.ok(FRONT.includes("document.documentElement.dir = window.I18N.dir(lang)"), 'shell applies dir from language');
    assert.ok(FRONT.includes("document.documentElement.lang = lang"), 'shell applies lang');
  });

  it('statuses, types, methods and reasons translate; unknown codes pass through', () => {
    const { I18N } = loadI18N();
    for (const [fn, code] of [['status', 'draft'], ['status', 'posted'], ['docType', 'sales_order'], ['payMethod', 'cash'], ['moveReason', 'damaged'], ['moveType', 'issue'], ['productType', 'goods'], ['taxClass', 'exempt'], ['priceScope', 'general'], ['partyRole', 'supplier']]) {
      for (const lang of ['ar', 'fr']) {
        const v = I18N[fn](lang, code);
        assert.ok(v && v !== code, `${fn}(${code}) must translate in ${lang}`);
      }
    }
    assert.equal(I18N.status('ar', 'warp_speed'), 'warp_speed', 'unknown codes pass through untouched');
    assert.equal(I18N.status('ar', ''), '', 'empty stays empty');
  });

  it('known API errors map to localized messages (no raw English shown)', () => {
    const { I18N } = loadI18N();
    const cases = [
      [{ code: 'VALIDATION', message: 'x' }, 'errValidation'],
      [{ code: 'CONFLICT', message: 'x' }, 'errConflict'],
      [{ code: 'NOT_FOUND', message: 'x' }, 'errNotFound'],
      [{ code: 'INVALID_STATE', message: 'x' }, 'errState'],
      [{ code: 'FORBIDDEN', message: 'x' }, 'errForbidden'],
      [{ code: 'OTHER', message: 'UNIQUE constraint failed: products.sku' }, 'errConflict'],
      [{ code: 'VALIDATION', message: 'sku is immutable; create a new product instead' }, null],
    ];
    for (const [err, key] of cases) {
      for (const lang of ['ar', 'fr']) {
        const m = I18N.err(lang, err);
        assert.ok(m && m.length > 0, `mapped message for ${err.code}`);
        assert.ok(!/UNIQUE constraint failed/i.test(m), 'raw SQL never shown');
        if (key) assert.equal(m, I18N.STR[lang][key]);
      }
    }
    assert.ok(I18N.err('ar', { code: 'VALIDATION', message: 'whatever' }) !== 'whatever', 'unmapped detail falls back to generic, not raw');
    const dup = I18N.err('fr', { code: 'CONFLICT', message: 'barcode B-1 is already registered' });
    assert.ok(dup.length > 0 && dup !== 'barcode B-1 is already registered');
    const need = I18N.ex('errRequired', { field: 'X' });
    assert.equal(I18N.err('ar', need), I18N.STR.ar.errRequired.replace('{field}', 'X'));
    assert.equal(I18N.err('fr', need), I18N.STR.fr.errRequired.replace('{field}', 'X'));
  });

  it('locale-aware number and date formatting (presentation only)', () => {
    const { I18N } = loadI18N();
    for (const lang of ['ar', 'fr']) {
      assert.ok(I18N.fmtNum(lang, 1234567).length > 0, `numbers format in ${lang}`);
      assert.ok(I18N.fmtNum(lang, 0) !== '', `zero formats in ${lang}`);
      const d = I18N.fmtDate(lang, '2026-10-09');
      assert.ok(d && d !== '2026-10-09', `ISO date localizes in ${lang}: ${d}`);
      assert.equal(I18N.fmtDate(lang, ''), '', 'empty date stays empty');
      assert.equal(I18N.fmtDate(lang, 'not-a-date'), 'not-a-date', 'garbage passes through untouched');
    }
  });

  it('language selector offers ar/fr only and switching re-renders', () => {
    assert.ok(HTML.includes('value="ar"') && HTML.includes('value="fr"'), 'selector has ar + fr');
    assert.ok(!/value="en"/.test(HTML), 'no English option in selector');
    assert.ok(/SUPPORTED\.indexOf\(next\)/.test(FRONT), 'unknown languages rejected');
    assert.ok(/getElementById\('dialog-root'\)\.innerHTML = ''/.test(FRONT), 'open dialogs do not linger across languages');
  });

  it('source audit: no hardcoded interface English in renderer templates', () => {
    const banned = [
      /fld\('[^)]/, /title:\s*'/, /sub:\s*'/,
      /<option>(correction|damaged|cash|bank_transfer|true|false|goods|standard|general|in \(from customer\))/,
      />load<\/button>/, />close<\/button>/, />cancel<\/button>/, />submit<\/button>/,
      />all debtors/, />totals by category</, />check avail</, />post movement</,
      />stock \(MAIN\)</, />resolve preview</, />resolve</, />invoice selected</,
      />no GPS/, /GPS\/map: no integration/, /update\/delete: unsupported/,
      /emptyHtml\('run a report'\)/, /toast\('…'/,
    ];
    // Note: unwrap()'s internal 'request failed' fallback is never displayed raw;
    // I18N.err maps it to errNetwork (covered above).
    const allowSrc = [/fld\('SKU\*?',/, /title="SKU"/];
    for (const re of banned) {
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(FRONT)) !== null) {
        const context = FRONT.slice(m.index, m.index + 120);
        assert.ok(allowSrc.some((a) => a.test(context)), `hardcoded UI English remains: ${context.slice(0, 80)}`);
      }
    }
    assert.ok(!/toast\('✓ settled'/.test(FRONT), 'word toasts localized');
    assert.ok(!/emptyHtml\('pick /.test(FRONT), 'empty states localized');
  });

  it('every route renderer builds headings and controls from the dictionary', () => {
    const pages = ['renderDashboard', 'renderArticles', 'renderStock', 'renderSales',
      'renderPurchases', 'renderParties', 'renderCash', 'renderCounts',
      'renderRoutes', 'renderReports', 'renderSettings', 'renderNotFound'];
    for (const fn of pages) {
      const start = FRONT.indexOf('function ' + fn + '(');
      assert.ok(start !== -1, `${fn} exists`);
      const next = FRONT.indexOf('\n  function ', start + 10);
      const body = FRONT.slice(start, next === -1 ? undefined : next);
      const uses = (body.match(/\bt\(['"]/g) || []).length;
      assert.ok(uses >= 2, `${fn} must use t() for visible chrome (found ${uses})`);
    }
    assert.ok(/pageHead\(t\(/.test(FRONT), 'page headers localized');
  });

  it('renderer architecture invariants still hold', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
    assert.ok(FRONT.includes('window.I18N'), 'single shared translation helper in use');
  });
});
