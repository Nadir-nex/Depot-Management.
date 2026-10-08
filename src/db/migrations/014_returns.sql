-- 014_returns.sql — Phase 15: return movement types join the ledger.
--
-- Rebuilds stock_movements (same 008 pattern: no child table references it)
-- to widen the movement-type CHECK with sales_return (customer goods come
-- back IN) and purchase_return (goods go back OUT to the supplier). All
-- P10 columns (lot_id, reason_code, reverses_movement_id, unit_code) carry
-- over with identical definitions; every row keeps its id so existing
-- reverses_movement_id links survive untouched.

CREATE TABLE stock_movements_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty != 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'purchase_receipt', 'purchase_receipt_reversal', 'adjustment',
    'issue', 'transfer_out', 'transfer_in', 'reversal',
    'sales_return', 'purchase_return'
  )),
  reason_code TEXT,
  reverses_movement_id INTEGER,
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id INTEGER NOT NULL DEFAULT 0,
  unit_cost INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit_code TEXT NOT NULL DEFAULT 'PCS',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  lot_id INTEGER REFERENCES lots(id) ON DELETE RESTRICT
);
INSERT INTO stock_movements_new
  (id, product_id, warehouse_id, qty, movement_type, reason_code,
   reverses_movement_id, reference_type, reference_id, unit_cost, unit_code,
   notes, created_at, lot_id)
  SELECT id, product_id, warehouse_id, qty, movement_type, reason_code,
   reverses_movement_id, reference_type, reference_id, unit_cost, unit_code,
   notes, created_at, lot_id FROM stock_movements;
DROP TABLE stock_movements;
ALTER TABLE stock_movements_new RENAME TO stock_movements;
CREATE INDEX idx_movements_product_warehouse ON stock_movements(product_id, warehouse_id);
CREATE INDEX idx_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_movements_reversal ON stock_movements(reverses_movement_id);
CREATE INDEX idx_movements_lot ON stock_movements(lot_id);
