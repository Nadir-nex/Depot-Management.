'use strict';
// Migration source reader (Phase 22). Infrastructure-only, one-shot input
// tooling: never loaded by the application runtime. This module alone knows
// the source prototype's schema; the database is opened READ-ONLY (sqlite
// `readOnly`) and fingerprinted before every read, so the original data is
// never mutated and every report is pinned to an exact source state.
// Missing tables count as 0 (the source schema drifted).
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Every table the source prototype shipped with (0-row tables included so
// the inventory and reconciliation stay stable across source versions).
const SOURCE_TABLES = Object.freeze([
  'categories', 'companies', 'customer_phones', 'customer_types', 'customers',
  'deliveries', 'delivery_orders', 'delivery_stops', 'districts',
  'employee_phones', 'employee_roles', 'employees', 'items', 'order_items',
  'orders', 'product_costs', 'product_price_history', 'product_prices',
  'shipments', 'vehicles',
]);

function readSourceDatabase(filePath) {
  const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  // Opening a WAL-mode DB creates -wal/-shm sidecars; remember which ones
  // already existed so the run can leave the source directory untouched.
  const preexisting = new Set(['-wal', '-shm']
    .map((s) => `${filePath}${s}`)
    .filter((p) => fs.existsSync(p)));
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    const present = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map((r) => r.name);
    const inventory = {};
    const tables = {};
    const staged = present.length ? present : SOURCE_TABLES;
    for (const name of staged) {
      const rows = db.prepare(`SELECT rowid AS _rowid, * FROM "${name}"`).all();
      tables[name] = rows;
      inventory[name] = rows.length;
    }
    for (const name of SOURCE_TABLES) {
      if (!(name in inventory)) { tables[name] = []; inventory[name] = 0; }
    }
    return { path: filePath, fingerprint, inventory, tables, present };
  } finally {
    db.close();
    // Leave the source directory exactly as found: drop only the sidecars
    // this connection created (-shm is a pure index; -wal only if empty).
    for (const [suffix, guard] of [['-shm', null], ['-wal', 0]]) {
      const sidecar = `${filePath}${suffix}`;
      if (preexisting.has(sidecar)) continue;
      try {
        const st = fs.statSync(sidecar);
        if (guard === null || st.size === guard) fs.unlinkSync(sidecar);
      } catch { /* absent or already gone */ }
    }
  }
}

module.exports = { readSourceDatabase };
