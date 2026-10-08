'use strict';
// CLI: node scripts/seed.js [--db <path>]
// Dev/test seed ONLY. Never touches the legacy db/database.sqlite.
// Creates MAIN warehouse + a tiny demo catalog. Idempotent by SKU.
const { resolveDbPath } = require('../src/config');
const { createApp } = require('../src/application/api');

const DEMO = [
  { sku: 'DEMO-SUGAR-1KG', name: 'سكر 1كغ (تجريبي)', defaultUnitCost: 120 },
  { sku: 'DEMO-FLOUR-1KG', name: 'فارينا 1كغ (تجريبي)', defaultUnitCost: 95 },
  { sku: 'DEMO-OIL-1L', name: 'زيت 1ل (تجريبي)', defaultUnitCost: 310 },
];

function main() {
  const idx = process.argv.indexOf('--db');
  const dbPath = idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : resolveDbPath();
  const app = createApp(dbPath, { migrateOnStart: true, dbPathForBackup: dbPath });
  try {
    app.commands.ensureMainWarehouse('seed');
    for (const p of DEMO) {
      try {
        app.commands.createProduct(p, 'seed');
        console.log(`seeded ${p.sku}`);
      } catch (e) {
        if (e && e.code === 'CONFLICT') console.log(`exists ${p.sku}`);
        else throw e;
      }
    }
    console.log(`seed done: ${dbPath}`);
  } finally {
    app.close();
  }
}

if (require.main === module) main();
module.exports = { main };
