-- 010_parties.sql — Phase 11: canonical party model (customers + suppliers).
--
-- parties: ONE identity record per real-world third party; capabilities come
-- from party_roles rows (a party may be both customer and supplier without
-- duplicating identity). There is deliberately NO balance column: balances
-- derive from posted events only (supplier payable from purchase receipts
-- now; customer receivables and payments arrive in P13/P16).
--
-- credit_limit is NULL (unlimited) or a non-negative minor-unit cap enforced
-- by the centralized checker; payment_terms_days is informational net terms.
-- customer_type_code feeds tariff scope matching (pricing scope keys are
-- plain strings until this phase owns parties — see 006); party.code itself
-- is the customer-scope key. Table CHECK closes the column list.

CREATE TABLE parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 32),
  display_name TEXT NOT NULL CHECK (length(display_name) >= 1 AND length(display_name) <= 200),
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  trade_register TEXT NOT NULL DEFAULT '',
  customer_type_code TEXT,
  credit_limit INTEGER CHECK (credit_limit IS NULL OR credit_limit >= 0),
  payment_terms_days INTEGER CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE party_roles (
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'supplier')),
  PRIMARY KEY (party_id, role)
);

CREATE TABLE party_phones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 32),
  phone TEXT NOT NULL CHECK (length(phone) >= 1 AND length(phone) <= 32),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_party_phones_party ON party_phones(party_id);

-- Supplier linkage on receipts: the name snapshot stays (history), the link
-- enables the event-derived payable balance. NULL = over-the-counter buy.
ALTER TABLE purchase_receipts ADD COLUMN supplier_party_id INTEGER REFERENCES parties(id) ON DELETE RESTRICT;
CREATE INDEX idx_receipts_supplier_party ON purchase_receipts(supplier_party_id);
