'use strict';
// CLI: node scripts/migrate.js [--db <path>]
// Builds/migrates the database from empty state. Safe to re-run.
const { resolveDbPath } = require('../src/config');
const { openDatabase, closeDatabase } = require('../src/db');
const { migrate } = require('../src/db/migrate');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--db' && argv[i + 1]) { out.db = argv[++i]; }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db || resolveDbPath();
  const db = openDatabase(dbPath);
  try {
    const out = migrate(db, { dbPath, backup: true });
    if (out.upToDate) {
      console.log(`up to date: ${dbPath}`);
    } else {
      console.log(`migrated ${dbPath}: ${out.ran.join(', ')}${out.backupPath ? ` (backup: ${out.backupPath})` : ''}`);
    }
  } finally {
    closeDatabase(db);
  }
}

if (require.main === module) main();
module.exports = { main };
