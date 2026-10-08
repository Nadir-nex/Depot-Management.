-- 024_idempotency_performance.sql — Phase 27: idempotency keys, performance indexes

-- operation_keys: prevents duplicate business events (idempotency)
-- Key is a client-generated unique string (e.g., UUID) + operation type
-- If key exists, operation is rejected as duplicate
CREATE TABLE operation_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'receive_stock', 'post_invoice', 'post_delivery', 'record_payment',
    'reserve_stock', 'complete_stop', 'post_count', 'settle_stop'
  )),
  operation_key TEXT NOT NULL UNIQUE CHECK (length(operation_key) >= 16 AND length(operation_key) <= 128),
  entity_id INTEGER, -- document_id, receipt_id, payment_id, etc.
  entity_type TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_op_keys_type_key ON operation_keys(operation_type, operation_key);

-- Additional performance indexes
-- Product search by barcode (already indexed via product_barcodes.code)
-- Product search by name/SKU
CREATE INDEX IF NOT EXISTS idx_products_name_search ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku_search ON products(sku);

-- Document search by party + date range (common report filter)
CREATE INDEX IF NOT EXISTS idx_documents_party_date ON documents(party_id, doc_date);

-- Payment allocation lookups
CREATE INDEX IF NOT EXISTS idx_pay_alloc_doc ON payment_allocations(target_id, target_type);

-- Stock movement lookups by product + warehouse + date
CREATE INDEX IF NOT EXISTS idx_stock_movements_pwd ON stock_movements(product_id, warehouse_id, date(created_at));

-- Cash transaction lookups by account + date
CREATE INDEX IF NOT EXISTS idx_cash_txns_account_date ON cash_transactions(cash_account_id, date(created_at));

-- Route stop lookups by route + party
CREATE INDEX IF NOT EXISTS idx_route_stops_route_party ON route_stops(route_id, party_id);
