-- 008_stock_engine.sql — Phase 09: the stock movement ledger grows up.
--
-- 1. stock_movements is REBUILT (no child table references it, so DROP is
--    safe and no cascade can fire): the movement-type CHECK widens to the
--    full P09 set, and three columns arrive —
--      reason_code            why this movement exists (adjust/issue reasons;
--                             receipts carry their document context instead);
--      reverses_movement_id   reversal link (plain INTEGER on purpose: a
--                             self-FK would go stale across the table rename,
--                             and reversals are append-only, never deleted,
--                             so the application owns link integrity + tests);
--      unit_code              representation unit of the line (qty stays base
--                             pieces, always). Existing rows default to PCS.
-- 2. stock_transfers records each transfer as ONE auditable pair-source:
--    transfer_no is UNIQUE so a retried submission cannot double-post.
-- 3. products.allow_negative_stock is the EXPLICIT opt-out of the no-negative
--    rule (default forbidden). Table CHECK closes the column list (see 006).

CREATE TABLE stock_movements_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty != 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'purchase_receipt', 'purchase_receipt_reversal', 'adjustment',
    'issue', 'transfer_out', 'transfer_in', 'reversal'
  )),
  reason_code TEXT,
  reverses_movement_id INTEGER,
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id INTEGER NOT NULL DEFAULT 0,
  unit_cost INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit_code TEXT NOT NULL DEFAULT 'PCS',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO stock_movements_new
  (id, product_id, warehouse_id, qty, movement_type, reference_type,
   reference_id, unit_cost, notes, created_at)
  SELECT id, product_id, warehouse_id, qty, movement_type, reference_type,
   reference_id, unit_cost, notes, created_at FROM stock_movements;
DROP TABLE stock_movements;
ALTER TABLE stock_movements_new RENAME TO stock_movements;
CREATE INDEX idx_movements_product_warehouse ON stock_movements(product_id, warehouse_id);
CREATE INDEX idx_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_movements_reversal ON stock_movements(reverses_movement_id);

CREATE TABLE stock_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_no TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (from_warehouse_id != to_warehouse_id)
);
CREATE INDEX idx_transfers_product ON stock_transfers(product_id);

ALTER TABLE products ADD COLUMN allow_negative_stock INTEGER NOT NULL DEFAULT 0
  CHECK (allow_negative_stock IN (0, 1));
