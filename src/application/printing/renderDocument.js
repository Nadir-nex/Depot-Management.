'use strict';
// Render a document to a stable printable snapshot (Phase 23). Critical rule:
// the snapshot must be built from posted/immutable document data only — no live
// catalog/customer lookups that would rewrite historical output.
const { NotFoundError, StateError, ValidationError } = require('../../domain/errors');
const { createDocumentRepository, createDocumentLineRepository } = require('../../data/documentRepository');
const { createPartyRepository } = require('../../data/partyRepository');
const { createWarehouseRepository } = require('../../data/stockRepository');

function buildSnapshot(db, docId) {
  const docs = createDocumentRepository(db);
  const linesRepo = createDocumentLineRepository(db);

  const doc = docs.getById(docId);
  if (!doc) throw new NotFoundError(`document ${docId} not found`);

  // Use frozen snapshot from document (populated at post time) for historical stability
  const lines = linesRepo.ofDocument(docId);

  return {
    doc: {
      id: doc.id,
      docNo: doc.docNo,
      docType: doc.docType,
      status: doc.status,
      docDate: doc.docDate,
      currency: doc.currency,
      subtotal: doc.subtotal,
      discountTotal: doc.discountTotal,
      taxTotal: doc.taxTotal,
      grandTotal: doc.grandTotal,
      notes: doc.notes,
      postedAt: doc.postedAt,
      cancelledAt: doc.cancelledAt,
      cancelReason: doc.cancelReason,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      sourceDocId: doc.sourceDocId,
    },
    party: (doc.partyName && doc.partyName !== '')
      ? {
          name: doc.partyName,
          taxId: doc.partyTaxId || '',
          address: doc.partyAddress || '',
          email: doc.partyEmail || '',
          phone: doc.partyPhone || '',
        }
      : null,
    warehouse: (doc.warehouseCode && doc.warehouseCode !== '')
      ? {
          code: doc.warehouseCode,
          name: doc.warehouseName || '',
        }
      : null,
    lines: lines.map((l) => ({
      lineNo: l.line_no,
      productId: l.product_id,
      productSku: l.product_sku,
      description: l.description,
      qty: l.qty,
      unitCode: l.unit_code,
      packId: l.pack_id,
      unitPrice: l.unit_price,
      discountAmount: l.discount_amount,
      taxClass: l.tax_class,
      lineTotal: l.line_total,
      lotId: l.lot_id,
      sourceLineId: l.source_line_id,
      notes: l.notes,
    })),
  };
}

function renderDocument(db, docId, { requirePosted = false } = {}) {
  const snap = buildSnapshot(db, docId);
  if (requirePosted && snap.doc.status !== 'posted' && snap.doc.status !== 'paid' && snap.doc.status !== 'partially_paid') {
    throw new StateError(`document ${docId} must be posted to produce a historical print snapshot`);
  }
  return Object.freeze({ ...snap, renderedAt: new Date().toISOString() });
}

module.exports = { renderDocument, buildSnapshot };
