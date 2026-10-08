-- 016_expenses.sql — Phase 17: operational expenses (Charge/TypeCharge).
--
-- expense_categories: small reference registry, bootstrapped with the usual
-- distributor overheads. tax_class on the expense is CLASSIFICATION only
-- (P25 computes fiscal amounts), mirroring products and document lines.
-- Expenses NEVER touch stock: no ledger table references them, and a static
-- test pins that the service issues no stock SQL.
--
-- status is posted/cancelled with reversal-by-compensation (a cancelling cash
-- transaction for cash expenses), never DELETE — historical expenses stay
-- queryable. Cash legs ride cash_transactions (direction out, no payment),
-- so till reconciliation needs no special cases.

CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 16),
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO expense_categories (code, name) VALUES
  ('FUEL', 'Fuel'), ('WAGES', 'Wages'), ('RENT', 'Rent'),
  ('MAINTENANCE', 'Maintenance'), ('UTILITIES', 'Utilities'), ('OTHER', 'Other');

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_no TEXT NOT NULL UNIQUE CHECK (length(expense_no) >= 1 AND length(expense_no) <= 32),
  category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  expense_date TEXT NOT NULL CHECK (expense_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'check')),
  cash_account_id INTEGER REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  party_id INTEGER REFERENCES parties(id) ON DELETE RESTRICT,
  tax_class TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
  cancel_reason TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((method = 'cash' AND cash_account_id IS NOT NULL) OR (method != 'cash' AND cash_account_id IS NULL))
);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
