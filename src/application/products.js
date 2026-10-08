'use strict';
// Product use-cases. Owns the transaction boundary for product writes and maps
// storage errors to the shared domain error contract. No Electron, no fs.
const { ConflictError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { toProductInput } = require('../domain/products');
const { createProductRepository } = require('../data/productRepository');
const { createAuditRepository } = require('../data/stockRepository');
const { withTransaction } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function describeUnique(err) {
  const msg = err.message || '';
  if (msg.includes('products.sku')) return 'sku already exists';
  if (msg.includes('products.barcode')) return 'barcode already exists';
  return 'duplicate value violates a uniqueness rule';
}

function createProduct(db, rawInput, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  const input = toProductInput(rawInput);
  return withTransaction(db, () => {
    const products = createProductRepository(db);
    const audit = createAuditRepository(db);
    try {
      const created = products.insert(input);
      audit.append({ actor: auth.actor, operation: 'product.create', entityType: 'product', entityId: created.id, details: `sku=${created.sku}`, after: `sku=${created.sku} name=${created.name}`, referenceNo: created.sku });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError(describeUnique(err));
      throw err;
    }
  });
}

function listProducts(db, opts) {
  return createProductRepository(db).list(opts);
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

module.exports = { createProduct, listProducts, getProduct, setProductActive, deleteProduct };
