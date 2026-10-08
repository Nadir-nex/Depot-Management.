'use strict';
// Cash reports domain (Phase 24). Cash sessions, transactions, expenses.

function sessionSummary({ cashAccountId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['1=1'];
  const params = [];
  if (cashAccountId) { conds.push('cs.cash_account_id = ?'); params.push(cashAccountId); }
  if (dateFrom) { conds.push('cs.session_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('cs.session_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT cs.id AS session_id, cs.session_date, cs.session_no,
             ca.code AS account_code, ca.name AS account_name,
             cs.opening_amount, cs.closing_amount,
             cs.expected_closing, cs.difference,
             cs.status, cs.opened_at, cs.closed_at
      FROM cash_sessions cs
      JOIN cash_accounts ca ON ca.id = cs.cash_account_id
      ${where}
      ORDER BY cs.session_date DESC, cs.session_no DESC
    `,
    params,
  };
}

function cashReceipts({ cashAccountId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['ct.type = ?'];
  const params = ['receipt'];
  if (cashAccountId) { conds.push('ct.cash_account_id = ?'); params.push(cashAccountId); }
  if (dateFrom) { conds.push('date(ct.created_at) >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('date(ct.created_at) <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT ct.id, ct.created_at, ct.type, ct.amount, ct.reference_no, ct.notes,
             ca.code AS account_code, ca.name AS account_name,
             p.code AS party_code, p.display_name AS party_name
      FROM cash_transactions ct
      JOIN cash_accounts ca ON ca.id = ct.cash_account_id
      LEFT JOIN parties p ON p.id = ct.party_id
      ${where}
      ORDER BY ct.created_at DESC
    `,
    params,
  };
}

function cashPayments({ cashAccountId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['ct.type = ?'];
  const params = ['payment'];
  if (cashAccountId) { conds.push('ct.cash_account_id = ?'); params.push(cashAccountId); }
  if (dateFrom) { conds.push('date(ct.created_at) >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('date(ct.created_at) <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT ct.id, ct.created_at, ct.type, ct.amount, ct.reference_no, ct.notes,
             ca.code AS account_code, ca.name AS account_name,
             p.code AS party_code, p.display_name AS party_name
      FROM cash_transactions ct
      JOIN cash_accounts ca ON ca.id = ct.cash_account_id
      LEFT JOIN parties p ON p.id = ct.party_id
      ${where}
      ORDER BY ct.created_at DESC
    `,
    params,
  };
}

function expensesReport({ expenseCategoryId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['1=1'];
  const params = [];
  if (expenseCategoryId) { conds.push('e.expense_category_id = ?'); params.push(expenseCategoryId); }
  if (dateFrom) { conds.push('e.expense_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('e.expense_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT e.id, e.expense_date, e.amount, e.description, e.reference_no,
             ec.name AS category_name,
             p.code AS party_code, p.display_name AS party_name
      FROM expenses e
      JOIN expense_categories ec ON ec.id = e.expense_category_id
      LEFT JOIN parties p ON p.id = e.party_id
      ${where}
      ORDER BY e.expense_date DESC, e.id DESC
    `,
    params,
  };
}

function adjustmentsReport({ cashAccountId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['ct.type = ?'];
  const params = ['adjustment'];
  if (cashAccountId) { conds.push('ct.cash_account_id = ?'); params.push(cashAccountId); }
  if (dateFrom) { conds.push('date(ct.created_at) >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('date(ct.created_at) <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT ct.id, ct.created_at, ct.amount, ct.reference_no, ct.notes,
             ca.code AS account_code, ca.name AS account_name
      FROM cash_transactions ct
      JOIN cash_accounts ca ON ca.id = ct.cash_account_id
      ${where}
      ORDER BY ct.created_at DESC
    `,
    params,
  };
}

function discrepanciesReport({ dateFrom = null, dateTo = null } = {}) {
  const conds = ['cs.difference != 0'];
  const params = [];
  if (dateFrom) { conds.push('cs.session_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('cs.session_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT cs.id AS session_id, cs.session_date, cs.session_no,
             ca.code AS account_code, ca.name AS account_name,
             cs.opening_amount, cs.closing_amount, cs.expected_closing,
             cs.difference, cs.opened_at, cs.closed_at
      FROM cash_sessions cs
      JOIN cash_accounts ca ON ca.id = cs.cash_account_id
      ${where}
      ORDER BY cs.session_date DESC
    `,
    params,
  };
}

function dailyCashPosition({ date = null, cashAccountId = null } = {}) {
  const d = date || new Date().toISOString().slice(0, 10);
  const conds = ['cs.session_date = ?'];
  const params = [d];
  if (cashAccountId) { conds.push('cs.cash_account_id = ?'); params.push(cashAccountId); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT ca.id AS account_id, ca.code, ca.name,
             SUM(ct.amount) FILTER (WHERE ct.type = 'receipt') AS total_receipts,
             SUM(ct.amount) FILTER (WHERE ct.type = 'payment') AS total_payments,
             SUM(ct.amount) FILTER (WHERE ct.type = 'adjustment') AS total_adjustments,
             MAX(cs.closing_amount) AS last_closing
      FROM cash_accounts ca
      LEFT JOIN cash_sessions cs ON cs.cash_account_id = ca.id AND cs.session_date = ?
      LEFT JOIN cash_transactions ct ON ct.cash_account_id = ca.id AND date(ct.created_at) = ?
      ${where}
      GROUP BY ca.id
    `,
    params: [d, d],
  };
}

module.exports = {
  sessionSummary,
  cashReceipts,
  cashPayments,
  expensesReport,
  adjustmentsReport,
  discrepanciesReport,
  dailyCashPosition,
};
