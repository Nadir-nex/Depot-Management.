'use strict';
// Import staging + traceability repositories (Phase 22). Raw rows land in
// import_stage before any canonical write; source_links is the idempotency
// and audit key (system, table, rowid) → target row. Link sums for the
// migration report derive live from these rows.
const { ConflictError, NotFoundError } = require('../domain/errors');
const { SOURCE_SYSTEM } = require('../domain/importMapping');
const { utcNowIso } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function createImportRepository(db) {
  return {
    insertBatch({ sourcePath, sourceFingerprint, mode }) {
      const now = utcNowIso();
      const info = db.prepare(
        `INSERT INTO import_batches (source_path, source_fingerprint, mode, status, started_at, created_at, updated_at)
         VALUES (?, ?, ?, 'running', ?, ?, ?)`
      ).run(sourcePath, sourceFingerprint, mode, now, now, now);
      return this.getBatch(Number(info.lastInsertRowid));
    },
    getBatch(id) {
      const r = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`import batch ${id} not found`);
      return r;
    },
    finishBatch(id, { status, report }) {
      const now = utcNowIso();
      db.prepare(
        "UPDATE import_batches SET status = ?, report = ?, finished_at = ?, updated_at = ? WHERE id = ? AND status = 'running'"
      ).run(status, report, now, now, id);
      return this.getBatch(id);
    },
    stage(batchId, entity, sourceRowid, payload) {
      db.prepare(
        `INSERT INTO import_stage (batch_id, entity, source_rowid, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(batchId, entity, sourceRowid, payload, utcNowIso());
    },
    countStage(batchId) {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM import_stage WHERE batch_id = ?').get(batchId).n);
    },
    // Keyed map: `${entity}|${table}|${rowid}` → { id, entity_id }.
    allLinks() {
      const map = new Map();
      for (const r of db.prepare('SELECT * FROM source_links ORDER BY id').all()) {
        map.set(`${r.entity}|${r.source_table}|${r.source_rowid}`, r);
      }
      return map;
    },
    insertLink({ sourceTable, sourceRowid, entity, entityId, batchId }) {
      try {
        const info = db.prepare(
          `INSERT INTO source_links (source_system, source_table, source_rowid, entity, entity_id, batch_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(SOURCE_SYSTEM, sourceTable, sourceRowid, entity, entityId, batchId, utcNowIso());
        return Number(info.lastInsertRowid);
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError(`source link ${sourceTable}:${sourceRowid} already exists (duplicate submission?)`);
        throw err;
      }
    },
    countLinks(entity) {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM source_links WHERE source_system = ? AND entity = ?').get(SOURCE_SYSTEM, entity).n);
    },
    totalLinks() {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM source_links WHERE source_system = ?').get(SOURCE_SYSTEM).n);
    },
    // Opening stock that actually landed: quantities on receipts linked from
    // source shipments (receipts are one per shipment row).
    importedReceiptQty() {
      return Number(db.prepare(
        `SELECT COALESCE(SUM(rl.qty), 0) AS n
           FROM source_links sl
           JOIN purchase_receipt_lines rl ON rl.receipt_id = sl.entity_id
          WHERE sl.source_system = ? AND sl.entity = 'receipt'`
      ).get(SOURCE_SYSTEM).n);
    },
    importedReceiptCount() {
      return Number(db.prepare(
        "SELECT COUNT(*) AS n FROM source_links WHERE source_system = ? AND entity = 'receipt'"
      ).get(SOURCE_SYSTEM).n);
    },
  };
}

module.exports = { createImportRepository };
