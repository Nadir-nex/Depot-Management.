-- 003_audit_fields.sql — Phase 04: audit events carry business-level context.
-- before_summary / after_summary: short state sketches (e.g. active=1→0), never
-- snapshots. reason: mandatory for cancellations/corrections. reference_no:
-- human document number (e.g. receipt_no) for traceability without joins.
-- Portable ALTER TABLE ... ADD COLUMN only; backfills nothing (defaults apply).

ALTER TABLE audit_log ADD COLUMN before_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN after_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN reason TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN reference_no TEXT NOT NULL DEFAULT '';
