-- 021_import.sql — Phase 22: source import staging, traceability, report.
--
-- The source database (db/database.sqlite) is NEVER opened for writing and
-- NEVER migrated in place: the importer reads it read-only, stages RAW rows
-- here, then applies mapped writes to canonical tables inside one
-- transaction. source_links pins every imported record to its source row —
-- the idempotency key (re-runs converge) and the audit trail (every target
-- row traces back to (source system, table, rowid)). Records without a link
-- carry the documented deterministic key from domain/importMapping instead.
-- Table CHECKs close each column list.

CREATE TABLE import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL CHECK (length(source_path) >= 1 AND length(source_path) <= 1024),
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint) = 64),
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  report TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE import_stage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK (length(entity) >= 1 AND length(entity) <= 64),
  source_rowid INTEGER NOT NULL CHECK (source_rowid >= 0),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (batch_id, entity, source_rowid)
);
CREATE INDEX idx_import_stage_batch ON import_stage(batch_id);

CREATE TABLE source_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_system TEXT NOT NULL DEFAULT 'dolisoft-pro-12-3' CHECK (length(source_system) <= 64),
  source_table TEXT NOT NULL CHECK (length(source_table) >= 1 AND length(source_table) <= 64),
  source_rowid INTEGER NOT NULL CHECK (source_rowid >= 0),
  entity TEXT NOT NULL CHECK (length(entity) >= 1 AND length(entity) <= 64),
  entity_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_system, source_table, source_rowid, entity)
);
CREATE INDEX idx_source_links_entity ON source_links(entity, entity_id);
