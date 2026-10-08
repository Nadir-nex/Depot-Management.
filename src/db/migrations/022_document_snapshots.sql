-- 022_document_snapshots.sql — Phase 23: party/warehouse snapshots for historical printing
--
-- At posting time we freeze the party and warehouse details so printed
-- history never rewrites when live records are edited.

ALTER TABLE documents ADD COLUMN party_name TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN party_tax_id TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN party_address TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN party_email TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN party_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN warehouse_code TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN warehouse_name TEXT NOT NULL DEFAULT '';
