-- 020_route_settlements.sql — Phase 21: delivery collections & settlement.
--
-- route_stops.collected_amount is the CLAIM (cash in the driver's hand).
-- A settlement row materializes that claim the moment the stop delivers;
-- the money itself moves only through the payments ledger (Phase 16).
-- Settlement derives entirely from links to POSTED payments: cancelling a
-- payment re-opens its claim with zero extra logic (derived, never stored).
-- One row per claimed stop; route_id denormalized for reconciliation.
-- Table CHECKs close each column list.

CREATE TABLE route_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stop_id INTEGER NOT NULL UNIQUE REFERENCES route_stops(id) ON DELETE CASCADE,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_settlements_route ON route_settlements(route_id);

CREATE TABLE route_settlement_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL REFERENCES route_settlements(id) ON DELETE CASCADE,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (settlement_id, payment_id)
);
CREATE INDEX idx_settlement_alloc_payment ON route_settlement_allocations(payment_id);

-- Backfill: stops already delivered with a claim become open settlements.
INSERT INTO route_settlements (stop_id, route_id, amount, created_at, updated_at)
  SELECT id, route_id, collected_amount,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM route_stops
   WHERE status = 'delivered' AND collected_amount > 0;
