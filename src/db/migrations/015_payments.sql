-- 015_payments.sql — Phase 16: payments, allocations, operational cash.
--
-- cash_accounts: named money stores with an opening balance. Balances always
-- derive (opening + signed cash transactions), never stored per state.
-- cash_sessions: open/close shifts per account (one open at a time). Closing
-- records the counted amount next to the computed expected amount — the
-- discrepancy IS the report, never silently absorbed.
--
-- payments: posted money events, append-only with status. A payment is never
-- edited or deleted: reversal removes its ALLOCATION links (derived data),
-- writes a compensating cash transaction, and flips status to cancelled —
-- the row itself stays as history.
-- allocations: links from a payment to its targets (posted sales invoices /
-- posted purchase receipts). One row per (payment, target); the sum per
-- payment cannot exceed the payment, and no target can be over-allocated.
-- cash_transactions: the cash-account leg of cash-method payments (and only
-- those). Non-cash methods move no till money. Table CHECKs close each list.

CREATE TABLE cash_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (length(code) >= 1 AND length(code) <= 16),
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  opening_balance INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE cash_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_account_id INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_amount INTEGER NOT NULL,
  closing_amount INTEGER,
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sessions_account ON cash_sessions(cash_account_id);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_no TEXT NOT NULL UNIQUE CHECK (length(payment_no) >= 1 AND length(payment_no) <= 32),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  cash_account_id INTEGER REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'check')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL CHECK (payment_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_payments_party ON payments(party_id);

CREATE TABLE payment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('sales_invoice', 'purchase_receipt')),
  target_id INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  UNIQUE (payment_id, target_type, target_id)
);
CREATE INDEX idx_allocations_target ON payment_allocations(target_type, target_id);

CREATE TABLE cash_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_account_id INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  session_id INTEGER REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  payment_id INTEGER REFERENCES payments(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_cash_txns_account ON cash_transactions(cash_account_id);
