'use strict';
// Purchase-side operations (Phase 14). Ordering intent itself rides the P12
// engine (purchase_order docs); this module owns intake linkage extras:
// supplier-invoice matching against posted receipts. Payable derivation stays
// goods-based (receipt lines); the match records the supplier's claim without
// a second ledger (a future accrual separation in P25 can promote these
// records as its migration source).
const { ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { assertMinorUnits } = require('../domain/money');
const { createReceiptRepository, createAuditRepository } = require('../data/stockRepository');
const { withTransaction } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Records the supplier's invoice claim against a POSTED receipt: number
// (required) + claimed total (optional, minor units). Cancelled receipts
// refuse matching — their payable already left with the reversal.
function recordSupplierInvoice(db, receiptId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'purchases.post');
  const invoiceNo = cleanText(raw.invoiceNo ?? raw.invoice_no);
  if (!invoiceNo) throw new ValidationError('supplier invoice number is required');
  if (invoiceNo.length > 64) throw new ValidationError('supplier invoice number must be at most 64 characters');
  const totalRaw = raw.total ?? raw.invoiceTotal ?? raw.invoice_total ?? null;
  let total = null;
  if (totalRaw !== null && totalRaw !== undefined && totalRaw !== '') {
    if (typeof totalRaw === 'string') throw new ValidationError('invoice total must be an integer in minor units');
    total = assertMinorUnits(totalRaw);
  }
  return withTransaction(db, () => {
    const receipts = createReceiptRepository(db);
    const updated = receipts.setSupplierInvoice(receiptId, { invoiceNo, total });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'purchase.invoice_record', entityType: 'purchase_receipt', entityId: receiptId, details: `invoice=${invoiceNo} total=${total}`, referenceNo: updated.receipt_no });
    return receipts.getById(receiptId);
  });
}

module.exports = { recordSupplierInvoice };
