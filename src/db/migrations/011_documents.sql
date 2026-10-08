-- 011_documents.sql — Phase 12: generic commercial document backbone.
--
-- documents: every commercial record is (type, status) with an explicit
-- lifecycle (domain/documents.js TYPE_TRANSITIONS). Money snapshots freeze at
-- post time: later catalog/tariff edits can never rewrite history. Posting
-- here means DOCUMENT posting only — stock and payment postings are separate
-- concerns owned by later phases (the critical P12 distinction), recorded on
-- their own ledgers, never inferred from status.
-- source_doc_id chains conversions (quote→order→delivery→invoice) without
-- copying semantics. Table CHECK closes the column list.

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL UNIQUE CHECK (length(doc_no) >= 1 AND length(doc_no) <= 32),
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'sales_quote', 'sales_order', 'delivery_note', 'sales_invoice',
    'proforma_invoice', 'purchase_order', 'purchase_receipt',
    'customer_return', 'supplier_return'
  )),
  party_id INTEGER REFERENCES parties(id) ON DELETE RESTRICT,
  source_doc_id INTEGER REFERENCES documents(id) ON DELETE RESTRICT,
  doc_date TEXT NOT NULL CHECK (doc_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'confirmed', 'posted', 'partially_paid', 'paid', 'cancelled'
  )),
  subtotal INTEGER NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total INTEGER NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total INTEGER NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total INTEGER NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  currency TEXT NOT NULL DEFAULT 'DZD',
  notes TEXT NOT NULL DEFAULT '',
  posted_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_documents_type_status ON documents(doc_type, status);
CREATE INDEX idx_documents_party ON documents(party_id);
CREATE INDEX idx_documents_source ON documents(source_doc_id);

-- document_lines: snapshots, not live references. description/unit_price/
-- discount/tax_class/line_total are copied at line-write time; product edits
-- afterwards affect nothing posted. Pack representation + lot allocation ride
-- along for future fulfillment. Table CHECK closes the column list.
CREATE TABLE document_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  description TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_code TEXT NOT NULL DEFAULT 'PCS',
  pack_id INTEGER REFERENCES product_packs(id) ON DELETE RESTRICT,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_class TEXT NOT NULL DEFAULT 'standard',
  line_total INTEGER NOT NULL CHECK (line_total >= 0),
  lot_id INTEGER REFERENCES lots(id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (document_id, line_no)
);
CREATE INDEX idx_doc_lines_doc ON document_lines(document_id);
CREATE INDEX idx_doc_lines_product ON document_lines(product_id);
