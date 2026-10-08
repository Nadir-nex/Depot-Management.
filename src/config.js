'use strict';
// Central configuration. Only this module (plus db/infrastructure entry points)
// resolves filesystem paths. Domain and application layers never touch paths:
// they receive an open db handle (or repository) as a parameter so the same
// business code works when the database lives on another machine.
const path = require('node:path');

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function resolveDbPath(env = process.env) {
  if (env.DEPOT_DB_PATH && env.DEPOT_DB_PATH.trim() !== '') return env.DEPOT_DB_PATH;
  return path.join(repoRoot(), 'data', 'app.sqlite');
}

module.exports = { resolveDbPath };
