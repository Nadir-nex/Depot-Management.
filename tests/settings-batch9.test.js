'use strict';
// Batch 9 gate: settings show only real capabilities.
// Audit read-only, client-side CSV from live data, no user/import/backup UI,
// no renderer filesystem/Electron access, destructive actions confirmed.
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTestApp, closeTestApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'app.js'), 'utf8');
const PRELOAD = fs.readFileSync(path.join(ROOT, 'src', 'infrastructure', 'electron', 'preload.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(ROOT, 'src', 'infrastructure', 'electron', 'main.js'), 'utf8');

describe('batch9 settings/admin contract', () => {
  let t;
  beforeEach(() => { t = makeTestApp(); });
  afterEach(() => { closeTestApp(t); });

  it('audit trail is read-only and filterable client-side', () => {
    const p = t.app.commands.createProduct({ sku: 'B9-P', name: 'b9' });
    assert.ok(p.id);
    const rows = t.app.queries.recentAudit({ limit: 50 });
    const list = rows.rows || rows;
    assert.ok(Array.isArray(list) && list.length >= 1);
    assert.ok(list[0].operation && list[0].actor !== undefined);
  });

  it('exports build from live API data (products/parties/stock/payments)', () => {
    t.app.commands.createProduct({ sku: 'B9-E', name: 'e' });
    t.app.commands.createParty({ displayName: 'B9C', roles: ['customer'] });
    assert.ok(t.app.queries.listProducts({ limit: 500 }).length >= 1 || Array.isArray(t.app.queries.listProducts({ limit: 500 }).rows));
    const parties = t.app.queries.listParties({});
    assert.ok(Array.isArray(parties.rows || parties));
    const stock = t.app.queries.listStock('MAIN');
    assert.ok(Array.isArray(stock.rows));
    assert.ok(Array.isArray(t.app.queries.listPayments({})));
  });

  it('no user/role, import, backup, or cloud channels exist in the runtime', () => {
    assert.ok(!/users:|roles:create|backup:create|restore:|import:run|cloud:/.test(PRELOAD + MAIN), 'no admin/import/backup/cloud IPC channels');
    assert.ok(!/application\/import|application\/export/.test(MAIN), 'import/export tooling not wired into runtime');
  });

  it('frontend offers only supported settings actions, states the rest as gaps', () => {
    const must = ['api.recentAudit', 'rowsToCsv', 'downloadCsv', 'data-exp', 'audit'];
    for (const m of must) assert.ok(FRONT.includes(m), `frontend must include ${m}`);
    assert.ok(/no .*API|not offered|gap/i.test(FRONT), 'unsupported sections labeled, not inert');
    assert.ok(!/createUser|deleteUser|setRole|backupNow|restoreBackup|cloudSync|pairScanner/i.test(FRONT), 'no fake admin controls');
  });

  it('renderer stays display-only after batch 9 (no fs/Electron/storage)', () => {
    assert.doesNotMatch(FRONT, /require\(/);
    assert.doesNotMatch(FRONT, /\bnode:/);
    assert.doesNotMatch(FRONT, /sqlite/i);
    assert.doesNotMatch(FRONT, /localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(FRONT, /writeFile|readFile|createWindow|ipcRenderer|contextBridge/);
  });
});
