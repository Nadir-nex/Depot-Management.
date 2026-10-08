'use strict';
// Sales workflow (Phase 13): quote → order → delivery → invoice on the P12
// engine. Conversion copies snapshots with source links (header + line);
// fulfillment posts stock inside the delivery posting transaction via the
// engine's postEffects hook; invoicing is financial only (receivables derive
// from posted invoices). Orders and quotes never touch stock — asserted.
//
// Anti-double rules (all inside posting transactions):
// - a delivery line cannot exceed its order line's remaining quantity;
// - an invoice line cannot exceed its delivery line's remaining quantity;
// - a delivery posts stock exactly once (status-guarded + effects-required).
const { ConflictError, NotFoundError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { MAIN_WAREHOUSE_CODE } = require('../domain/vocabulary');
const { todayDateString, isExpired } = require('../domain/dates');
const { validateSerialCode } = require('../domain/catalog');
const { createProductRepository } = require('../data/productRepository');
const { createLotRepository, createSerialRepository } = require('../data/lotRepository');
const { createWarehouseRepository, createStockRepository, createAuditRepository } = require('../data/stockRepository');
const { createReservationRepository } = require('../data/loadingRepository');
const { createRouteStopRepository } = require('../data/logisticsRepository');
const { createDocumentLineRepository } = require('../data/documentRepository');
const documentsApp = require('./documents');
const { tryClaimOperationKey, IDEMPOTENCY_TYPES } = require('./idempotency');
const { withTransaction } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Conversion matrix: source type → allowed target types with the source
// status each requires. Anything else is rejected, no silent paths.
const CONVERSIONS = Object.freeze({
  sales_quote: Object.freeze({ sales_order: 'confirmed' }),
  sales_order: Object.freeze({ delivery_note: 'posted' }),
  delivery_note: Object.freeze({ sales_invoice: 'posted' }),
});

function conversionTargets(sourceType) {
  const entry = CONVERSIONS[sourceType];
  if (!entry) throw new ValidationError(`${sourceType} cannot be converted`);
  return entry;
}

// Remaining quantity on a source line: ordered minus consumed by
// non-cancelled documents (excluding one document, e.g. the one posting).
function remainingOfSourceLine(db, sourceLineId, excludeDocumentId = null) {
  const lines = createDocumentLineRepository(db);
  const source = lines.getById(sourceLineId);
  const used = lines.consumedOfSourceLine(sourceLineId, excludeDocumentId);
  return { source, remaining: source.qty - used };
}

// Copies a source document's lines onto a new document of targetType.
// quantities: [{ sourceLineId, qty }] — every source line covered exactly
// once unless partial is true (then a subset with reduced quantities).
// Prices/discounts copy as new snapshots (the quote promise honored).
function convertDocument(db, sourceId, targetType, { quantities = null, partial = false, warehouseId = null, warehouseCode = null, docDate = null, notes = '', actor = 'system' } = {}) {
  const sourceHead = documentsApp.getDocument(db, sourceId);
  const allowed = conversionTargets(sourceHead.docType);
  if (!allowed[targetType]) throw new ValidationError(`${sourceHead.docType} cannot convert to ${targetType}`);
  const source = sourceHead;
  if (warehouseId === null || warehouseId === undefined) {
    const code = cleanText(warehouseCode);
    if (code !== '') {
      const w = createWarehouseRepository(db).getByCode(code);
      if (!w) throw new NotFoundError(`warehouse ${code} not found`);
      warehouseId = w.id;
    }
  }
  if (targetType === 'delivery_note' && (warehouseId === null || warehouseId === undefined) && (source.warehouseId === null || source.warehouseId === undefined)) {
    throw new ValidationError('delivery needs a warehouse (pass warehouseId)');
  }
  if (source.status !== allowed[targetType]) {
    throw new StateError(`source must be ${allowed[targetType]} (is ${source.status})`);
  }
  const auth = normalizeAuth(actor);
  return withTransaction(db, () => {
    const specs = quantities || source.lines.map((l) => ({ sourceLineId: l.id, qty: l.qty }));
    if (!Array.isArray(specs) || specs.length === 0) throw new ValidationError('conversion needs at least one line');
    if (!partial && specs.length !== source.lines.length) {
      throw new ValidationError('full conversion must cover every source line (or pass partial: true)');
    }
    const seen = new Set();
    for (const s of specs) {
      if (!s || typeof s !== 'object') throw new ValidationError('invalid conversion line');
      if (seen.has(s.sourceLineId)) throw new ValidationError('duplicate source line in conversion');
      seen.add(s.sourceLineId);
      const { source: src, remaining } = remainingOfSourceLine(db, s.sourceLineId);
      if (src.document_id !== sourceId) throw new ValidationError('conversion line belongs to another document');
      if (!Number.isInteger(s.qty) || s.qty <= 0) throw new ValidationError('conversion qty must be a positive integer');
      if (s.qty > remaining) throw new StateError(`only ${remaining} remaining on source line ${src.line_no}`);
    }
    const header = documentsApp.createDocument(db, {
      type: targetType,
      partyId: source.partyId,
      warehouseId: warehouseId !== null && warehouseId !== undefined ? warehouseId : source.warehouseId,
      docDate: docDate || undefined,
      notes: cleanText(notes).slice(0, 2000) || `Converted from ${source.docNo}`,
      sourceDocId: sourceId,
      lines: [],
    }, auth);
    for (const s of specs) {
      const src = createDocumentLineRepository(db).getById(s.sourceLineId);
      documentsApp.addLine(db, header.id, {
        productId: src.product_id,
        description: src.description,
        qty: s.qty,
        unitCode: src.unit_code,
        packId: src.pack_id,
        unitPrice: src.unit_price,
        discountAmount: Math.min(src.discount_amount, s.qty * src.unit_price),
        taxClass: src.tax_class,
        sourceLineId: src.id,
      }, auth);
    }
    return documentsApp.getDocument(db, header.id);
  });
}

function convertDeliveriesToInvoice(db, deliveryIds, { docDate = null, notes = '', actor = 'system' } = {}) {
  if (!Array.isArray(deliveryIds) || deliveryIds.length === 0) throw new ValidationError('at least one delivery is required');
  const first = documentsApp.getDocument(db, deliveryIds[0]);
  if (first.docType !== 'delivery_note') throw new ValidationError('only delivery notes invoice this way');
  const auth = normalizeAuth(actor);
  return withTransaction(db, () => {
    // Pre-validate everything BEFORE creating the header so a no-op
    // conversion leaves no empty draft behind.
    const plan = [];
    for (const deliveryId of deliveryIds) {
      const delivery = documentsApp.getDocument(db, deliveryId);
      if (delivery.docType !== 'delivery_note') throw new ValidationError('only delivery notes invoice this way');
      if (delivery.status !== 'posted') throw new StateError(`delivery ${delivery.docNo} is ${delivery.status}, only posted deliveries invoice`);
      if (delivery.partyId !== first.partyId) throw new ValidationError('all deliveries must belong to the same customer');
      for (const line of delivery.lines) {
        const { remaining } = remainingOfSourceLine(db, line.id);
        if (remaining > 0) plan.push({ delivery, line, qty: remaining });
      }
    }
    if (plan.length === 0) throw new ValidationError('nothing left to invoice on these deliveries');
    const header = documentsApp.createDocument(db, {
      type: 'sales_invoice', partyId: first.partyId,
      docDate: docDate || undefined,
      notes: cleanText(notes).slice(0, 2000) || `Invoiced from ${deliveryIds.length} deliver${deliveryIds.length === 1 ? 'y' : 'ies'}`,
      sourceDocId: deliveryIds.length === 1 ? deliveryIds[0] : null,
      lines: [],
    }, auth);
    for (const { line, qty } of plan) {
      documentsApp.addLine(db, header.id, {
        productId: line.product_id, description: line.description, qty,
        unitCode: line.unit_code, packId: line.pack_id, unitPrice: line.unit_price,
        discountAmount: Math.min(line.discount_amount, qty * line.unit_price),
        taxClass: line.tax_class, sourceLineId: line.id,
      }, auth);
    }
    return documentsApp.getDocument(db, header.id);
  });
}

// Fulfillment effect for delivery posting: one 'issue' movement per line.
// Lots ride from the line; expired lots block; serial-tracked products move
// the exact serials given per line (serialsByLine: { lineId: [codes] }).
// Runs INSIDE the engine posting transaction — all lines or nothing.
function fulfillDelivery(db, delivery, lines, serialsByLine, actorName) {
  const stock = createStockRepository(db);
  const products = createProductRepository(db);
  const serials = createSerialRepository(db);
  const warehouse = delivery.warehouseId === null || delivery.warehouseId === undefined
    ? null
    : createWarehouseRepository(db).getById(delivery.warehouseId);
  if (!warehouse) throw new ValidationError('delivery needs a warehouse to post stock');
  if (warehouse.is_active !== 1) throw new StateError(`warehouse ${warehouse.code} is inactive`);
  const day = todayDateString();
  for (const line of lines) {
    const product = products.getById(line.product_id);
    if (product.productType === 'service') throw new StateError(`product ${product.sku} is a service and carries no stock`);
    let lotId = line.lot_id;
    if (lotId !== null && lotId !== undefined) {
      const lot = createLotRepository(db).getById(lotId);
      if (lot.product_id !== product.id) throw new ValidationError('delivery line lot belongs to another product');
      if (isExpired(lot.expiry_date, day)) throw new StateError(`lot ${lot.lot_no} expired on ${lot.expiry_date}`);
    } else {
      lotId = null;
    }
    const pool = stock.poolStock({ productId: product.id, warehouseId: warehouse.id, lotId });
    // Availability nets other routes' claims: a posted delivery cannot take
    // stock that route planning already promised elsewhere (P20 Model B).
    // Stops on the delivery's own routes don't block their own fulfillment.
    const ownRoutes = createRouteStopRepository(db).ofDocument(delivery.id).map((s) => s.route_id);
    const claimed = createReservationRepository(db).claimedByOthers({
      productId: product.id, warehouseId: warehouse.id, lotId, excludeRouteIds: ownRoutes,
    });
    if (pool - claimed < line.qty && !product.allowNegativeStock) {
      throw new StateError(`insufficient stock for ${product.sku} in ${warehouse.code}: need ${line.qty}, have ${pool - claimed} free`);
    }
    const movementId = stock.insertMovement({
      productId: product.id, warehouseId: warehouse.id, qty: -line.qty, lotId,
      movementType: 'issue', referenceType: 'delivery_note', referenceId: delivery.id,
      unitCost: 0, unitCode: line.unit_code || 'PCS',
      notes: `delivery ${delivery.docNo}`,
    });
    const codes = (serialsByLine && serialsByLine[line.id]) || [];
    if (product.serialTracking) {
      if (codes.length !== line.qty) throw new ValidationError(`line needs ${line.qty} serial(s), got ${codes.length}`);
      for (const code of codes) {
        const row = serials.findByProductAndCode(product.id, String(code).trim());
        if (!row) throw new NotFoundError(`serial ${code} is not registered for ${product.sku}`);
        if (row.status !== 'in_stock') throw new StateError(`serial ${code} is already out`);
        if (row.warehouse_id !== warehouse.id) throw new StateError(`serial ${code} is not in ${warehouse.code}`);
        const rowLot = row.lot_id === null ? null : row.lot_id;
        if (rowLot !== lotId) throw new ValidationError(`serial ${code} does not belong to the line lot`);
        serials.consume(row.id, movementId);
      }
    } else if (codes.length > 0) {
      throw new ValidationError(`product ${product.sku} is not serial-tracked`);
    }
  }
}

function postDeliveryNote(db, id, opts = {}, actorOrAuth = 'system') {
  const { serialsByLine = {}, operationKey = null } = opts;
  const auth = normalizeAuth(actorOrAuth);
  const current = documentsApp.getDocument(db, id);
  if (current.docType !== 'delivery_note') throw new ValidationError('postDeliveryNote handles delivery notes only');
  // Idempotency
  if (operationKey) {
    const claim = tryClaimOperationKey(db, 'post_delivery', operationKey, { entityId: id, entityType: 'document' });
    if (!claim.claimed) {
      const existing = claim.existing;
      throw new ConflictError(`duplicate post_delivery operation: key already used at ${existing.created_at} for entity ${existing.entity_id}`);
    }
  }
  return documentsApp.postDocument(db, id, auth, {
      operationKey: operationKey,
    postEffects: (txDb, delivery, lines) => fulfillDelivery(txDb, delivery, lines, serialsByLine, auth.actor),
  });
}

// Invoice posting guard: sourced lines cannot exceed their delivery lines'
// remaining quantities (recomputed here, inside the posting transaction).
function postInvoice(db, id, opts = {}, actorOrAuth = 'system') {
  const auth = normalizeAuth(actorOrAuth);
  const operationKey = opts.operationKey ?? null;
  const current = documentsApp.getDocument(db, id);
  if (current.docType !== 'sales_invoice') throw new ValidationError('postInvoice handles sales invoices only');
  // Idempotency
  if (operationKey) {
    const claim = tryClaimOperationKey(db, 'post_invoice', operationKey, { entityId: id, entityType: 'document' });
    if (!claim.claimed) {
      const existing = claim.existing;
      throw new ConflictError(`duplicate post_invoice operation: key already used at ${existing.created_at} for entity ${existing.entity_id}`);
    }
  }
  return documentsApp.postDocument(db, id, auth, {
      operationKey: operationKey,
    postEffects: (txDb) => {
      const lines = createDocumentLineRepository(txDb).ofDocument(id);
      for (const line of lines) {
        if (line.source_line_id === null || line.source_line_id === undefined) continue;
        const source = createDocumentLineRepository(txDb).getById(line.source_line_id);
        const used = createDocumentLineRepository(txDb).consumedOfSourceLine(line.source_line_id, id);
        if (used + line.qty > source.qty) {
          throw new StateError(`only ${source.qty - used} remaining on delivery line ${source.line_no}`);
        }
      }
    },
  });
}

module.exports = { convertDocument, convertDeliveriesToInvoice, postDeliveryNote, postInvoice, remainingOfSourceLine };
