'use strict';
// Inventory reports domain (Phase 24). Derived from stock_movements + posted docs.

function currentStock({ warehouseId = null, search = '' } = {}) {
  const conds = ['1=1'];
  const params = [];
  if (warehouseId) { conds.push('m.warehouse_id = ?'); params.push(warehouseId); }
  if (search) { conds.push('(p.sku LIKE ? OR p.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.id AS product_id, p.sku, p.name, p.default_unit_cost, p.default_sale_price,
             COALESCE(SUM(m.qty), 0) AS stock,
             COALESCE(SUM(m.qty) * p.default_unit_cost, 0) AS valuation_cost,
             COALESCE(SUM(m.qty) * p.default_sale_price, 0) AS valuation_sale
      FROM products p
      LEFT JOIN stock_movements m ON m.product_id = p.id
      ${where}
      GROUP BY p.id
      ORDER BY p.name
    `,
    params,
  };
}

function stockValuation({ warehouseId = null } = {}) {
  const conds = ['1=1'];
  const params = [];
  if (warehouseId) { conds.push('m.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
             SUM(COALESCE(stock, 0)) AS total_units,
             SUM(COALESCE(stock * default_unit_cost, 0)) AS total_cost_value,
             SUM(COALESCE(stock * default_sale_price, 0)) AS total_sale_value
      FROM (
        SELECT m.warehouse_id, p.id, p.default_unit_cost, p.default_sale_price,
               COALESCE(SUM(m.qty), 0) AS stock
        FROM stock_movements m
        JOIN products p ON p.id = m.product_id
        ${where}
        GROUP BY m.warehouse_id, p.id
      ) s
      JOIN warehouses w ON w.id = s.warehouse_id
      GROUP BY w.id
    `,
    params,
  };
}

function movementHistory({ productId = null, warehouseId = null, dateFrom = null, dateTo = null, movementType = null, limit = 500 } = {}) {
  const conds = ['1=1'];
  const params = [];
  if (productId) { conds.push('m.product_id = ?'); params.push(productId); }
  if (warehouseId) { conds.push('m.warehouse_id = ?'); params.push(warehouseId); }
  if (dateFrom) { conds.push('date(m.created_at) >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('date(m.created_at) <= ?'); params.push(dateTo); }
  if (movementType) { conds.push('m.movement_type = ?'); params.push(movementType); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT m.id, m.created_at, m.movement_type, m.qty,
             m.reference_type, m.reference_id,
             p.sku, p.name AS product_name,
             w.code AS warehouse_code,
             pr.doc_no AS document_no, pr.doc_type AS document_type
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      JOIN warehouses w ON w.id = m.warehouse_id
      LEFT JOIN documents pr ON pr.id = m.reference_id AND pr.doc_type = m.reference_type
      ${where}
      ORDER BY m.created_at DESC
      LIMIT ?
    `,
    params: [...params, limit],
  };
}

function lowStockProducts({ warehouseId = null, threshold = 0 } = {}) {
  const conds = ['COALESCE(SUM(m.qty), 0) <= ?'];
  const params = [threshold];
  if (warehouseId) { conds.push('m.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.id AS product_id, p.sku, p.name, p.min_stock,
             COALESCE(SUM(m.qty), 0) AS stock,
             w.code AS warehouse_code, w.name AS warehouse_name
      FROM products p
      JOIN stock_movements m ON m.product_id = p.id
      JOIN warehouses w ON w.id = m.warehouse_id
      ${where}
      GROUP BY p.id, w.id
      ORDER BY stock ASC
    `,
    params,
  };
}

function lotExpiryReport({ warehouseId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['l.expiry_date IS NOT NULL', 'l.qty > 0'];
  const params = [];
  if (warehouseId) { conds.push('l.warehouse_id = ?'); params.push(warehouseId); }
  if (dateFrom) { conds.push('l.expiry_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('l.expiry_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT l.id AS lot_id, l.lot_no, l.expiry_date, l.qty,
             p.sku, p.name AS product_name,
             w.code AS warehouse_code
      FROM lots l
      JOIN products p ON p.id = l.product_id
      JOIN warehouses w ON w.id = l.warehouse_id
      ${where}
      ORDER BY l.expiry_date ASC
    `,
    params,
  };
}

function warehouseComparison({ productId = null } = {}) {
  const conds = ['1=1'];
  const params = [];
  if (productId) { conds.push('m.product_id = ?'); params.push(productId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT w.id AS warehouse_id, w.code, w.name,
             p.sku, p.name AS product_name,
             COALESCE(SUM(m.qty), 0) AS stock
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      JOIN warehouses w ON w.id = m.warehouse_id
      ${where}
      GROUP BY w.id, p.id
      ORDER BY w.code, p.sku
    `,
    params,
  };
}

module.exports = {
  currentStock,
  stockValuation,
  movementHistory,
  lowStockProducts,
  lotExpiryReport,
  warehouseComparison,
};
