'use strict';
// Sales reports domain (Phase 24). Pure functions that return SQL + params
// for posted sales documents only. No business logic — just the queries.

const SALES_TYPES = Object.freeze([
  'sales_quote', 'sales_order', 'delivery_note', 'sales_invoice', 'proforma_invoice', 'customer_return'
]);

const POSTED_STATUSES = Object.freeze(['posted', 'partially_paid', 'paid']);

function baseSalesWhere() {
  return `d.doc_type IN (${SALES_TYPES.map(() => '?').join(',')}) AND d.status IN (${POSTED_STATUSES.map(() => '?').join(',')})`;
}

function baseSalesParams() {
  return [...SALES_TYPES, ...POSTED_STATUSES];
}

function salesByDate({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  const conds = [baseSalesWhere()];
  const params = [...baseSalesParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT d.doc_date AS date,
             COUNT(DISTINCT d.id) AS doc_count,
             SUM(d.grand_total) AS grand_total,
             SUM(d.subtotal) AS subtotal,
             SUM(d.discount_total) AS discount_total,
             SUM(d.tax_total) AS tax_total
      FROM documents d
      ${where}
      GROUP BY d.doc_date
      ORDER BY d.doc_date
    `,
    params,
  };
}

function salesByCustomer({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  const conds = [baseSalesWhere()];
  const params = [...baseSalesParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.id AS party_id, p.code AS party_code, p.display_name AS party_name,
             COUNT(DISTINCT d.id) AS doc_count,
             SUM(d.grand_total) AS grand_total,
             SUM(d.subtotal) AS subtotal,
             SUM(d.discount_total) AS discount_total,
             SUM(d.tax_total) AS tax_total
      FROM documents d
      JOIN parties p ON p.id = d.party_id
      ${where}
      GROUP BY p.id
      ORDER BY grand_total DESC
    `,
    params,
  };
}

function salesByProduct({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  const conds = [baseSalesWhere()];
  const params = [...baseSalesParams()];
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

function salesBySalesperson({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  // Actor is in audit_log; need to join to get posted-by for sales
  const conds = [baseSalesWhere()];
  const params = [...baseSalesParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT al.actor AS salesperson,
             COUNT(DISTINCT d.id) AS doc_count,
             SUM(d.grand_total) AS grand_total
      FROM documents d
      JOIN audit_log al ON al.entity_id = d.id AND al.entity_type = 'document' AND al.operation = 'document.post'
      ${where}
      GROUP BY al.actor
      ORDER BY grand_total DESC
    `,
    params,
  };
}

function salesByRoute({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  // Route linkage via route_stops -> routes -> documents through deliveries/invoices
  const conds = [baseSalesWhere()];
  const params = [...baseSalesParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT r.id AS route_id, r.route_no, r.name AS route_name,
             COUNT(DISTINCT d.id) AS doc_count,
             SUM(d.grand_total) AS grand_total
      FROM documents d
      JOIN route_stops rs ON rs.id = (
        SELECT rs2.id FROM route_stops rs2
        JOIN route_stop_documents rsd ON rsd.route_stop_id = rs2.id
        WHERE rsd.document_id = d.id LIMIT 1
      )
      JOIN routes r ON r.id = rs.route_id
      ${where}
      GROUP BY r.id
      ORDER BY grand_total DESC
    `,
    params,
  };
}

function salesByDocumentType({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  const conds = [baseSalesWhere()];
  const params = [...baseSalesParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT d.doc_type,
             COUNT(*) AS doc_count,
             SUM(d.grand_total) AS grand_total,
             SUM(d.subtotal) AS subtotal,
             SUM(d.discount_total) AS discount_total,
             SUM(d.tax_total) AS tax_total
      FROM documents d
      ${where}
      GROUP BY d.doc_type
      ORDER BY d.doc_type
    `,
    params,
  };
}

function salesMargin({ dateFrom = null, dateTo = null, warehouseId = null } = {}) {
  const conds = [baseSalesWhere()];
  const params = [...baseSalesParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT pr.id AS product_id, pr.sku, pr.name,
             SUM(l.qty) AS total_qty,
             SUM(l.line_total) AS revenue,
             SUM(l.qty * pr.default_unit_cost) AS cogs,
             SUM(l.line_total) - SUM(l.qty * pr.default_unit_cost) AS margin,
             CASE WHEN SUM(l.line_total) > 0
                  THEN (SUM(l.line_total) - SUM(l.qty * pr.default_unit_cost)) * 100.0 / SUM(l.line_total)
                  ELSE 0 END AS margin_pct
      FROM documents d
      JOIN document_lines l ON l.document_id = d.id
      JOIN products pr ON pr.id = l.product_id
      ${where}
      GROUP BY pr.id
      HAVING revenue > 0
      ORDER BY margin DESC
    `,
    params,
  };
}

module.exports = {
  SALES_TYPES,
  POSTED_STATUSES,
  salesByDate,
  salesByCustomer,
  salesByProduct,
  salesBySalesperson,
  salesByRoute,
  salesByDocumentType,
  salesMargin,
};
