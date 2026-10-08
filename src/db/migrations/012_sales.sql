-- 012_sales.sql — Phase 13: document discounts and line-level provenance.
--
-- documents.doc_discount_amount: explicit document-level discount in minor
-- units (P07 rule: discounts explicit, never invisible overwrites). Applied
-- after line discounts: grand = subtotal - line discounts - doc discount.
-- document_lines.source_line_id: which line this line was converted from
-- (order←quote, delivery←order, invoice←delivery). Guards live in the sales
-- service: delivered/invoiced quantities can never exceed their source.
-- Plain ADD COLUMNs; table CHECKs untouched.

ALTER TABLE documents ADD COLUMN doc_discount_amount INTEGER NOT NULL DEFAULT 0
  CHECK (doc_discount_amount >= 0);

ALTER TABLE document_lines ADD COLUMN source_line_id INTEGER REFERENCES document_lines(id) ON DELETE RESTRICT;
CREATE INDEX idx_doc_lines_source ON document_lines(source_line_id);
