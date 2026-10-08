'use strict';
// Receivables reports domain (Phase 24). Posted sales_invoice + payment allocations.

const POSTED_INVOICE_STATUSES = Object.freeze(['posted', 'partially_paid', 'paid']);

function baseInvoiceWhere() {
  return `d.doc_type = 'sales_invoice' AND d.status IN (${POSTED_INVOICE_STATUSES.map(() => '?').join(',')})`;
}

function baseInvoiceParams() {
  return [...POSTED_INVOICE_STATUSES];
}

function customerBalances({ dateFrom = null, dateTo = null } = {}) {
  const conds = [baseInvoiceWhere()];
  const params = [...baseInvoiceParams()];
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.id AS party_id, p.code AS party_code, p.display_name AS party_name,
             SUM(d.grand_total) AS total_invoiced,
             COALESCE(SUM(pa.amount), 0) AS total_paid,
             SUM(d.grand_total) - COALESCE(SUM(pa.amount), 0) AS balance
      FROM documents d
      JOIN parties p ON p.id = d.party_id
      LEFT JOIN payment_allocations pa ON pa.document_id = d.id AND pa.document_type = 'sales_invoice'
      ${where}
      GROUP BY p.id
      ORDER BY balance DESC
    `,
    params,
  };
}

function overdueAmounts({ asOfDate = null } = {}) {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const conds = [baseInvoiceWhere()];
  const params = [...baseInvoiceParams()];
  // Overdue if posted and balance > 0 and (no payment terms or doc_date + payment_terms < asOfDate)
  // Simplified: just show all with balance > 0 for now
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.id AS party_id, p.code AS party_code, p.display_name AS party_name,
             d.id AS invoice_id, d.doc_no, d.doc_date,
             d.grand_total AS invoiced,
             COALESCE(SUM(pa.amount), 0) AS paid,
             d.grand_total - COALESCE(SUM(pa.amount), 0) AS balance,
             p.payment_terms_days
      FROM documents d
      JOIN parties p ON p.id = d.party_id
      LEFT JOIN payment_allocations pa ON pa.document_id = d.id AND pa.document_type = 'sales_invoice'
      ${where}
      GROUP BY d.id
      HAVING balance > 0
      ORDER BY d.doc_date
    `,
    params,
  };
}

function paymentHistory({ partyId = null, dateFrom = null, dateTo = null } = {}) {
  const conds = ['pa.document_type = ?'];
  const params = ['sales_invoice'];
  if (partyId) { conds.push('p.id = ?'); params.push(partyId); }
  if (dateFrom) { conds.push('d.doc_date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('d.doc_date <= ?'); params.push(dateTo); }
  const where = `WHERE ${conds.join(' AND ')}`;
  return {
    sql: `
      SELECT p.id AS party_id, p.code AS party_code, p.display_name AS party_name,
             d.doc_no, d.doc_date, d.grand_total AS invoiced,
             pa.amount, pa.allocated_at,
             c.code AS cash_account_code, c.name AS cash_account_name
      FROM payment_allocations pa
      JOIN documents d ON d.id = pa.document_id
      JOIN parties p ON p.id = d.party_id
      LEFT JOIN cash_accounts c ON c.id = pa.cash_account_id
      ${where}
      ORDER BY pa.allocated_at DESC
    `,
    params,
  };
}

function agingReport({ asOfDate = null, buckets = [30, 60, 90, 120] } = {}) {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const conds = [baseInvoiceWhere()];
  const params = [...POSTED_INVOICE_STATUSES];
  // Only open balances
  const where = `WHERE ${conds.join(' AND ')}`;
  // Build bucket CASE expression
  const bucketCases = buckets.map((days, i) => {
    const prev = i === 0 ? 0 : buckets[i - 1] + 1;
    return `SUM(CASE WHEN julianday('${date}') - julianday(d.doc_date) BETWEEN ${prev} AND ${days} THEN balance ELSE 0 END) AS bucket_${prev}_${days}`;
  }).join(', ');
  return {
    sql: `
      SELECT p.id AS party_id, p.code AS party_code, p.display_name AS party_name,
             SUM(balance) AS total_balance,
             ${bucketCases}
      FROM (
        SELECT d.id, d.doc_date, d.grand_total,
               d.grand_total - COALESCE(SUM(pa.amount), 0) AS balance,
               d.party_id
        FROM documents d
        LEFT JOIN payment_allocations pa ON pa.document_id = d.id AND pa.document_type = 'sales_invoice'
        ${where}
        GROUP BY d.id
        HAVING balance > 0
      ) d
      JOIN parties p ON p.id = d.party_id
      GROUP BY p.id
      ORDER BY total_balance DESC
    `,
    params,
  };
}

module.exports = {
  POSTED_INVOICE_STATUSES,
  customerBalances,
  overdueAmounts,
  paymentHistory,
  agingReport,
};
