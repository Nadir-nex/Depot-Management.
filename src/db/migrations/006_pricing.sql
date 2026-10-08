-- 006_pricing.sql — Phase 07: named tariffs with scoped lines.
--
-- price_lists: one tariff = (code, scope, validity, priority).
-- scope_type/scope_key are PLAIN codes, not FKs: customers and customer types
-- do not exist yet (P11 owns parties). P11 will optionally harden these into
-- references without changing the resolver contract. scope_key is NULL for
-- 'general' lists and REQUIRED otherwise (enforced by CHECK).
-- Validity is an optional inclusive date range (YYYY-MM-DD); the resolver
-- ignores inactive or out-of-range lists. priority breaks ties between lists
-- of EQUAL specificity (higher wins); remaining ties go to the lowest id, so
-- resolution is always deterministic.
--
-- price_list_lines: one price per (list, product, pack-or-base). The two
-- partial unique indexes give NULL-safe uniqueness per representation
-- (portable to PostgreSQL). unit_price is ALWAYS per base piece for
-- product lines; for pack lines it is per PACK (pack.qty_per_pack recorded
-- alongside by consumers). Money is integer minor units throughout.

CREATE TABLE price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 32),
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  scope_type TEXT NOT NULL DEFAULT 'general'
    CHECK (scope_type IN ('general', 'customer_type', 'customer')),
  scope_key TEXT CHECK (
    (scope_type = 'general' AND scope_key IS NULL) OR
    (scope_type != 'general' AND scope_key IS NOT NULL AND length(scope_key) >= 1 AND length(scope_key) <= 64)
  ),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0 AND priority <= 1000),
  valid_from TEXT CHECK (valid_from IS NULL OR valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valid_to TEXT CHECK (valid_to IS NULL OR valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
);

CREATE TABLE price_list_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  pack_id INTEGER REFERENCES product_packs(id) ON DELETE CASCADE,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_price_lines_list ON price_list_lines(price_list_id);
CREATE INDEX idx_price_lines_product ON price_list_lines(product_id);
CREATE UNIQUE INDEX idx_price_line_base
  ON price_list_lines(price_list_id, product_id) WHERE pack_id IS NULL;
CREATE UNIQUE INDEX idx_price_line_pack
  ON price_list_lines(price_list_id, product_id, pack_id) WHERE pack_id IS NOT NULL;
