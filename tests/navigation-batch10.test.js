'use strict';
// Batch 10 gate: navigation has no dead ends; unknown routes show not-found;
// matrix + gaps docs exist with required structure; no fake capabilities.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');

function navIds() {
  const ids = [];
  const re = /\{\s*id:\s*'([a-z-]+)'/g;
  let m;
  while ((m = re.exec(FRONT)) !== null) ids.push(m[1]);
  return [...new Set(ids)];
}

describe('batch10 navigation/gap closure', () => {
  it('every nav entry maps to an implemented route renderer', () => {
    const routesBlock = FRONT.slice(FRONT.indexOf('var ROUTES = {'), FRONT.indexOf('var ROUTES = {') + 600);
    for (const id of navIds()) {
      assert.ok(new RegExp('\\b' + id + '\\s*:').test(routesBlock), `nav ${id} must have a ROUTES renderer`);
      assert.ok(new RegExp('function render' + id[0].toUpperCase() + id.slice(1)).test(FRONT) || routesBlock.includes(id), `renderer for ${id}`);
    }
    for (const id of ['dashboard', 'articles', 'stock', 'sales', 'purchases', 'parties', 'cash', 'counts', 'routes', 'reports', 'settings']) {
      assert.ok(navIds().includes(id), `nav must include ${id}`);
    }
  });

  it('unknown hashes render not-found instead of blank/dashboard fallback', () => {
    assert.ok(/notfound:\s*renderNotFound/.test(FRONT), 'notfound renderer wired');
    assert.ok(/return ROUTES\[id\] \? id : 'notfound'/.test(FRONT), 'unknown ids map to notfound');
    assert.ok(/function renderNotFound/.test(FRONT), 'renderNotFound exists');
    const I18N_SRC = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'i18n.js'), 'utf8');
    assert.ok(/Page introuvable/.test(I18N_SRC) && /صفحة غير موجودة/.test(I18N_SRC), 'not-found is bilingual (authoritative dict)');
    assert.ok(/t\('notFound'\)/.test(FRONT), 'not-found title uses the dictionary');
  });

  it('coverage matrix has required columns and honest labels', () => {
    const p = path.join(ROOT, 'docs', 'UI_COVERAGE_MATRIX.md');
    assert.ok(fs.existsSync(p), 'matrix doc exists');
    const s = fs.readFileSync(p, 'utf8');
    for (const c of ['route', 'relevant API methods', 'read support', 'write support', 'status', 'empty / error', 'RTL', 'responsive', 'test coverage', 'completion status']) {
      assert.ok(s.toLowerCase().includes(c.toLowerCase()), `matrix needs column: ${c}`);
    }
    for (const l of ['implemented', 'partial', 'backend-gap', 'out-of-scope', 'reference-only']) {
      assert.ok(s.includes(l), `matrix needs label: ${l}`);
    }
  });

  it('gaps doc records backend gaps without claiming them complete', () => {
    const p = path.join(ROOT, 'docs', 'UI_GAPS.md');
    assert.ok(fs.existsSync(p), 'gaps doc exists');
    const s = fs.readFileSync(p, 'utf8');
    assert.ok(/report/i.test(s) && /GPS/i.test(s), 'must record report + GPS gaps');
    assert.ok(!/complete.*all|100%.*done/i.test(s), 'must not declare false completion');
  });

  it('no fake admin/import/backup/cloud controls in renderer', () => {
    assert.ok(!/createUser|deleteUser|setRole|backupNow|restoreBackup|cloudSync|pairScanner/i.test(FRONT), 'no fake admin controls');
  });

  it('renderer stays display-only after batch 10', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
  });
});
