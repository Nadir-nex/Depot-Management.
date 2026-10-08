'use strict';
// Numbered migration runner. A fresh database is built by applying every
// migrations/*.sql file in filename order from an empty state; each file runs
// atomically and records its version in schema_migrations. A failed migration
// rolls back that file and records nothing, so re-running is safe.
// Portable-SQL policy: migrations use standard CREATE TABLE / FK / CHECK /
// UNIQUE / INDEX only. Journal mode, WAL, pragmas live in src/db/index.js.
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

function ensureVersionTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
}

function appliedVersions(db) {
  ensureVersionTable(db);
  return new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
}

function nowIso() {
  return new Date().toISOString();
}

// Copies dbPath to dbPath.pre-migrate-<ts>.bak before applying anything.
// Skipped for :memory: databases. Returns backup path or null.
function backupBeforeMigrate(dbPath) {
  if (!dbPath || dbPath === ':memory:') return null;
  if (!fs.existsSync(dbPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.pre-migrate-${stamp}.bak`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function applyMigrationFile(db, version, sql) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, nowIso());
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    err.message = `migration ${version} failed: ${err.message}`;
    throw err;
  }
}

function migrate(db, { dbPath = null, backup = true } = {}) {
  const applied = appliedVersions(db);
  const files = listMigrationFiles();
  const pending = files.filter((f) => !applied.has(f));
  let backupPath = null;
  // Back up only when upgrading a database that already has migrations applied.
  // A fresh build from empty state has no data to protect, so no backup is made.
  if (pending.length > 0 && applied.size > 0 && backup) backupPath = backupBeforeMigrate(dbPath);
  const ran = [];
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    applyMigrationFile(db, file, sql);
    ran.push(file);
  }
  return { ran, backupPath, upToDate: ran.length === 0 };
}

module.exports = { MIGRATIONS_DIR, listMigrationFiles, appliedVersions, migrate, backupBeforeMigrate };
