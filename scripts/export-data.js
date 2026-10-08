#!/usr/bin/env node
'use strict';
// Canonical data export CLI (Phase 22). Writes a portable JSON snapshot of
// the business data to data/export-<timestamp>.json and prints the counts.
//
// Usage: node scripts/export-data.js [--out=<path>] [--json]
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../src/application/api');
const { exportSnapshot } = require('../src/application/export');

const REPO_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
let out = null;
let asJson = false;
for (const arg of args) {
  if (arg === '--json') asJson = true;
  else if (arg.startsWith('--out=')) out = path.resolve(arg.slice('--out='.length));
  else {
    console.error(`unknown argument: ${arg}`);
    process.exit(2);
  }
}

const app = createApp();
try {
  const snapshot = exportSnapshot(app.db);
  if (!out) {
    const stamp = snapshot.generatedAt.replace(/[:.]/g, '-');
    out = path.join(REPO_ROOT, 'data', `export-${stamp}.json`);
  }
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
  if (asJson) console.log(JSON.stringify({ path: out, counts: snapshot.counts }));
  else console.log(`exported ${JSON.stringify(snapshot.counts)} → ${out}`);
} catch (err) {
  console.error(`export failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  app.close();
}
