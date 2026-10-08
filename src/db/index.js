'use strict';
// SQLite connection + transaction + integrity helpers (node:sqlite, stdlib only).
// This module owns the driver. Repositories receive the open handle; they never
// open connections themselves, so a future PostgreSQL adapter only replaces
// this file + src/data/* without touching application/domain/frontend.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (dbPath !== ':memory:') {
    try { db.exec("PRAGMA journal_mode = WAL"); } catch { /* keep default journal mode */ }
  }
  const fk = db.prepare('PRAGMA foreign_keys').get();
  if (!fk || fk.foreign_keys !== 1) throw new Error('foreign keys could not be enabled');
  return db;
}

function closeDatabase(db) {
  if (db) db.close();
}

// Runs fn() inside BEGIN IMMEDIATE … COMMIT. Any throw rolls back and rethrows,
// so multi-record business operations never leave partial state.
function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

function integrityCheck(db) {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
  return {
    ok: integrity && integrity.integrity_check === 'ok' && fkViolations.length === 0,
    integrity: integrity ? integrity.integrity_check : null,
    fkViolations,
  };
}

module.exports = { openDatabase, closeDatabase, withTransaction, integrityCheck };
