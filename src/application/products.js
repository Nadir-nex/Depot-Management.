'use strict';
// Product use-cases. Owns the transaction boundary for product writes and maps
// storage errors to the shared domain error contract. No Electron, no fs.
const { ConflictError, NotFoundError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { toProductInput, toProductUpdate } = require('../domain/products');
const { createProductRepository } = require('../data/productRepository');
const { createCategoryRepository, createBarcodeRepository } = require('../data/catalogRepository');
const { createAuditRepository } = require('../data/stockRepository');
const { withTransaction } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function describeUnique(err) {
  const msg = err.message || '';
  if (msg.includes('products.sku')) return 'sku already exists';
  // Any uniqueness failure on the single barcode table is a duplicate code
  // (note: the partial preferred-index reports as product_barcodes.product_id).
  if (msg.includes('product_barcodes')) return 'barcode already exists';
  return 'duplicate value violates a uniqueness rule';
}

// category_id is a live FK reference: null clears it, otherwise it must exist.
function resolveCategoryId(db, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const id = typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : raw;
  if (!Number.isInteger(id)) throw new ValidationError('category_id must be an integer or null');
  createCategoryRepository(db).getById(id); // throws NotFoundError when unknown
  return id;
}

function createProduct(db, rawInput, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  const input = toProductInput(rawInput);
  const categoryId = resolveCategoryId(db, rawInput.categoryId ?? rawInput.category_id);
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const audit = createAuditRepository(db);
    try {
      const created = products.insert({ ...input, categoryId });
      // The single barcode input becomes the preferred barcode row; every
      // lookup afterwards goes through product_barcodes (one system).
      if (input.barcode) {
        createBarcodeRepository(db).insert({ productId: created.id, code: input.barcode, preferred: true });
      }
      audit.append({ actor: auth.actor, operation: 'product.create', entityType: 'product', entityId: created.id, details: `sku=${created.sku}`, after: `sku=${created.sku} name=${created.name}`, referenceNo: created.sku });
      return products.getById(created.id);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError(describeUnique(err));
      throw err;
    }
  });
}

function listProducts(db, opts) {
  return createProductRepository(db).list(opts);
}

// Rewrites the preferred barcode row: null/empty clears it (a surviving row
// is promoted by the repository), a new code replaces it, same code = no-op.
function syncPreferredBarcode(db, productId, rawBarcode) {
  const { validateBarcode } = require('../domain/products');
  const next = validateBarcode(rawBarcode);
  const rows = createBarcodeRepository(db).listOfProduct(productId);
  const pref = rows.find((r) => r.is_preferred === 1) || null;
  if ((pref ? pref.code : null) === next) return;
  if (pref) createBarcodeRepository(db).remove(pref.id);
  if (next) createBarcodeRepository(db).insert({ productId, code: next, preferred: true });
}

// P05 catalog edit: validated subset, sku immutable, audited with before/after.
// barcode/categoryId ride along: barcode rewrites the preferred barcode row,
// categoryId re-links (null clears). Both stay inside the same transaction.
function updateProduct(db, id, rawFields, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  const fields = toProductUpdate(rawFields);
  const wantsBarcode = rawFields.barcode !== undefined;
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const before = products.getById(id);
    try {
      if (rawFields.categoryId !== undefined || rawFields.category_id !== undefined) {
        fields.categoryId = resolveCategoryId(db, rawFields.categoryId ?? rawFields.category_id);
      }
      const updated = Object.keys(fields).length > 0 ? products.update(id, fields) : before;
      if (wantsBarcode) syncPreferredBarcode(db, id, rawFields.barcode);
      const after = products.getById(id);
      const changed = Object.keys(fields).map((k) => `${k}: ${before[k]} → ${after[k]}`).join('; ').slice(0, 400);
      createAuditRepository(db).append({
        actor: auth.actor, operation: 'product.update', entityType: 'product', entityId: id,
        details: `sku=${before.sku} ${changed}`, before: `sku=${before.sku}`, after: changed,
        referenceNo: before.sku,
      });
      return after;
    } catch (err) {
      if (err && /UNIQUE constraint failed.*product_barcodes/i.test(err.message || '')) {
        throw new ConflictError('barcode already exists');
      }
      throw err;
    }
  });
}

function getProduct(db, id) {
  return createProductRepository(db).getById(id);
}

function setProductActive(db, id, active, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  return withTransaction(db, () => {
    const before = createProductRepository(db).getById(id);
    const updated = createProductRepository(db).setActive(id, active);
    createAuditRepository(db).append({
      actor: auth.actor, operation: active ? 'product.reactivate' : 'product.deactivate',
      entityType: 'product', entityId: id, details: `sku=${updated.sku}`,
      before: `isActive=${before.isActive}`, after: `isActive=${updated.isActive}`,
      referenceNo: updated.sku,
    });
    return updated;
  });
}

// Retention policy: history-bearing products are deactivated, never deleted.
// deleteProduct() hard-deletes only unreferenced rows; otherwise it throws a
// ConflictError telling the caller to deactivate.
function deleteProduct(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const current = products.getById(id);
    if (products.isReferenced(id)) {
      throw new ConflictError(`product ${current.sku} has receipts/movements and cannot be deleted; deactivate it instead`);
    }
    products.remove(id);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'product.delete', entityType: 'product', entityId: id, details: `sku=${current.sku}`, before: `sku=${current.sku} name=${current.name}`, referenceNo: current.sku });
    return true;
  });
}

module.exports = { createProduct, listProducts, getProduct, updateProduct, setProductActive, deleteProduct };
