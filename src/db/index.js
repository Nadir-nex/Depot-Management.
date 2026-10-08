'use strict';
// SQLite connection + transaction + integrity helpers (node:sqlite, stdlib only).
// This module owns the driver. Repositories receive the open handle; they never
// open connections themselves, so a future PostgreSQL adapter only replaces
// this file + src/data/* without touching application/domain/frontend.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// Single timestamp choke point. Storage convention (vocabulary TIME):
// TEXT ISO-8601 UTC with millis. Repositories must call this instead of
// inventing their own date formatting.
function utcNowIso() {
  return new Date().toISOString();
}

function openDatabase(dbPath, { busyTimeoutMs = 5000 } = {}) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`PRAGMA busy_timeout = ${Math.max(0, Number(busyTimeoutMs) || 0)}`);
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
//
// RE-ENTRANT: services compose (sales conversions call engine commands that
// open their own transactions). A nested call uses a SAVEPOINT instead of a
// new transaction: inner failure rolls back to the savepoint only, while an
// outer failure still wipes everything. Atomicity is preserved at every level.
const txDepth = new WeakMap();

function withTransaction(db, fn) {
  const depth = txDepth.get(db) || 0;
  if (depth === 0) {
    db.exec('BEGIN IMMEDIATE');
    txDepth.set(db, 1);
    try {
      const out = fn();
      db.exec('COMMIT');
      txDepth.set(db, 0);
      return out;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      txDepth.set(db, 0);
      throw err;
    }
  }
  const sp = `p09_savepoint_${depth}`;
  db.exec(`SAVEPOINT ${sp}`);
  txDepth.set(db, depth + 1);
  try {
    const out = fn();
    db.exec(`RELEASE ${sp}`);
    txDepth.set(db, depth);
    return out;
  } catch (err) {
    try { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); } catch { /* ignore */ }
    txDepth.set(db, depth);
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

module.exports = { openDatabase, closeDatabase, withTransaction, integrityCheck, utcNowIso };
