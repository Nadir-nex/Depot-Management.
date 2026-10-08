-- 001_core.sql — catalog + locations. Schema only, no business data.
-- Timestamps: TEXT ISO-8601 UTC. Money: integer minor units (centimes).
-- IDs are INTEGER AUTOINCREMENT in this SQLite adapter; business uniqueness
-- comes from UNIQUE keys (sku, barcode, code) which survive a future move to
-- server-generated IDs without touching domain logic.

CREATE TABLE warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  default_unit_cost INTEGER NOT NULL DEFAULT 0 CHECK (default_unit_cost >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_products_name ON products(name);
