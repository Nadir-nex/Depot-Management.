-- 009_lots.sql — Phase 10: lots, expiry and serials, integrated in the ledger.
--
-- lots: one batch = (product, lot_no). Lot numbers scope per product because
-- supplier batch codes repeat across products. Expiry is an optional
-- inclusive YYYY-MM-DD date; NULL never expires. Policy (vocabulary
-- EXPIRY_POLICY, enforced in the application layer): expired lots block
-- commercial outflows (issue, transfer-out) but accept inflows and
-- write-off adjustments, so destruction stays representable.
--
-- stock_movements.lot_id attaches every LANDED quantity to its lot (NULL =
-- untracked pool, including all pre-P10 history). No CHECK changes, so no
-- rebuild: plain ADD COLUMN with an index.
--
-- serial_numbers: individually tracked units. (product_id, code) is UNIQUE so
-- a serial can never be double-registered; status gates double-selling
-- (in_stock → out exactly once, restored only by reversal). current
-- warehouse rides along so transfers stay representable. in/out movement
-- links give the full per-serial paper trail.
--
-- products.serial_tracking opts a product into mandatory serial
-- identification on receipts and issues. Table CHECK closes each column list.

CREATE TABLE lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_no TEXT NOT NULL CHECK (length(lot_no) >= 1 AND length(lot_no) <= 64),
  supplier_ref TEXT NOT NULL DEFAULT '',
  manufactured_date TEXT CHECK (manufactured_date IS NULL OR manufactured_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  expiry_date TEXT CHECK (expiry_date IS NULL OR expiry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, lot_no)
);
CREATE INDEX idx_lots_product ON lots(product_id);
CREATE INDEX idx_lots_expiry ON lots(expiry_date);

ALTER TABLE stock_movements ADD COLUMN lot_id INTEGER REFERENCES lots(id) ON DELETE RESTRICT;
CREATE INDEX idx_movements_lot ON stock_movements(lot_id);

-- Receipt lines record their lot so cancellations mirror the exact pools.
ALTER TABLE purchase_receipt_lines ADD COLUMN lot_id INTEGER REFERENCES lots(id) ON DELETE RESTRICT;

CREATE TABLE serial_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id INTEGER REFERENCES lots(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (length(code) >= 1 AND length(code) <= 64),
  status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'out')),
  warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
  in_movement_id INTEGER,
  out_movement_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, code)
);
CREATE INDEX idx_serials_product_status ON serial_numbers(product_id, status);
CREATE INDEX idx_serials_lot ON serial_numbers(lot_id);

ALTER TABLE products ADD COLUMN serial_tracking INTEGER NOT NULL DEFAULT 0
  CHECK (serial_tracking IN (0, 1));
