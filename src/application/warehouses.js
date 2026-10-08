'use strict';
// Warehouse use-cases (Phase 08). Warehouses are master data: created,
// deactivated, and deleted only when nothing references them. MAIN is the
// bootstrap depot and can never be deactivated or deleted. Transfers (P09)
// consume these endpoints; they do not bypass them.
const { ConflictError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { MAIN_WAREHOUSE_CODE } = require('../domain/vocabulary');
const { validateWarehouseCode, validateWarehouseName } = require('../domain/catalog');
const { createWarehouseRepository, createAuditRepository } = require('../data/stockRepository');
const { withTransaction } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

function createWarehouse(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'warehouses.edit');
  const code = validateWarehouseCode(raw.code);
  const name = validateWarehouseName(raw.name);
  return withTransaction(db, () => {
    try {
      const created = createWarehouseRepository(db).insert({ code, name });
      createAuditRepository(db).append({ actor: auth.actor, operation: 'warehouse.create', entityType: 'warehouse', entityId: created.id, details: `code=${code}`, after: `code=${code} name=${name}`, referenceNo: code });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError(`warehouse ${code} already exists`);
      throw err;
    }
  });
}

function listWarehouses(db) {
  return createWarehouseRepository(db).list();
}

function getWarehouse(db, id) {
  return createWarehouseRepository(db).getById(id);
}

function setWarehouseActive(db, id, active, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'warehouses.edit');
  return withTransaction(db, () => {
    const before = createWarehouseRepository(db).getById(id);
    if (before.code === MAIN_WAREHOUSE_CODE && !active) {
      throw new ConflictError('the MAIN depot cannot be deactivated');
    }
    const updated = createWarehouseRepository(db).setActive(id, active);
    createAuditRepository(db).append({
      actor: auth.actor, operation: active ? 'warehouse.reactivate' : 'warehouse.deactivate',
      entityType: 'warehouse', entityId: id, details: `code=${before.code}`,
      before: `is_active=${before.is_active}`, after: `is_active=${updated.is_active}`,
      referenceNo: before.code,
    });
    return updated;
  });
}

function deleteWarehouse(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'warehouses.edit');
  return withTransaction(db, () => {
    const repos = createWarehouseRepository(db);
    const current = repos.getById(id);
    if (current.code === MAIN_WAREHOUSE_CODE) {
      throw new ConflictError('the MAIN depot cannot be deleted');
    }
    if (repos.isReferenced(id)) {
      throw new ConflictError(`warehouse ${current.code} has stock movements or receipts and cannot be deleted; deactivate it instead`);
    }
    repos.remove(id);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'warehouse.delete', entityType: 'warehouse', entityId: id, details: `code=${current.code}`, before: `code=${current.code} name=${current.name}`, referenceNo: current.code });
    return true;
  });
}

module.exports = { createWarehouse, listWarehouses, getWarehouse, setWarehouseActive, deleteWarehouse };
