-- 005_catalog_units.sql — Phase 06: categories, units, packs, barcodes.
--
-- categories: family/subfamily in ONE table via parent_id (NULL = root).
-- Sibling-name uniqueness is application-enforced (NULL-aware; a UNIQUE index
-- cannot do it portably), as is the empty-only delete rule.
--
-- units: code registry only (PCS/BOX/KG bootstrapped). Conversions are NEVER
-- global: every pack declares its own qty_per_pack, converted by exact
-- integer math in src/domain/catalog.js. No silent fractions anywhere.
--
-- product_packs: one sellable presentation = (product, unit, qty_per_pack).
-- product_barcodes: EVERY scannable code lives here, attached to a product
-- and optionally to one of its packs, so resolution has a single lookup path.
-- Exactly one preferred barcode per product (partial unique index — supported
-- by SQLite and PostgreSQL alike).
--
-- Cutover: the v0.2 single products.barcode column is backfilled into
-- product_barcodes as preferred rows, then REMOVED via table rebuild
-- (SQLite cannot DROP a UNIQUE column directly). Child FKs survive because
-- every row keeps its id and FK enforcement is deferred to COMMIT, at which
-- point the final schema is fully consistent again. One barcode system
-- afterwards (P02: no competing systems). The backfill is a single
-- INSERT..SELECT of a new table, not a business-data transformation.

CREATE TABLE product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  parent_id INTEGER REFERENCES product_categories(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (parent_id IS NULL OR parent_id != id)
);
CREATE INDEX idx_product_categories_parent ON product_categories(parent_id);

CREATE TABLE units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 16),
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO units (code, name) VALUES ('PCS', 'Piece'), ('BOX', 'Box'), ('KG', 'Kilogram');

ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES product_categories(id) ON DELETE RESTRICT;
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE product_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  qty_per_pack INTEGER NOT NULL CHECK (qty_per_pack > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, name)
);
CREATE INDEX idx_packs_product ON product_packs(product_id);

CREATE TABLE product_barcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pack_id INTEGER REFERENCES product_packs(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 64),
  is_preferred INTEGER NOT NULL DEFAULT 0 CHECK (is_preferred IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_barcodes_product ON product_barcodes(product_id);
CREATE UNIQUE INDEX idx_barcodes_one_preferred ON product_barcodes(product_id) WHERE is_preferred = 1;

-- Cutover in three steps. WHY staged: DROP TABLE fires ON DELETE CASCADE
-- immediately (deferred FKs defer checks, not cascade actions), so a backfill
-- written before the rebuild would be cascade-deleted by the rebuild itself.
-- Staging in a TEMP table (no FKs) keeps the codes safe across the DROP.
CREATE TEMP TABLE _p05_barcode_backfill AS
  SELECT id AS product_id, barcode AS code FROM products
  WHERE barcode IS NOT NULL AND barcode != '';

-- Remove the pre-005 barcode column by rebuild (ids preserved, FK checks deferred to
-- COMMIT, at which point the final schema is fully consistent again).
PRAGMA defer_foreign_keys = ON;
CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES product_categories(id) ON DELETE RESTRICT,
  product_type TEXT NOT NULL DEFAULT 'goods' CHECK (product_type IN ('goods', 'service')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  default_unit_cost INTEGER NOT NULL DEFAULT 0 CHECK (default_unit_cost >= 0),
  default_sale_price INTEGER NOT NULL DEFAULT 0 CHECK (default_sale_price >= 0),
  tax_class TEXT NOT NULL DEFAULT 'standard' CHECK (tax_class IN ('standard', 'exempt')),
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO products_new
  (id, sku, name, category_id, product_type, is_active, default_unit_cost,
   default_sale_price, tax_class, min_stock, notes, created_at, updated_at)
  SELECT id, sku, name, category_id, product_type, is_active, default_unit_cost,
   default_sale_price, tax_class, min_stock, notes, created_at, updated_at FROM products;
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category_id);
PRAGMA defer_foreign_keys = OFF;

-- Now populate the single barcode system from the staged codes.
INSERT INTO product_barcodes (product_id, pack_id, code, is_preferred)
  SELECT product_id, NULL, code, 1 FROM _p05_barcode_backfill;
DROP TABLE _p05_barcode_backfill;
