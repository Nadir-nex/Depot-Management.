'use strict';
// Delivery reports domain (Phase 24). Posted delivery notes + route data.

function routeCompletion({ routeId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['r.status IN (?, ?)'];
  const params = ['planned', 'completed'];
  if (routeId) { conds.push('r.id = ?'); params.push(routeId); }
  if (dateFrom) { conds.push('r.route_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('r.route_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT r.id AS route_id, r.route_no, r.name AS route_name, r.route_date,
             r.status, r.vehicle_id, r.driver_id,
             COUNT(rs.id) AS total_stops,
             SUM(CASE WHEN rs.status = 'completed' THEN 1 ELSE 0 END) AS completed_stops,
             SUM(CASE WHEN rs.status = 'failed' THEN 1 ELSE 0 END) AS failed_stops,
             SUM(CASE WHEN rs.status = 'pending' THEN 1 ELSE 0 END) AS pending_stops
      FROM routes r
      LEFT JOIN route_stops rs ON rs.route_id = r.id
      ${where}
      GROUP BY r.id
      ORDER BY r.route_date DESC
    `,
    params,
  };
}

function failedDeliveries({ routeId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['rs.status = ?'];
  const params = ['failed'];
  if (routeId) { conds.push('r.id = ?'); params.push(routeId); }
  if (dateFrom) { conds.push('r.route_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('r.route_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT rs.id AS stop_id, rs.sequence, rs.status, rs.notes,
             r.route_no, r.name AS route_name, r.route_date,
             p.code AS customer_code, p.display_name AS customer_name,
             d.doc_no AS delivery_note_no
      FROM route_stops rs
      JOIN routes r ON r.id = rs.route_id
      LEFT JOIN parties p ON p.id = rs.party_id
      LEFT JOIN documents d ON d.id = rs.document_id
      ${where}
      ORDER BY r.route_date DESC, rs.sequence
    `,
    params,
  };
}

function quantityDelivered({ dateFrom = null, dateTo = null, productId = null, warehouseId = null } = {}) {
  const conds = ['d.doc_type = ?', 'd.status IN (?, ?, ?)'];
  const params = ['delivery_note', 'posted', 'partially_paid', 'paid'];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  if (productId) { conds.push('l.product_id = ?'); params.push(productId); }
  if (warehouseId) { conds.push('d.warehouse_id = ?'); params.push(warehouseId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.sku, p.name,
             SUM(l.qty) AS total_qty,
             COUNT(DISTINCT d.id) AS delivery_count
      FROM documents d
      JOIN document_lines l ON l.document_id = d.id
      JOIN products p ON p.id = l.product_id
      ${where}
      GROUP BY p.id
      ORDER BY total_qty DESC
    `,
    params,
  };
}

function customerCollections({ dateFrom = null, dateTo = null, routeId = null } = {}) {
  // Collections on delivery: payments allocated to invoices linked to deliveries on this route
  const conds = ['d.doc_type = ?', 'd.status IN (?, ?, ?)'];
  const params = ['sales_invoice', 'posted', 'partially_paid', 'paid'];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT r.route_no, r.name AS route_name, r.route_date,
             p.code AS customer_code, p.display_name AS customer_name,
             SUM(pa.amount) AS collected,
             COUNT(DISTINCT d.id) AS invoice_count
      FROM payment_allocations pa
      JOIN documents d ON d.id = pa.document_id
      JOIN route_stops rs ON rs.document_id = d.id
      JOIN routes r ON r.id = rs.route_id
      JOIN parties p ON p.id = d.party_id
      ${where}
      GROUP BY r.id, p.id
      ORDER BY r.route_date DESC, collected DESC
    `,
    params,
  };
}

function driverVehiclePerformance({ driverId = null, vehicleId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = [];
  const params = [];
  if (driverId) { conds.push('r.driver_id = ?'); params.push(driverId); }
  if (vehicleId) { conds.push('r.vehicle_id = ?'); params.push(vehicleId); }
  if (dateFrom) { conds.push('r.route_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('r.route_date <= ?'); params.push(dateTo); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return {
    sql: `
      SELECT dr.id AS driver_id, dr.name AS driver_name,
             fv.id AS vehicle_id, fv.registration AS vehicle_reg,
             COUNT(r.id) AS routes_assigned,
             SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS routes_completed,
             SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS routes_failed,
             COUNT(rs.id) AS total_stops,
             SUM(CASE WHEN rs.status = 'completed' THEN 1 ELSE 0 END) AS stops_completed
      FROM routes r
      LEFT JOIN drivers dr ON dr.id = r.driver_id
      LEFT JOIN fleet_vehicles fv ON fv.id = r.vehicle_id
      LEFT JOIN route_stops rs ON rs.route_id = r.id
      ${where}
      GROUP BY dr.id, fv.id
      ORDER BY routes_completed DESC
    `,
    params,
  };
}

module.exports = {
  routeCompletion,
  failedDeliveries,
  quantityDelivered,
  customerCollections,
  driverVehiclePerformance,
};
