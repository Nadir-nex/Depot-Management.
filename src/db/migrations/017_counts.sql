-- 017_counts.sql — Phase 18: formal inventory counts, not quantity editing.
--
-- inventory_counts: draft → submitted → approved → posted (cancelled from
-- draft/submitted/approved). Counting NEVER moves stock: expected quantities
-- freeze per line at SUBMIT time, variances need reasons at APPROVE time,
-- and only POSTING writes adjustment movements (one per non-zero variance).
-- Zero-variance lines post nothing. Posted counts reverse through ordinary
-- movement reversals on their adjustments — no special path, no edits.
-- Table CHECKs close each column list.

CREATE TABLE inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_no TEXT NOT NULL UNIQUE CHECK (length(count_no) >= 1 AND length(count_no) <= 32),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'approved', 'posted', 'cancelled'
  )),
  notes TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  approved_at TEXT,
  posted_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One line per (product, lot-or-untracked-pool): NULL-safe uniqueness via two
-- partial indexes (same portable pattern as price lines and barcodes).
CREATE TABLE inventory_count_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id INTEGER NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id INTEGER REFERENCES lots(id) ON DELETE RESTRICT,
  counted_qty INTEGER NOT NULL CHECK (counted_qty >= 0),
  expected_qty INTEGER NOT NULL DEFAULT 0,
  reason_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_count_lines_count ON inventory_count_lines(count_id);
CREATE UNIQUE INDEX idx_count_line_pool
  ON inventory_count_lines(count_id, product_id) WHERE lot_id IS NULL;
CREATE UNIQUE INDEX idx_count_line_lot
  ON inventory_count_lines(count_id, product_id, lot_id) WHERE lot_id IS NOT NULL;
