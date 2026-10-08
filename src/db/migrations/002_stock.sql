-- 002_stock.sql — purchase receipts + explicit stock ledger + audit log.
-- Stock invariant: stock(product, warehouse) = SUM(stock_movements.qty).
-- Nothing writes quantities anywhere else. Cancellations insert compensating
-- reversal movements; posted rows are never updated in place (except the
-- receipt status flip posted -> cancelled, which the reversal explains).

CREATE TABLE purchase_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
  posted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE purchase_receipt_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_cost INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);
CREATE INDEX idx_receipt_lines_receipt ON purchase_receipt_lines(receipt_id);
CREATE INDEX idx_receipt_lines_product ON purchase_receipt_lines(product_id);

CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty != 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'purchase_receipt', 'purchase_receipt_reversal', 'adjustment'
  )),
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id INTEGER NOT NULL DEFAULT 0,
  unit_cost INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_movements_product_warehouse ON stock_movements(product_id, warehouse_id);
CREATE INDEX idx_movements_reference ON stock_movements(reference_type, reference_id);

-- Append-only audit trail. `details` is a short human/JSON summary, never a
-- shadow copy of business state (the SQL tables stay authoritative).
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor TEXT NOT NULL DEFAULT 'system',
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_operation ON audit_log(operation);
