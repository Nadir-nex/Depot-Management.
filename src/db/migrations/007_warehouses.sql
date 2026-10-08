-- 007_warehouses.sql — Phase 08: warehouses as first-class entities.
-- Adds the active flag; everything else (code identity, timestamps) already
-- exists from 001. Deliberately NOT added: bins/shelves (optional per plan,
-- deferred until a location granularity is actually required — likely with
-- lots in P10), transfer relationships (the transfer ENGINE is P09; this
-- phase only makes the endpoints addressable). Portable ADD COLUMN only.

ALTER TABLE warehouses ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1
  CHECK (is_active IN (0, 1));
