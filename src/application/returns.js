'use strict';
// Returns engine (Phase 15). Commercial corrections as first-class records:
// customer returns ride engine customer_return documents (draft → confirmed →
// posted, stock comes back IN at posting); supplier returns post ledger-level
// purchase_return movements against their receipt (receipts predate the
// document engine, so their returns live at the same level as receipt
// cancellations). Nothing is ever deleted or edited in place; every
// compensating record points at its original. Money application of returns
// (receivable/credit notes) arrives in P16 — these flows restore STOCK and
// record LINKS; P16 consumes them.
const { StateError, NotFoundError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { validateReasonCode, validateSerialCode } = require('../domain/catalog');
const { createProductRepository } = require('../data/productRepository');
const { createLotRepository, createSerialRepository } = require('../data/lotRepository');
const { createWarehouseRepository, createStockRepository, createReceiptRepository, createAuditRepository } = require('../data/stockRepository');
const { createDocumentLineRepository } = require('../data/documentRepository');
const documentsApp = require('./documents');
const { remainingOfSourceLine } = require('./sales');
const { withTransaction } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Draft a customer return against a POSTED delivery. lines:
// [{ sourceLineId, qty, lotId? }] — qty bounded by the delivery line's
// remaining quantity (delivered minus already-returned, non-cancelled).
function createCustomerReturn(db, deliveryId, { lines, warehouseId = null, notes = '', actor = 'system' } = {}) {
  const auth = normalizeAuth(actor);
  const delivery = documentsApp.getDocument(db, deliveryId);
  if (delivery.docType !== 'delivery_note') throw new ValidationError('customer returns source posted delivery notes');
  if (delivery.status !== 'posted') throw new StateError(`delivery ${delivery.docNo} is ${delivery.status}: only posted deliveries return`);
  if (!Array.isArray(lines) || lines.length === 0) throw new ValidationError('return needs at least one line');
  return withTransaction(db, () => {
    const header = documentsApp.createDocument(db, {
      type: 'customer_return', partyId: delivery.partyId,
      warehouseId: warehouseId !== null && warehouseId !== undefined ? warehouseId : delivery.warehouseId,
      notes: cleanText(notes).slice(0, 2000) || `Return of ${delivery.docNo}`,
      sourceDocId: deliveryId, lines: [],
    }, auth);
    const seen = new Set();
    for (const [i, l] of lines.entries()) {
      if (!l || typeof l !== 'object') throw new ValidationError(`return line ${i + 1}: invalid`);
      if (seen.has(l.sourceLineId)) throw new ValidationError('duplicate source line in return');
      seen.add(l.sourceLineId);
      const { source, remaining } = remainingOfSourceLine(db, l.sourceLineId);
      if (source.document_id !== deliveryId) throw new ValidationError('return line belongs to another document');
      const qty = l.qty;
      if (!Number.isInteger(qty) || qty <= 0) throw new ValidationError('return qty must be a positive integer');
      if (qty > remaining) throw new StateError(`only ${remaining} remaining to return on delivery line ${source.line_no}`);
      let lotId = l.lotId ?? l.lot_id ?? null;
      if (lotId !== null && lotId !== undefined) {
        const lot = createLotRepository(db).getById(lotId);
        if (lot.product_id !== source.product_id) throw new ValidationError('return lot belongs to another product');
        lotId = lot.id;
      } else {
        lotId = null;
      }
      documentsApp.addLine(db, header.id, {
        productId: source.product_id, description: source.description, qty,
        unitCode: source.unit_code, packId: source.pack_id, unitPrice: source.unit_price,
        discountAmount: Math.min(source.discount_amount, qty * source.unit_price),
        taxClass: source.tax_class, lotId, sourceLineId: source.id,
      }, auth);
    }
    return documentsApp.getDocument(db, header.id);
  });
}

// Posts a customer return: stock comes back IN (sales_return movements) and
// OUT serials given per line come back to stock, linked to the movement.
// reason is required here — it lands on every movement + the audit record.
function postCustomerReturn(db, id, { reason, serialsByLine = {}, actor = 'system' } = {}) {
  const auth = normalizeAuth(actor);
  const why = validateReasonCode(reason);
  const current = documentsApp.getDocument(db, id);
  if (current.docType !== 'customer_return') throw new ValidationError('postCustomerReturn handles customer returns only');
  return documentsApp.postDocument(db, id, auth, {
    postEffects: (txDb, ret, lines) => {
      const stock = createStockRepository(txDb);
      const products = createProductRepository(txDb);
      const serials = createSerialRepository(txDb);
      const warehouse = ret.warehouseId === null || ret.warehouseId === undefined
        ? null : createWarehouseRepository(txDb).getById(ret.warehouseId);
      if (!warehouse) throw new ValidationError('return needs a warehouse to land stock');
      if (warehouse.is_active !== 1) throw new StateError(`warehouse ${warehouse.code} is inactive`);
      for (const line of lines) {
        const product = products.getById(line.product_id);
        const movementId = stock.insertMovement({
          productId: product.id, warehouseId: warehouse.id, qty: line.qty, lotId: line.lot_id,
          movementType: 'sales_return', reasonCode: why,
          referenceType: 'customer_return', referenceId: ret.id,
          unitCost: 0, unitCode: line.unit_code || 'PCS',
          notes: `return ${ret.docNo}`,
        });
        const codes = (serialsByLine && serialsByLine[line.id]) || [];
        if (product.serialTracking) {
          if (codes.length !== line.qty) throw new ValidationError(`line needs ${line.qty} serial(s), got ${codes.length}`);
          for (const rawCode of codes) {
            const code = validateSerialCode(rawCode);
            const row = serials.findByProductAndCode(product.id, code);
            if (!row) throw new NotFoundError(`serial ${code} is not registered for ${product.sku}`);
            if (row.status !== 'out') throw new StateError(`serial ${code} is already in stock`);
            const rowLot = row.lot_id === null ? null : row.lot_id;
            if (rowLot !== line.lot_id) throw new ValidationError(`serial ${code} does not belong to the line lot`);
            serials.restore(row.id, warehouse.id, movementId);
          }
        } else if (codes.length > 0) {
          throw new ValidationError(`product ${product.sku} is not serial-tracked`);
        }
      }
    },
  });
}

// Sends goods back to the supplier against a POSTED receipt. Ledger-level by
// design (receipts predate the document engine): purchase_return movements
// reference the receipt, bounded by its remaining quantity. Serials in stock
// at the receipt warehouse go out with the movement.
function returnToSupplier(db, args = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'purchases.cancel');
  const reason = validateReasonCode(args.reasonCode ?? args.reason_code ?? args.reason);
  const qty = args.qty;
  if (!Number.isInteger(qty) || qty <= 0) throw new ValidationError('return qty must be a positive integer');
  const serialCodes = Array.isArray(args.serials) ? args.serials.map(validateSerialCode) : [];
  if (serialCodes.length !== new Set(serialCodes).size) throw new ValidationError('duplicate serial codes');
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const warehouses = createWarehouseRepository(db);
    const stock = createStockRepository(db);
    const serials = createSerialRepository(db);
    const receipts = createReceiptRepository(db);
    const receiptId = args.receiptId ?? args.receipt_id;
    if (receiptId === undefined || receiptId === null) throw new ValidationError('supplier returns reference their receipt');
    const receipt = receipts.getById(receiptId);
    if (receipt.status !== 'posted') throw new StateError(`receipt is ${receipt.status}: only posted receipts return stock`);
    const product = args.productId !== undefined && args.productId !== null
      ? products.getById(args.productId) : products.getBySku(args.sku);
    if (!product && args.sku) throw new NotFoundError(`product sku ${args.sku} not found`);
    if (!product) throw new ValidationError('a product (productId or sku) is required');
    if (!product.isActive) throw new StateError(`product ${product.sku} is inactive`);
    if (product.productType === 'service') throw new StateError(`product ${product.sku} is a service and carries no stock`);
    const warehouse = warehouses.getById(receipt.warehouse_id);
    if (warehouse.is_active !== 1) throw new StateError(`warehouse ${warehouse.code} is inactive`);
    let lotId = args.lotId ?? args.lot_id ?? null;
    if (lotId !== null && lotId !== undefined) {
      const lot = createLotRepository(db).getById(lotId);
      if (lot.product_id !== product.id) throw new ValidationError('return lot belongs to another product');
      lotId = lot.id;
    } else {
      lotId = null;
    }
    // Remaining on this receipt for this product+lot pool: received minus
    // already returned (purchase_return movements reference their receipt).
    const receiptLines = receipts.linesOf(receiptId).filter((l) => l.product_id === product.id && (l.lot_id || null) === lotId);
    const received = receiptLines.reduce((n, l) => n + l.qty, 0);
    if (received === 0) throw new StateError('this receipt contains none of that product/lot');
    const already = stock.ofReference('purchase_receipt', receiptId)
      .filter((m) => m.movement_type === 'purchase_return' && m.product_id === product.id && (m.lot_id || null) === lotId)
      .reduce((n, m) => n + Math.abs(m.qty), 0);
    if (already + qty > received) throw new StateError(`only ${received - already} remaining to return on this receipt`);
    assertPoolSufficientLocal(stock, product, warehouse, lotId, -qty);
    const movementId = stock.insertMovement({
      productId: product.id, warehouseId: warehouse.id, qty: -qty, lotId,
      movementType: 'purchase_return', reasonCode: reason,
      referenceType: 'purchase_receipt', referenceId: receiptId,
      notes: `supplier return (${reason})`,
    });
    if (product.serialTracking) {
      if (serialCodes.length !== qty) throw new ValidationError(`return needs ${qty} serial(s), got ${serialCodes.length}`);
      for (const code of serialCodes) {
        const row = serials.findByProductAndCode(product.id, code);
        if (!row) throw new NotFoundError(`serial ${code} is not registered for ${product.sku}`);
        if (row.status !== 'in_stock') throw new StateError(`serial ${code} is already out`);
        if (row.warehouse_id !== warehouse.id) throw new StateError(`serial ${code} is not in ${warehouse.code}`);
        serials.consume(row.id, movementId);
      }
    } else if (serialCodes.length > 0) {
      throw new ValidationError(`product ${product.sku} is not serial-tracked`);
    }
    createAuditRepository(db).append({ actor: auth.actor, operation: 'stock.supplier_return', entityType: 'purchase_receipt', entityId: receiptId, details: `sku=${product.sku} qty=${qty}`, reason, referenceNo: product.sku });
    return stock.getMovement(movementId);
  });
}

function assertPoolSufficientLocal(stock, product, warehouse, lotId, delta) {
  const pool = stock.poolStock({ productId: product.id, warehouseId: warehouse.id, lotId });
  if (pool + delta < 0 && !product.allowNegativeStock) {
    throw new StateError(`insufficient stock for ${product.sku} in ${warehouse.code}: have ${pool}`);
  }
}

module.exports = { createCustomerReturn, postCustomerReturn, returnToSupplier };
