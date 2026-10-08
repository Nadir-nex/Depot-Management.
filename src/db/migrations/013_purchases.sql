-- 013_purchases.sql — Phase 14: order-linked receiving + invoice matching.
--
-- purchase_receipts.purchase_order_id ties physical intake to its engine
-- purchase_order (partial receipts natural; remaining-quantity guards live in
-- the service). supplier_invoice_no/total record the supplier's CLAIM against
-- the intake (received vs invoiced separately representable) WITHOUT a second
-- ledger: v1 payable derives from received goods valued at cost (P11). A
-- future accrual separation (P25) can promote invoices with these match
-- records as its migration source. Plain ADD COLUMNs; no new tables.

ALTER TABLE purchase_receipts ADD COLUMN purchase_order_id INTEGER REFERENCES documents(id) ON DELETE RESTRICT;
CREATE INDEX idx_receipts_order ON purchase_receipts(purchase_order_id);

ALTER TABLE purchase_receipts ADD COLUMN supplier_invoice_no TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_receipts ADD COLUMN supplier_invoice_total INTEGER CHECK (supplier_invoice_total IS NULL OR supplier_invoice_total >= 0);
