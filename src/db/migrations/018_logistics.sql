-- 018_logistics.sql — Phase 19: distributor delivery domain.
--
-- drivers / fleet_vehicles: lightweight distributor master data, deliberately
-- NOT the HR module (P26 owns employment). The authoritative schema never
-- reuses source-prototype table names; the migration runner refuses any
-- database that carries a foreign/old schema.
-- routes: planned → loaded → out_for_delivery → delivered/partial/failed,
-- cancelled from planned/loaded. LOADED is administrative in v1 (goods commit
-- at delivery-note posting; the P20 loading/reservation model refines it).
-- Returned goods stay document-level (customer_return docs, P15): routes do
-- not carry a returned state by design.
-- route_stops: one customer visit each (party must hold the customer role);
-- delivery_doc_id links the posted/confirmed delivery_note being fulfilled
-- (NULL = visit without documents). One delivery per route enforced when set.
-- collected_amount is the CLAIM recorded at handover; settlement against
-- payments is P21. Table CHECKs close each column list.

CREATE TABLE drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 16),
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  phone TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE fleet_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 16),
  plate TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_no TEXT NOT NULL UNIQUE CHECK (length(route_no) >= 1 AND length(route_no) <= 32),
  route_date TEXT NOT NULL CHECK (route_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  driver_id INTEGER REFERENCES drivers(id) ON DELETE RESTRICT,
  vehicle_id INTEGER REFERENCES fleet_vehicles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned', 'loaded', 'out_for_delivery', 'delivered', 'partial', 'failed', 'cancelled'
  )),
  notes TEXT NOT NULL DEFAULT '',
  dispatched_at TEXT,
  completed_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_routes_date ON routes(route_date);

CREATE TABLE route_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_no INTEGER NOT NULL CHECK (stop_no > 0),
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  delivery_doc_id INTEGER REFERENCES documents(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'delivered', 'failed', 'cancelled'
  )),
  fail_reason TEXT NOT NULL DEFAULT '',
  collected_amount INTEGER NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
  proof_ref TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (route_id, stop_no)
);
CREATE INDEX idx_stops_route ON route_stops(route_id);
CREATE UNIQUE INDEX idx_stops_one_delivery
  ON route_stops(route_id, delivery_doc_id) WHERE delivery_doc_id IS NOT NULL;
