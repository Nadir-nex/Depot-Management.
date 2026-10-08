'use strict';
// Architecture invariants: one architecture only. These tests pin the
// structural rules of the single production architecture — one authoritative
// database, one schema, one stock ledger, a display-only renderer, IPC that
// routes only into application commands/queries, and migration tooling that
// is never wired into the runtime.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(p));
    else if (entry.name.endsWith('.js')) out.push(path.relative(ROOT, p).split(path.sep).join('/'));
  }
  return out;
}

describe('architecture invariants', () => {
  it('opens the authoritative database in exactly one module', () => {
    const openers = walkJs(path.join(ROOT, 'src')).filter(
      (f) => !f.startsWith('src/infrastructure/import/') // one-shot source reader (read-only, never in runtime)
        && read(f).includes("require('node:sqlite')")
    );
    assert.deepEqual(openers, ['src/db/index.js']);

    // The one migration-source opener must be read-only and query-only.
    const reader = read('src', 'infrastructure', 'import', 'sourceReader.js');
    assert.match(reader, /\{ readOnly: true \}/);
    assert.doesNotMatch(reader, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\.run\(/);
  });

  it('has no authoritative JSON persistence anywhere in src/', () => {
    for (const f of walkJs(path.join(ROOT, 'src'))) {
      const src = read(f);
      assert.doesNotMatch(src, /writeFileSync\s*\(/, `${f} must not write files`);
      assert.doesNotMatch(src, /readFileSync\([^)]*\.json/, `${f} must not read JSON state`);
    }
  });

  it('renderer stays display-only (no Node, no SQL, no storage)', () => {
    const app = read('src', 'frontend', 'app.js');
    assert.doesNotMatch(app, /require\(/, 'renderer must not import modules');
    assert.doesNotMatch(app, /\bnode:/, 'renderer must not use Node built-ins');
    assert.doesNotMatch(app, /sqlite/i, 'renderer must not touch SQL');
    assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB/, 'renderer must not persist state');
  });

  it('electron is imported only by the desktop infrastructure', () => {
    const users = walkJs(path.join(ROOT, 'src')).filter((f) => read(f).includes("require('electron')"));
    assert.deepEqual(users.sort(), [
      'src/infrastructure/electron/main.js',
      'src/infrastructure/electron/preload.js',
    ]);
  });

  it('IPC routes only into application commands and queries', () => {
    const main = read('src', 'infrastructure', 'electron', 'main.js');
    const start = main.indexOf('const routes = {');
    assert.ok(start > -1, 'routes registry must exist');
    const block = main.slice(start, main.indexOf('\n  };', start));
    const entries = block.split('\n').filter((l) => /^\s*'[^']+':/.test(l));
    assert.ok(entries.length >= 100, `expected the full route table, got ${entries.length}`);
    for (const line of entries) {
      assert.match(line, /appApi\.(commands|queries)\./, `route bypasses the application layer: ${line.trim()}`);
    }
    // Nothing may import import/export tooling.
    assert.doesNotMatch(main, /application\/import|application\/export/);
  });

  it('migration tooling is never wired into the runtime', () => {
    const api = read('src', 'application', 'api.js');
    assert.doesNotMatch(api, /require\('\.\/import'\)|require\('\.\/export'\)/);
    const preload = read('src', 'infrastructure', 'electron', 'preload.js');
    assert.doesNotMatch(preload, /'(import|export):/, 'no import/export IPC channels');
    assert.doesNotMatch(preload, /importSource|exportSnapshot|runSourceImport/);
  });

  it('stock has exactly one authority: the movement ledger', () => {
    const { makeTestApp, closeTestApp } = require('./helpers');
    const t = makeTestApp();
    try {
      const cols = t.app.db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
      for (const col of ['stock', 'qty', 'quantity', 'on_hand', 'stock_qty']) {
        assert.ok(!cols.includes(col), `products.${col} would be a second stock authority`);
      }
      const p = t.app.commands.createProduct({ sku: 'ARCH-1', name: 'Authority probe' });
      assert.equal(t.app.queries.getStock(p.id, 1), 0);
      t.app.commands.receiveStock({ lines: [{ productId: p.id, qty: 7 }] });
      const row = t.app.queries.listStock('MAIN').rows.find((r) => r.sku === 'ARCH-1');
      assert.equal(row.stock, 7, 'stock must be derived, not stored');
      const movements = t.app.db.prepare(
        'SELECT COALESCE(SUM(qty),0) AS s FROM stock_movements WHERE product_id = ?'
      ).get(p.id).s;
      assert.equal(row.stock, movements, 'stock must equal SUM(movements)');
    } finally {
      closeTestApp(t);
    }
  });
});
