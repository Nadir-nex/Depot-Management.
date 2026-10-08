-- 004_product_master.sql — Phase 05: canonical product master data.
-- Adds the remaining P05 catalog attributes. Deliberately NOT added: image
-- path (current app needs none — P05 makes it conditional), supplier linkage
-- (P11/P14 own it), pack/unit conversions (P06 owns them).
-- product_type: 'goods' is storable; 'service' carries no stock and is
-- rejected by receiveStock. tax_class is CLASSIFICATION only; fiscal behavior
-- (rates, VAT/stamp computation) belongs to P25. min_stock is a stored
-- threshold; alerting/reporting belongs to P24. Portable ADD COLUMNs only.

ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'goods'
  CHECK (product_type IN ('goods', 'service'));
ALTER TABLE products ADD COLUMN default_sale_price INTEGER NOT NULL DEFAULT 0
  CHECK (default_sale_price >= 0);
ALTER TABLE products ADD COLUMN tax_class TEXT NOT NULL DEFAULT 'standard'
  CHECK (tax_class IN ('standard', 'exempt'));
ALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0
  CHECK (min_stock >= 0);
