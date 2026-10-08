'use strict';
// Reporting application layer (Phase 24). Executes domain queries and formats results.

const salesReport = require('../../domain/reporting/sales');
const receivablesReport = require('../../domain/reporting/receivables');
const inventoryReport = require('../../domain/reporting/inventory');
const purchasingReport = require('../../domain/reporting/purchasing');
const deliveryReport = require('../../domain/reporting/delivery');
const cashReport = require('../../domain/reporting/cash');

function execute(db, { sql, params }) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

function runReport(db, queryFn, opts = {}) {
  const { sql, params } = queryFn(opts);
  return execute(db, { sql, params });
}

// Sales reports
function getSalesByDate(db, opts) { return runReport(db, salesReport.salesByDate, opts); }
function getSalesByCustomer(db, opts) { return runReport(db, salesReport.salesByCustomer, opts); }
function getSalesByProduct(db, opts) { return runReport(db, salesReport.salesByProduct, opts); }
function getSalesBySalesperson(db, opts) { return runReport(db, salesReport.salesBySalesperson, opts); }
function getSalesByRoute(db, opts) { return runReport(db, salesReport.salesByRoute, opts); }
function getSalesByDocumentType(db, opts) { return runReport(db, salesReport.salesByDocumentType, opts); }
function getSalesMargin(db, opts) { return runReport(db, salesReport.salesMargin, opts); }

// Receivables reports
function getCustomerBalances(db, opts) { return runReport(db, receivablesReport.customerBalances, opts); }
function getOverdueAmounts(db, opts) { return runReport(db, receivablesReport.overdueAmounts, opts); }
function getPaymentHistory(db, opts) { return runReport(db, receivablesReport.paymentHistory, opts); }
function getAgingReport(db, opts) { return runReport(db, receivablesReport.agingReport, opts); }

// Inventory reports
function getCurrentStock(db, opts) { return runReport(db, inventoryReport.currentStock, opts); }
function getStockValuation(db, opts) { return runReport(db, inventoryReport.stockValuation, opts); }
function getMovementHistory(db, opts) { return runReport(db, inventoryReport.movementHistory, opts); }
function getLowStockProducts(db, opts) { return runReport(db, inventoryReport.lowStockProducts, opts); }
function getLotExpiryReport(db, opts) { return runReport(db, inventoryReport.lotExpiryReport, opts); }
function getWarehouseComparison(db, opts) { return runReport(db, inventoryReport.warehouseComparison, opts); }

// Purchasing reports
function getPurchasesBySupplier(db, opts) { return runReport(db, purchasingReport.purchasesBySupplier, opts); }
function getPurchasesByProduct(db, opts) { return runReport(db, purchasingReport.purchasesByProduct, opts); }
function getPurchasesByDate(db, opts) { return runReport(db, purchasingReport.purchasesByDate, opts); }
function getReceivedVsOrdered(db, opts) { return runReport(db, purchasingReport.receivedVsOrdered, opts); }
function getSupplierBalances(db, opts) { return runReport(db, purchasingReport.supplierBalances, opts); }

// Delivery reports
function getRouteCompletion(db, opts) { return runReport(db, deliveryReport.routeCompletion, opts); }
function getFailedDeliveries(db, opts) { return runReport(db, deliveryReport.failedDeliveries, opts); }
function getQuantityDelivered(db, opts) { return runReport(db, deliveryReport.quantityDelivered, opts); }
function getCustomerCollections(db, opts) { return runReport(db, deliveryReport.customerCollections, opts); }
function getDriverVehiclePerformance(db, opts) { return runReport(db, deliveryReport.driverVehiclePerformance, opts); }

// Cash reports
function getSessionSummary(db, opts) { return runReport(db, cashReport.sessionSummary, opts); }
function getCashReceipts(db, opts) { return runReport(db, cashReport.cashReceipts, opts); }
function getCashPayments(db, opts) { return runReport(db, cashReport.cashPayments, opts); }
function getExpensesReport(db, opts) { return runReport(db, cashReport.expensesReport, opts); }
function getAdjustmentsReport(db, opts) { return runReport(db, cashReport.adjustmentsReport, opts); }
function getDiscrepanciesReport(db, opts) { return runReport(db, cashReport.discrepanciesReport, opts); }
function getDailyCashPosition(db, opts) { return runReport(db, cashReport.dailyCashPosition, opts); }

module.exports = {
  // Sales
  getSalesByDate,
  getSalesByCustomer,
  getSalesByProduct,
  getSalesBySalesperson,
  getSalesByRoute,
  getSalesByDocumentType,
  getSalesMargin,
  // Receivables
  getCustomerBalances,
  getOverdueAmounts,
  getPaymentHistory,
  getAgingReport,
  // Inventory
  getCurrentStock,
  getStockValuation,
  getMovementHistory,
  getLowStockProducts,
  getLotExpiryReport,
  getWarehouseComparison,
  // Purchasing
  getPurchasesBySupplier,
  getPurchasesByProduct,
  getPurchasesByDate,
  getReceivedVsOrdered,
  getSupplierBalances,
  // Delivery
  getRouteCompletion,
  getFailedDeliveries,
  getQuantityDelivered,
  getCustomerCollections,
  getDriverVehiclePerformance,
  // Cash
  getSessionSummary,
  getCashReceipts,
  getCashPayments,
  getExpensesReport,
  getAdjustmentsReport,
  getDiscrepanciesReport,
  getDailyCashPosition,
};
