'use strict';
// Purchasing reports domain (Phase 24). Posted purchase documents only.

const PURCHASE_TYPES = Object.freeze(['purchase_order', 'purchase_receipt', 'supplier_return']);
const POSTED_PURCHASE_STATUSES = Object.freeze(['posted', 'partially_paid', 'paid']);

function basePurchaseWhere() {
  return `d.doc_type IN (${PURCHASE_TYPES.map(() => '?').join(',')}) AND d.status IN (${POSTED_PURCHASE_STATUSES.map(() => '?').join(',')})`;
}

function basePurchaseParams() {
  return [...PURCHASE_TYPES, ...POSTED_PURCHASE_STATUSES];
}

function purchasesBySupplier({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  const conds = [basePurchaseWhere()];
  const params = [...basePurchaseParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.id AS party_id, p.code AS party_code, p.display_name AS party_name,
             COUNT(DISTINCT d.id) AS doc_count,
             SUM(d.grand_total) AS grand_total
      FROM documents d
      JOIN parties p ON p.id = d.party_id
      ${where}
      GROUP BY p.id
      ORDER BY grand_total DESC
    `,
    params,
  };
}

function purchasesByProduct({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  const conds = [basePurchaseWhere()];
  const params = [...basePurchaseParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT pr.id AS product_id, pr.sku, pr.name,
             SUM(l.qty) AS total_qty,
             SUM(l.line_total) AS grand_total,
             AVG(l.unit_price) AS avg_unit_price
      FROM documents d
      JOIN document_lines l ON l.document_id = d.id
      JOIN products pr ON pr.id = l.product_id
      ${where}
      GROUP BY pr.id
      ORDER BY grand_total DESC
    `,
    params,
  };
}

function purchasesByDate({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  const conds = [basePurchaseWhere()];
  const params = [...basePurchaseParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT d.doc_date AS date,
             COUNT(DISTINCT d.id) AS doc_count,
             SUM(d.grand_total) AS grand_total
      FROM documents d
      ${where}
      GROUP BY d.doc_date
      ORDER BY d.doc_date
    `,
    params,
  };
}

function receivedVsOrdered({ dateFrom = null, dateTo = null, supplierId = null } = {}) {
  // Ordered = purchase_order posted, Received = purchase_receipt posted
  const conds = [];
  const params = [];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (supplierId) { conds.push('d.party_id = ?'); params.push(supplierId); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return {
    sql: `
      SELECT pr.id AS product_id, pr.sku, pr.name,
             SUM(CASE WHEN d.doc_type = 'purchase_order' THEN l.qty ELSE 0 END) AS ordered_qty,
             SUM(CASE WHEN d.doc_type = 'purchase_receipt' THEN l.qty ELSE 0 END) AS received_qty,
             SUM(CASE WHEN d.doc_type = 'purchase_order' THEN l.line_total ELSE 0 END) AS ordered_value,
             SUM(CASE WHEN d.doc_type = 'purchase_receipt' THEN l.line_total ELSE 0 END) AS received_value
      FROM documents d
      JOIN document_lines l ON l.document_id = d.id
      JOIN products pr ON pr.id = l.product_id
      ${where}
      AND d.doc_type IN ('purchase_order', 'purchase_receipt')
      AND d.status IN ('posted', 'partially_paid', 'paid')
      GROUP BY pr.id
      ORDER BY received_qty DESC
    `,
    params,
  };
}

function supplierBalances({ dateFrom = null, dateTo = null } = {}) {
  const conds = [basePurchaseWhere()];
  const params = [...basePurchaseParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.id AS party_id, p.code AS party_code, p.display_name AS party_name,
             SUM(d.grand_total) AS total_purchased,
             COALESCE(SUM(pa.amount), 0) AS total_paid,
             SUM(d.grand_total) - COALESCE(SUM(pa.amount), 0) AS balance
      FROM documents d
      JOIN parties p ON p.id = d.party_id
      LEFT JOIN payment_allocations pa ON pa.document_id = d.id AND pa.document_type IN ('purchase_order', 'purchase_receipt', 'supplier_return')
      ${where}
      GROUP BY p.id
      ORDER BY balance DESC
    `,
    params,
  };
}

module.exports = {
  PURCHASE_TYPES,
  POSTED_PURCHASE_STATUSES,
  purchasesBySupplier,
  purchasesByProduct,
  purchasesByDate,
  receivedVsOrdered,
  supplierBalances,
};
