-- 023_fiscal_accounting.sql — Phase 25: fiscal year, accounting events, journals

-- fiscal_years (exercices): one open at a time for posting
CREATE TABLE fiscal_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 32),
  name TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date TEXT NOT NULL CHECK (end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  closed_at TEXT,
  closed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_fiscal_years_status ON fiscal_years(status);

-- journals: logical journals (sales, purchases, cash, stock, adjustments)
CREATE TABLE journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 16),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- accounting_events: generated from operational transactions, immutable trace
CREATE TABLE accounting_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id) ON DELETE RESTRICT,
  journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE RESTRICT,
  event_date TEXT NOT NULL CHECK (event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'sales_invoice_posted', 'sales_credit_note', 'purchase_invoice_recorded',
    'purchase_credit_note', 'cash_receipt', 'cash_payment', 'cash_adjustment',
    'stock_movement', 'expense_recorded', 'manual_journal'
  )),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'document', 'payment_allocation', 'cash_transaction', 'expense', 'stock_movement', 'manual'
  )),
  source_id INTEGER NOT NULL,  -- the document_id, payment_id, etc.
  description TEXT NOT NULL DEFAULT '',
  total_debit INTEGER NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit INTEGER NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT NOT NULL DEFAULT 'system'
);
CREATE INDEX idx_acct_events_fy ON accounting_events(fiscal_year_id);
CREATE INDEX idx_acct_events_source ON accounting_events(source_type, source_id);
CREATE INDEX idx_acct_events_date ON accounting_events(event_date);

-- journal_lines: double-entry lines for each accounting event
CREATE TABLE journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accounting_event_id INTEGER NOT NULL REFERENCES accounting_events(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  account_code TEXT NOT NULL CHECK (length(account_code) >= 1 AND length(account_code) <= 32),
  account_name TEXT NOT NULL DEFAULT '',
  debit INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
  charge_category_id INTEGER REFERENCES charge_categories(id) ON DELETE SET NULL,
  fiscal_classification_id INTEGER REFERENCES fiscal_classifications(id) ON DELETE SET NULL,
  cost_center TEXT,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (accounting_event_id, line_no)
);
CREATE INDEX idx_journal_lines_event ON journal_lines(accounting_event_id);

-- charge_categories: for analytical accounting (charges)
CREATE TABLE charge_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 32),
  name TEXT NOT NULL DEFAULT '',
  parent_id INTEGER REFERENCES charge_categories(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_charge_cat_parent ON charge_categories(parent_id);

-- fiscal_classifications: configurable legal/tax classifications (e.g., zakat, VAT categories)
CREATE TABLE fiscal_classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 32),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  applies_to TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('sales', 'purchases', 'expenses', 'all')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seed system journals
INSERT INTO journals (code, name, description, is_system) VALUES
  ('SAL', 'Sales Journal', 'Posted sales invoices and credit notes', 1),
  ('PUR', 'Purchases Journal', 'Recorded purchase invoices and credit notes', 1),
  ('CSH', 'Cash Journal', 'Cash receipts, payments, adjustments', 1),
  ('STK', 'Stock Journal', 'Inventory movements and valuation', 1),
  ('GEN', 'General Journal', 'Manual entries and corrections', 1);
