#!/usr/bin/env node
'use strict';
// Source import CLI (Phase 22) — one-shot data migration. Dry-run by default: validates, classifies
// and reconciles, writes only an import_batches preview row. --apply stages
// raw rows, imports canonically (one transaction), links source ids and
// stores the report. The source database is opened read-only and NEVER
// written to; the report is printed and stored on the batch.
//
// Usage:
//   node scripts/import-source.js [--source=<path>] [--apply] [--json]
// Exit code: 0 clean, 1 when the report contains error rows.
const path = require('node:path');
const { createApp } = require('../src/application/api');
const { resolveDbPath } = require('../src/config');
const { readSourceDatabase } = require('../src/infrastructure/import/sourceReader');
const { runSourceImport } = require('../src/application/import');

const REPO_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = { apply: false, json: false, source: path.join(REPO_ROOT, 'db', 'database.sqlite') };
  for (const arg of argv) {
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--source=')) opts.source = path.resolve(arg.slice('--source='.length));
    else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

function printReport(report, asJson) {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const r = report.reconciliation;
  console.log(`\n=== source import report (${report.mode}) ===`);
  console.log(`source: ${report.source.path}`);
  console.log(`fingerprint: ${report.source.fingerprint}`);
  for (const [entity, a] of Object.entries(report.actions || {})) {
    console.log(`  ${entity}: create=${a.create} linked=${a.linked} adopt=${a.adopt} skip=${a.skip} error=${a.error}`);
  }
  console.log('reconciliation:');
  for (const [name, line] of Object.entries(r)) {
    const src = line.source === null || line.source === undefined ? 'n/a' : line.source;
    const tgt = line.target === null || line.target === undefined ? 'n/a' : line.target;
    console.log(`  ${name}: source=${src} target=${tgt} ${line.ok ? 'OK' : 'MISMATCH'}${line.deferred ? ' (deferred)' : ''}`);
  }
  if (report.deferred.length) {
    console.log('staged-only tables (documented):');
    for (const d of report.deferred) console.log(`  ${d.table} (${d.rows} rows): ${d.reason}`);
  }
  if (report.errors.length) {
    console.log(`errors (${report.errors.length}):`);
    for (const e of report.errors) console.log(`  ${e.table}:${e.sourceRowid} ${e.message}`);
  }
  console.log(`links: ${report.linksTotal} | batch: ${report.batchId}`);
}

const opts = parseArgs(process.argv.slice(2));
if (path.resolve(opts.source) === path.resolve(resolveDbPath())) {
  console.error('source and target are the same database — refusing');
  process.exit(2);
}
const app = createApp();
try {
  const source = readSourceDatabase(opts.source);
  const report = runSourceImport(app.db, source, { apply: opts.apply });
  printReport(report, opts.json);
  process.exitCode = report.errors.length ? 1 : 0;
} catch (err) {
  console.error(`import failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  app.close();
}
