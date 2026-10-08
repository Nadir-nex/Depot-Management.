'use strict';
// Document repositories (Phase 12): documents + document_lines. Status moves
// and total snapshots are written by the engine only; this layer maps rows.
const { NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function toDoc(r) {
  if (!r) return null;
  return {
    id: r.id, docNo: r.doc_no, docType: r.doc_type,
    partyId: r.party_id, sourceDocId: r.source_doc_id,
    docDate: r.doc_date, warehouseId: r.warehouse_id, status: r.status,
    subtotal: r.subtotal, discountTotal: r.discount_total,
    docDiscountAmount: r.doc_discount_amount,
    taxTotal: r.tax_total, grandTotal: r.grand_total,
    currency: r.currency, notes: r.notes,
    postedAt: r.posted_at, cancelledAt: r.cancelled_at, cancelReason: r.cancel_reason,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function createDocumentRepository(db) {
  return {
    insert({ docNo, docType, partyId, sourceDocId, docDate, warehouseId, docDiscountAmount = 0, notes }) {
      const now = utcNowIso();
      const info = db.prepare(
        `INSERT INTO documents
           (doc_no, doc_type, party_id, source_doc_id, doc_date, warehouse_id,
            status, doc_discount_amount, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
      ).run(docNo, docType, partyId, sourceDocId, docDate, warehouseId, docDiscountAmount, notes, now, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`document ${id} not found`);
      return toDoc(r);
    },
    getByNo(docNo) {
      return toDoc(db.prepare('SELECT * FROM documents WHERE doc_no = ?').get(docNo));
    },
    list({ docType = null, status = null, partyId = null, limit = 200 } = {}) {
      const conds = [];
      const params = [];
      if (docType) { conds.push('doc_type = ?'); params.push(docType); }
      if (status) { conds.push('status = ?'); params.push(status); }
      if (partyId !== null && partyId !== undefined) { conds.push('party_id = ?'); params.push(partyId); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(`SELECT * FROM documents ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit).map(toDoc);
    },
    updateDraft(id, { notes, docDate, partyId, warehouseId, docDiscountAmount }) {
      const sets = [];
      const params = [];
      if (notes !== undefined) { sets.push('notes = ?'); params.push(notes); }
      if (docDate !== undefined) { sets.push('doc_date = ?'); params.push(docDate); }
      if (partyId !== undefined) { sets.push('party_id = ?'); params.push(partyId); }
      if (warehouseId !== undefined) { sets.push('warehouse_id = ?'); params.push(warehouseId); }
      if (docDiscountAmount !== undefined) { sets.push('doc_discount_amount = ?'); params.push(docDiscountAmount); }
      if (sets.length === 0) throw new NotFoundError(`document ${id} not found`);
      sets.push('updated_at = ?');
      params.push(utcNowIso(), id);
      const info = db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (info.changes === 0) throw new NotFoundError(`document ${id} not found`);
      return this.getById(id);
    },
    setStatus(id, status, { postedAt = null, cancelledAt = null, cancelReason = '' } = {}) {
      const info = db.prepare(
        'UPDATE documents SET status = ?, posted_at = ?, cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE id = ?'
      ).run(status, postedAt, cancelledAt, cancelReason, utcNowIso(), id);
      if (info.changes === 0) throw new NotFoundError(`document ${id} not found`);
      return this.getById(id);
    },
    setTotals(id, { subtotal, discountTotal, taxTotal, grandTotal }) {
      db.prepare(
        'UPDATE documents SET subtotal = ?, discount_total = ?, tax_total = ?, grand_total = ?, updated_at = ? WHERE id = ?'
      ).run(subtotal, discountTotal, taxTotal, grandTotal, utcNowIso(), id);
      return this.getById(id);
    },
    nextDailySequence(prefix) {
      return Number(db.prepare('SELECT COUNT(*) AS n FROM documents WHERE doc_no LIKE ?').get(`${prefix}%`).n) + 1;
    },
  };
}

function createDocumentLineRepository(db) {
  return {
    insert({ documentId, lineNo, productId, description, qty, unitCode, packId, unitPrice, discountAmount, taxClass, lineTotal, lotId, sourceLineId = null, notes }) {
      const info = db.prepare(
        `INSERT INTO document_lines
           (document_id, line_no, product_id, description, qty, unit_code, pack_id,
            unit_price, discount_amount, tax_class, line_total, lot_id, source_line_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(documentId, lineNo, productId, description, qty, unitCode, packId,
        unitPrice, discountAmount, taxClass, lineTotal, lotId, sourceLineId, notes);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM document_lines WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`document line ${id} not found`);
      return r;
    },
    ofDocument(documentId) {
      return db.prepare(
        `SELECT l.*, p.sku AS product_sku FROM document_lines l
         JOIN products p ON p.id = l.product_id
         WHERE l.document_id = ? ORDER BY l.line_no`
      ).all(documentId);
    },
    nextLineNo(documentId) {
      const r = db.prepare('SELECT COALESCE(MAX(line_no), 0) AS m FROM document_lines WHERE document_id = ?').get(documentId);
      return Number(r.m) + 1;
    },
    // Quantity already consumed from a source line by non-cancelled documents
    // (optionally excluding one document, e.g. the one being posted).
    consumedOfSourceLine(sourceLineId, excludeDocumentId = null) {
      const r = excludeDocumentId === null || excludeDocumentId === undefined
        ? db.prepare(
            `SELECT COALESCE(SUM(l.qty), 0) AS used FROM document_lines l
             JOIN documents d ON d.id = l.document_id
             WHERE l.source_line_id = ? AND d.status != 'cancelled'`
          ).get(sourceLineId)
        : db.prepare(
            `SELECT COALESCE(SUM(l.qty), 0) AS used FROM document_lines l
             JOIN documents d ON d.id = l.document_id
             WHERE l.source_line_id = ? AND d.status != 'cancelled' AND l.document_id != ?`
          ).get(sourceLineId, excludeDocumentId);
      return r.used;
    },
    update(id, { description, qty, unitCode, packId, unitPrice, discountAmount, taxClass, lineTotal, lotId, notes }) {
      const info = db.prepare(
        `UPDATE document_lines SET description = ?, qty = ?, unit_code = ?, pack_id = ?,
          unit_price = ?, discount_amount = ?, tax_class = ?, line_total = ?, lot_id = ?, notes = ?
         WHERE id = ?`
      ).run(description, qty, unitCode, packId, unitPrice, discountAmount, taxClass, lineTotal, lotId, notes, id);
      if (info.changes === 0) throw new NotFoundError(`document line ${id} not found`);
      return this.getById(id);
    },
    remove(id) {
      const info = db.prepare('DELETE FROM document_lines WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`document line ${id} not found`);
      return true;
    },
  };
}

module.exports = { createDocumentRepository, createDocumentLineRepository };
