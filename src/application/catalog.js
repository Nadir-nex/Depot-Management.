'use strict';
// Catalog use-cases (Phase 06): categories, units, packs, barcodes.
// All writes require products.edit and are audited; reads are open.
// Barcodes resolve through ONE lookup (repositories own the SQL); pack math
// uses exact domain conversions so consumers never duplicate the logic.
const { ConflictError, NotFoundError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const {
  validateCategoryName,
  validateUnitCode,
  validateUnitName,
  validatePackName,
  validateQtyPerPack,
  validateBarcodeCode,
} = require('../domain/catalog');
const { createProductRepository } = require('../data/productRepository');
const {
  createCategoryRepository,
  createUnitRepository,
  createPackRepository,
  createBarcodeRepository,
} = require('../data/catalogRepository');
const { createAuditRepository } = require('../data/stockRepository');
const { withTransaction } = require('../db');

// The audit_log table is owned by stockRepository; catalog writes audit there.
const auditOf = (db) => createAuditRepository(db);

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function createCategory(db, { name, parentId = null }, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  const clean = validateCategoryName(name);
  const parent = parentId === null || parentId === undefined || parentId === '' ? null : Number(parentId);
  return withTransaction(db, () => {
    const cats = createCategoryRepository(db);
    if (parent !== null) cats.getById(parent); // NotFound when unknown
    if (cats.findSibling(parent, clean)) {
      throw new ConflictError(`category "${clean}" already exists at this level`);
    }
    const created = cats.insert({ name: clean, parentId: parent });
    auditOf(db).append({ actor: auth.actor, operation: 'catalog.category_create', entityType: 'category', entityId: created.id, details: `name=${clean}`, after: `name=${clean} parent=${parent}`, referenceNo: clean.slice(0, 64) });
    return created;
  });
}

function listCategories(db) {
  return createCategoryRepository(db).list();
}

// Nested tree for dropdowns/reports: [{ ..., children: [...] }], roots first.
function getCategoryTree(db) {
  const flat = createCategoryRepository(db).list();
  const byId = new Map(flat.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (node.parent_id === null || node.parent_id === undefined) roots.push(node);
    else if (byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
    else roots.push(node); // orphan-safe: never drop a row
  }
  return roots;
}

// Empty leaf categories only: children or linked products block deletion.
function deleteCategory(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  return withTransaction(db, () => {
    const cats = createCategoryRepository(db);
    const current = cats.getById(id);
    if (cats.childrenOf(id).length > 0) {
      throw new ConflictError(`category "${current.name}" has subcategories; delete them first`);
    }
    if (cats.productCount(id) > 0) {
      throw new ConflictError(`category "${current.name}" still has products; recategorize them first`);
    }
    cats.remove(id);
    auditOf(db).append({ actor: auth.actor, operation: 'catalog.category_delete', entityType: 'category', entityId: id, details: `name=${current.name}`, before: `name=${current.name}` });
    return true;
  });
}

function listUnits(db) {
  return createUnitRepository(db).list();
}

function createUnit(db, { code, name }, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  const cleanCode = validateUnitCode(code);
  const cleanName = validateUnitName(name);
  return withTransaction(db, () => {
    try {
      const created = createUnitRepository(db).insert({ code: cleanCode, name: cleanName });
      auditOf(db).append({ actor: auth.actor, operation: 'catalog.unit_create', entityType: 'unit', entityId: created.id, details: `code=${cleanCode}`, referenceNo: cleanCode });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError(`unit code ${cleanCode} already exists`);
      throw err;
    }
  });
}

function createPack(db, productId, { name, unitCode, qtyPerPack }, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  const cleanName = validatePackName(name);
  const per = validateQtyPerPack(qtyPerPack);
  return withTransaction(db, () => {
    createProductRepository(db).getById(productId); // NotFound when unknown
    const units = createUnitRepository(db);
    const unit = units.getByCode(validateUnitCode(unitCode));
    if (!unit) throw new NotFoundError(`unit ${unitCode} not found`);
    const packs = createPackRepository(db);
    if (packs.findByProductAndName(productId, cleanName)) {
      throw new ConflictError(`pack "${cleanName}" already exists for this product`);
    }
    const created = packs.insert({ productId, name: cleanName, unitId: unit.id, qtyPerPack: per });
    auditOf(db).append({ actor: auth.actor, operation: 'catalog.pack_create', entityType: 'product_pack', entityId: created.id, details: `${cleanName} x${per} ${unit.code}`, referenceNo: cleanName.slice(0, 64) });
    return packs.getById(created.id);
  });
}

function listPacks(db, productId) {
  createProductRepository(db).getById(productId);
  return createPackRepository(db).listOfProduct(productId);
}

function addBarcode(db, productId, { code, packId = null, preferred = false }, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  const clean = validateBarcodeCode(code);
  return withTransaction(db, () => {
    createProductRepository(db).getById(productId);
    const packs = createPackRepository(db);
    if (packId !== null && packId !== undefined) {
      const pack = packs.getById(packId);
      if (pack.product_id !== productId) {
        throw new ValidationError('pack belongs to a different product');
      }
    }
    try {
      const created = createBarcodeRepository(db).insert({ productId, packId, code: clean, preferred });
      auditOf(db).append({ actor: auth.actor, operation: 'catalog.barcode_add', entityType: 'product_barcode', entityId: created.id, details: `code=${clean}`, referenceNo: clean.slice(0, 64) });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError(`barcode ${clean} is already registered`);
      throw err;
    }
  });
}

function removeBarcode(db, barcodeId, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'products.edit');
  return withTransaction(db, () => {
    const current = createBarcodeRepository(db).getById(barcodeId);
    createBarcodeRepository(db).remove(barcodeId);
    auditOf(db).append({ actor: auth.actor, operation: 'catalog.barcode_remove', entityType: 'product_barcode', entityId: barcodeId, details: `code=${current.code}`, before: `code=${current.code}` });
    return true;
  });
}

function listBarcodes(db, productId) {
  createProductRepository(db).getById(productId);
  return createBarcodeRepository(db).listOfProduct(productId);
}

// Deterministic single-path resolution for sales/purchases/inventory/delivery.
function resolveBarcode(db, code) {
  if (typeof code !== 'string' || code.trim() === '') return null;
  return createBarcodeRepository(db).resolve(code.trim());
}

module.exports = {
  createCategory,
  listCategories,
  getCategoryTree,
  deleteCategory,
  listUnits,
  createUnit,
  createPack,
  listPacks,
  addBarcode,
  removeBarcode,
  listBarcodes,
  resolveBarcode,
};
