'use strict';
// Generic commercial document engine (Phase 12). The backbone P13+ flows
// inherit: drafts are freely editable, confirmation freezes intent, posting
// freezes money snapshots, cancellation needs a reason. Posting here is
// DOCUMENT posting only — stock and payment effects are separate ledgers
// owned by later phases and never inferred from status.
const { ConflictError, NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const {
  validateDocType,
  TYPE_PERMISSIONS,
  DOC_PREFIXES,
  assertTransition,
  validateDocDate,
  validateDocDiscount,
  validateLineInput,
  computeTotals,
} = require('../domain/documents');
const { createProductRepository } = require('../data/productRepository');
const { createPackRepository } = require('../data/catalogRepository');
const { createLotRepository } = require('../data/lotRepository');
const { createPartyRepository, createPartyRoleRepository } = require('../data/partyRepository');
const { createWarehouseRepository, createAuditRepository } = require('../data/stockRepository');
const { createDocumentRepository, createDocumentLineRepository } = require('../data/documentRepository');
const { withTransaction, utcNowIso } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

// Sales-family documents face customers, purchase-family face suppliers.
// A party given on the wrong family is rejected (never silently accepted).
const CUSTOMER_FACING = ['sales_quote', 'sales_order', 'delivery_note', 'sales_invoice', 'proforma_invoice', 'customer_return'];
const SUPPLIER_FACING = ['purchase_order', 'purchase_receipt', 'supplier_return'];

function resolveParty(db, type, partyId) {
  if (partyId === undefined || partyId === null) return null;
  const party = createPartyRepository(db).getById(partyId);
  const roles = createPartyRoleRepository(db).ofParty(partyId);
  const need = CUSTOMER_FACING.includes(type) ? 'customer' : 'supplier';
  if (!roles.includes(need)) throw new StateError(`party ${party.code} is not a ${need}`);
  if (!party.isActive) throw new StateError(`party ${party.code} is inactive`);
  return party;
}

function resolveWarehouse(db, warehouseId) {
  if (warehouseId === undefined || warehouseId === null) return null;
  return createWarehouseRepository(db).getById(warehouseId);
}

function resolveSource(db, sourceDocId) {
  if (sourceDocId === undefined || sourceDocId === null) return null;
  return createDocumentRepository(db).getById(sourceDocId);
}

function buildDocNo(docs, type, requested) {
  const r = cleanText(requested);
  if (r) {
    if (r.length > 32) throw new ValidationError('doc_no must be at most 32 characters');
    return r;
  }
  const day = utcNowIso().slice(0, 10).replace(/-/g, '');
  const prefix = `${DOC_PREFIXES[type]}-${day}-`;
  return `${prefix}${String(docs.nextDailySequence(prefix)).padStart(4, '0')}`;
}

// Line references resolved once at write time and snapshotted: description
// defaults to the product name, tax class to the product's, price stays
// exactly as passed (P13 resolves tariffs BEFORE calling the engine).
function resolveLineRefs(db, input) {
  const productId = input.productId ?? null;
  if (productId === null || productId === undefined) throw new ValidationError('line must reference a product');
  const product = createProductRepository(db).getById(productId);
  let packId = input.packId ?? null;
  if (packId !== null && packId !== undefined) {
    const pack = createPackRepository(db).getById(packId);
    if (pack.product_id !== product.id) throw new ValidationError('pack belongs to a different product');
    packId = pack.id;
  } else {
    packId = null;
  }
  let lotId = input.lotId ?? null;
  if (lotId !== null && lotId !== undefined) {
    const lot = createLotRepository(db).getById(lotId);
    if (lot.product_id !== product.id) throw new ValidationError('lot belongs to a different product');
    lotId = lot.id;
  } else {
    lotId = null;
  }
  return {
    product,
    description: input.description || product.name,
    taxClass: input.taxClass && input.taxClass !== 'standard' ? input.taxClass : product.taxClass,
    packId,
    lotId,
    lineTotal: input.qty * input.unitPrice - input.discountAmount,
  };
}

function permFor(type, action) {
  const entry = TYPE_PERMISSIONS[type];
  if (!entry) throw new ValidationError(`unknown document type: ${type}`);
  return entry[action];
}

function createDocument(db, raw = {}, actorOrAuth = 'system') {
  const type = validateDocType(raw.type ?? raw.doc_type);
  const auth = requirePermission(normalizeAuth(actorOrAuth), permFor(type, 'create'));
  return withTransaction(db, () => {
    const docs = createDocumentRepository(db);
    const lines = createDocumentLineRepository(db);
    const party = resolveParty(db, type, raw.partyId ?? raw.party_id);
    const warehouse = resolveWarehouse(db, raw.warehouseId ?? raw.warehouse_id);
    const source = resolveSource(db, raw.sourceDocId ?? raw.source_doc_id);
    let doc;
    try {
      doc = docs.insert({
        docNo: buildDocNo(docs, type, raw.docNo ?? raw.doc_no),
        docType: type,
        partyId: party ? party.id : null,
        sourceDocId: source ? source.id : null,
        docDate: validateDocDate(raw.docDate ?? raw.doc_date),
        warehouseId: warehouse ? warehouse.id : null,
        docDiscountAmount: validateDocDiscount(raw.docDiscountAmount ?? raw.doc_discount_amount),
        notes: cleanText(raw.notes ?? '').slice(0, 2000),
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('document number already exists (duplicate submission?)');
      throw err;
    }
    const inputLines = raw.lines ?? [];
    if (!Array.isArray(inputLines)) throw new ValidationError('lines must be an array');
    for (const rawLine of inputLines) {
      const input = validateLineInput(rawLine);
      const refs = resolveLineRefs(db, input);
      lines.insert({
        documentId: doc.id, lineNo: lines.nextLineNo(doc.id), productId: refs.product.id,
        description: refs.description, qty: input.qty, unitCode: input.unitCode, packId: refs.packId,
        unitPrice: input.unitPrice, discountAmount: input.discountAmount, taxClass: refs.taxClass,
        lineTotal: refs.lineTotal, lotId: refs.lotId, notes: input.notes,
      });
    }
    createAuditRepository(db).append({ actor: auth.actor, operation: 'document.create', entityType: 'document', entityId: doc.id, details: `${type} draft`, referenceNo: doc.docNo });
    return getDocument(db, doc.id);
  });
}

function getDocument(db, id) {
  const doc = createDocumentRepository(db).getById(id);
  const lines = createDocumentLineRepository(db).ofDocument(id);
  const draftTotals = computeTotals(lines.map((l) => ({ qty: l.qty, unit_price: l.unit_price, discount_amount: l.discount_amount })), doc.docDiscountAmount);
  return { ...doc, lines, draftTotals };
}

function listDocuments(db, opts) {
  return createDocumentRepository(db).list(opts);
}

function assertDraft(doc) {
  if (doc.status !== 'draft') throw new StateError(`document ${doc.docNo} is ${doc.status}: only drafts are editable`);
}

function updateDocument(db, id, raw = {}, actorOrAuth = 'system') {
  const current = createDocumentRepository(db).getById(id);
  const auth = requirePermission(normalizeAuth(actorOrAuth), permFor(current.docType, 'create'));
  assertDraft(current);
  return withTransaction(db, () => {
    const party = raw.partyId !== undefined || raw.party_id !== undefined
      ? resolveParty(db, current.docType, raw.partyId ?? raw.party_id) : undefined;
    const warehouse = raw.warehouseId !== undefined || raw.warehouse_id !== undefined
      ? resolveWarehouse(db, raw.warehouseId ?? raw.warehouse_id) : undefined;
    const updated = createDocumentRepository(db).updateDraft(id, {
      notes: raw.notes !== undefined ? cleanText(raw.notes).slice(0, 2000) : undefined,
      docDate: raw.docDate !== undefined || raw.doc_date !== undefined ? validateDocDate(raw.docDate ?? raw.doc_date) : undefined,
      partyId: party === undefined ? undefined : (party ? party.id : null),
      warehouseId: warehouse === undefined ? undefined : (warehouse ? warehouse.id : null),
      docDiscountAmount: raw.docDiscountAmount !== undefined || raw.doc_discount_amount !== undefined
        ? validateDocDiscount(raw.docDiscountAmount ?? raw.doc_discount_amount) : undefined,
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'document.update', entityType: 'document', entityId: id, referenceNo: updated.docNo });
    return getDocument(db, id);
  });
}

function addLine(db, documentId, rawLine, actorOrAuth = 'system', opts = {}) {
  const current = createDocumentRepository(db).getById(documentId);
  const auth = requirePermission(normalizeAuth(actorOrAuth), permFor(current.docType, 'create'));
  assertDraft(current);
  const input = validateLineInput(rawLine);
  return withTransaction(db, () => {
    const lines = createDocumentLineRepository(db);
    const refs = resolveLineRefs(db, input);
    if (!refs.product) throw new ValidationError('line must reference a product');
    const sourceLineId = resolveSourceLine(db, documentId, rawLine.sourceLineId ?? rawLine.source_line_id);
    const row = lines.insert({
      documentId, lineNo: lines.nextLineNo(documentId), productId: refs.product.id,
      description: refs.description, qty: input.qty, unitCode: input.unitCode, packId: refs.packId,
      unitPrice: input.unitPrice, discountAmount: input.discountAmount, taxClass: refs.taxClass,
      lineTotal: refs.lineTotal, lotId: refs.lotId, sourceLineId, notes: input.notes,
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'document.line_add', entityType: 'document', entityId: documentId, details: `sku=${refs.product.sku} qty=${input.qty}`, referenceNo: current.docNo });
    return row;
  });
}

// Provenance link: the source line must exist on a DIFFERENT document.
// Quantity guards (no double delivery/invoicing) live in the sales service,
// which owns the business meaning of each conversion.
function resolveSourceLine(db, documentId, sourceLineId) {
  if (sourceLineId === undefined || sourceLineId === null) return null;
  const source = createDocumentLineRepository(db).getById(sourceLineId);
  if (source.document_id === documentId) throw new ValidationError('a line cannot source itself');
  return source.id;
}

function updateLine(db, lineId, rawLine, actorOrAuth = 'system') {
  const lines = createDocumentLineRepository(db);
  const existing = lines.getById(lineId);
  const current = createDocumentRepository(db).getById(existing.document_id);
  const auth = requirePermission(normalizeAuth(actorOrAuth), permFor(current.docType, 'create'));
  assertDraft(current);
  const input = validateLineInput({ ...existing, ...rawLine, productId: rawLine.productId ?? rawLine.product_id ?? existing.product_id });
  return withTransaction(db, () => {
    const refs = resolveLineRefs(db, input);
    const row = lines.update(lineId, {
      description: input.description || refs.description, qty: input.qty, unitCode: input.unitCode, packId: refs.packId,
      unitPrice: input.unitPrice, discountAmount: input.discountAmount, taxClass: refs.taxClass,
      lineTotal: refs.lineTotal, lotId: refs.lotId, notes: input.notes,
    });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'document.line_update', entityType: 'document', entityId: current.id, details: `line=${existing.line_no}`, referenceNo: current.docNo });
    return row;
  });
}

function removeLine(db, lineId, actorOrAuth = 'system') {
  const lines = createDocumentLineRepository(db);
  const existing = lines.getById(lineId);
  const current = createDocumentRepository(db).getById(existing.document_id);
  const auth = requirePermission(normalizeAuth(actorOrAuth), permFor(current.docType, 'create'));
  assertDraft(current);
  return withTransaction(db, () => {
    lines.remove(lineId);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'document.line_remove', entityType: 'document', entityId: current.id, details: `line=${existing.line_no}`, referenceNo: current.docNo });
    return true;
  });
}

function confirmDocument(db, id, actorOrAuth = 'system') {
  const current = createDocumentRepository(db).getById(id);
  const auth = requirePermission(normalizeAuth(actorOrAuth), permFor(current.docType, 'create'));
  assertTransition(current.docType, current.status, 'confirmed');
  return withTransaction(db, () => {
    const lines = createDocumentLineRepository(db).ofDocument(id);
    if (lines.length === 0) throw new ValidationError('cannot confirm a document with no lines');
    const updated = createDocumentRepository(db).setStatus(id, 'confirmed');
    createAuditRepository(db).append({ actor: auth.actor, operation: 'document.confirm', entityType: 'document', entityId: id, referenceNo: updated.docNo });
    return getDocument(db, id);
  });
}

// Posting freezes money: totals recompute from line snapshots and lock.
// Products re-resolve here: inactive products cannot post (history rule);
// the snapshot keeps whatever price the line carried.
//
// postEffects hook: runs INSIDE the posting transaction before the status
// flip so families can post their own effects atomically (delivery stock
// issue in P13). Delivery notes REQUIRE effects — posting one through the
// bare engine would silently skip stock, the exact P12 critical violation.
function postDocument(db, id, actorOrAuth = 'system', opts = {}) {
  const current = createDocumentRepository(db).getById(id);
  const auth = requirePermission(normalizeAuth(actorOrAuth), permFor(current.docType, 'post'));
  assertTransition(current.docType, current.status, 'posted');
  if (current.docType === 'delivery_note' && (!opts || typeof opts.postEffects !== 'function')) {
    throw new StateError('delivery notes post through the sales fulfillment flow (stock effects required)');
  }
  return withTransaction(db, () => {
    const docs = createDocumentRepository(db);
    const lines = createDocumentLineRepository(db).ofDocument(id);
    if (lines.length === 0) throw new ValidationError('cannot post a document with no lines');
    for (const l of lines) {
      const product = createProductRepository(db).getById(l.product_id);
      if (!product.isActive) throw new StateError(`product ${product.sku} is inactive and cannot post`);
    }
    if (opts && typeof opts.postEffects === 'function') opts.postEffects(db, current, lines);
    const fresh = docs.getById(id);
    const totals = computeTotals(lines, fresh.docDiscountAmount);
    docs.setTotals(id, totals);
    const updated = docs.setStatus(id, 'posted', { postedAt: utcNowIso() });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'document.post', entityType: 'document', entityId: id, details: `grand=${totals.grandTotal}`, after: `status=posted grand=${totals.grandTotal}`, referenceNo: updated.docNo });
    return getDocument(db, id);
  });
}

// Cancellation voids intent. Drafts/confirmed die quietly (reason kept);
// posted invoices void a posted claim cleanly (receivables derive from
// non-cancelled invoices, so the balance follows automatically). Posted
// DELIVERY notes cannot cancel here: stock already left, and only the P15
// returns/reversal engine may unwind that — cancelling would strand the
// ledger. P15 replaces this guard with reversal linkage.
function cancelDocument(db, id, reason = '', actorOrAuth = 'system') {
  const current = createDocumentRepository(db).getById(id);
  const auth = requirePermission(normalizeAuth(actorOrAuth), permFor(current.docType, 'cancel'));
  const why = cleanText(reason);
  if (!why) throw new ValidationError('a cancel reason is required');
  if (current.docType === 'delivery_note' && current.status === 'posted') {
    throw new StateError('posted delivery notes reverse through returns (P15), not cancellation');
  }
  assertTransition(current.docType, current.status, 'cancelled');
  return withTransaction(db, () => {
    const updated = createDocumentRepository(db).setStatus(id, 'cancelled', { cancelledAt: utcNowIso(), cancelReason: why.slice(0, 1000) });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'document.cancel', entityType: 'document', entityId: id, details: `was ${current.status}`, before: `status=${current.status}`, after: 'status=cancelled', reason: why.slice(0, 1000), referenceNo: updated.docNo });
    return getDocument(db, id);
  });
}

module.exports = {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  addLine,
  updateLine,
  removeLine,
  confirmDocument,
  postDocument,
  cancelDocument,
};
