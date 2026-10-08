'use strict';
// Test helper: temp file-backed app instances (WAL + file behavior like prod).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/application/api');

function makeTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-test-'));
  const dbPath = path.join(dir, 'test.sqlite');
  const app = createApp(dbPath, { migrateOnStart: true, dbPathForBackup: null });
  app.commands.ensureMainWarehouse('test/bootstrap');
  return { app, dbPath, dir };
}

function closeTestApp(t) {
  try { t.app.close(); } catch { /* ignore */ }
  try { fs.rmSync(t.dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

module.exports = { makeTestApp, closeTestApp };
