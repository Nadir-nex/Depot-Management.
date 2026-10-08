'use strict';
// Numbered migration runner. A fresh database is built by applying every
// migrations/*.sql file in filename order from an empty state; each file runs
// atomically and records its version in schema_migrations. A failed migration
// rolls back that file and records nothing, so re-running is safe.
// ONE-SCHEMA INVARIANT: before anything runs, the target is checked against
// the authoritative schema (every table our migrations produce). A database
// carrying foreign/old-schema tables — e.g. a raw copy of the source
// prototype — is refused untouched, so a database can never carry a second
// schema beside the authoritative one.
// Portable-SQL policy: migrations use standard CREATE TABLE / FK / CHECK /
// UNIQUE / INDEX only. Journal mode, WAL, pragmas live in src/db/index.js.
const fs = require('node:fs');
const path = require('node:path');
const { utcNowIso, openDatabase } = require('./index');

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

// Copies dbPath to dbPath.pre-migrate-<ts>.bak before applying anything.
// Skipped for :memory: databases. Returns backup path or null.
function backupBeforeMigrate(dbPath) {
  if (!dbPath || dbPath === ':memory:') return null;
  if (!fs.existsSync(dbPath)) return null;
  const stamp = utcNowIso().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.pre-migrate-${stamp}.bak`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function applyMigrationFile(db, version, sql) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, utcNowIso());
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    err.message = `migration ${version} failed: ${err.message}`;
    throw err;
  }
}

function tableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all().map((r) => r.name);
}

// Authoritative table set = final state of every migration file, built once
// per migrations directory in a throwaway :memory: database. A directory
// whose migrations are themselves broken returns null (the real apply below
// reports that failure with full context; the schema guard simply stands
// down). Cached per directory — production directories never change
// within a process.
const referenceCache = new Map();
function authoritativeTables(migrationsDir) {
  if (referenceCache.has(migrationsDir)) return referenceCache.get(migrationsDir);
  let tables = null;
  try {
    const ref = openDatabase(':memory:');
    try {
      ensureVersionTable(ref);
      for (const file of listMigrationFiles(migrationsDir)) {
        applyMigrationFile(ref, file, fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
      }
      tables = new Set(tableNames(ref));
    } finally {
      ref.close();
    }
  } catch {
    tables = null;
  }
  referenceCache.set(migrationsDir, tables);
  return tables;
}

// Read-only refusal: throws before any write when the database contains a
// table our migrations never produced (foreign/old schema). Data in such a
// database is left byte-for-byte untouched.
function assertSingleSchema(db, migrationsDir) {
  const allowed = authoritativeTables(migrationsDir);
  if (!allowed) return;
  const foreign = tableNames(db).filter((t) => !allowed.has(t));
  if (foreign.length > 0) {
    const err = new Error(
      `database contains tables outside the current schema: ${foreign.join(', ')} — `
      + 'refusing to run (exactly one authoritative schema; this looks like a foreign/old-schema database)'
    );
    err.code = 'FOREIGN_SCHEMA';
    throw err;
  }
}

function migrate(db, { dbPath = null, backup = true, migrationsDir = MIGRATIONS_DIR } = {}) {
  assertSingleSchema(db, migrationsDir);
  const applied = appliedVersions(db);
  const files = listMigrationFiles(migrationsDir);
  const pending = files.filter((f) => !applied.has(f));
  let backupPath = null;
  // Back up only when upgrading a database that already has migrations applied.
  // A fresh build from empty state has no data to protect, so no backup is made.
  if (pending.length > 0 && applied.size > 0 && backup) backupPath = backupBeforeMigrate(dbPath);
  const ran = [];
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    applyMigrationFile(db, file, sql);
    ran.push(file);
  }
  return { ran, backupPath, upToDate: ran.length === 0 };
}

module.exports = { appliedVersions, migrate };
