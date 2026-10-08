'use strict';
// CLI: node scripts/integrity-check.js [--db <path>]
// Test-gate helper: PRAGMA integrity_check + foreign_key_check + stock summary.
// Exits non-zero when anything is inconsistent.
const { resolveDbPath } = require('../src/config');
const { openDatabase, closeDatabase, integrityCheck } = require('../src/db');

function main() {
  const idx = process.argv.indexOf('--db');
  const dbPath = idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : resolveDbPath();
  const db = openDatabase(dbPath);
  try {
    const check = integrityCheck(db);
    console.log(`integrity: ${check.integrity}`);
    console.log(`fk violations: ${check.fkViolations.length}`);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
    console.log(`tables: ${tables.join(', ')}`);
    try {
      const stock = db.prepare(
        `SELECT p.sku, COALESCE(SUM(m.qty),0) AS stock FROM products p
         LEFT JOIN stock_movements m ON m.product_id = p.id GROUP BY p.id ORDER BY p.sku LIMIT 20`
      ).all();
      console.log(`products: ${db.prepare('SELECT COUNT(*) AS n FROM products').get().n}, receipts: ${db.prepare('SELECT COUNT(*) AS n FROM purchase_receipts').get().n}`);
      for (const r of stock) console.log(`  ${r.sku}: ${r.stock}`);
    } catch (e) {
      console.log(`(stock summary unavailable: ${e.message})`);
    }
    if (!check.ok) {
      console.error('INTEGRITY FAILED', JSON.stringify(check.fkViolations.slice(0, 10)));
      process.exitCode = 1;
    }
  } finally {
    closeDatabase(db);
  }
}

if (require.main === module) main();
module.exports = { main };
