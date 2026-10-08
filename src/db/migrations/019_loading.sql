-- 019_loading.sql — Phase 20: truck loading as reservations (Model B).
--
-- DECISION (recorded, per plan instruction to choose ONE model): the warehouse
-- ledger stays the single source of truth; loading records CLAIMS, not stock.
-- Model A (truck as stock location) was rejected because delivery-note
-- posting already moves stock exactly once (P13 invariant) — a second move
-- at loading would double-decrement. Reservations instead protect committed
-- documents from over-commitment by later routes:
--   available(pool) = pool stock − claims of OTHER routes.
-- Loading verifies coverage then consumes the route's own claims; completion
-- and cancellation release leftovers, so failed stops automatically restore
-- availability with zero movements. Physical returns of delivered goods stay
-- customer_return documents (P15). No stock table is written by this phase.
--
-- A reservation row existing IS the claim (no status); deletion IS release.

CREATE TABLE stock_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  lot_id INTEGER REFERENCES lots(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_reservations_route ON stock_reservations(route_id);
CREATE INDEX idx_reservations_pool ON stock_reservations(product_id, warehouse_id, lot_id);
