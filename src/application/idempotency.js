'use strict';
// Idempotency utilities (Phase 27). Prevents duplicate business events.

const { ConflictError, ValidationError } = require('../domain/errors');
const { utcNowIso } = require('../db');

const IDEMPOTENCY_TYPES = Object.freeze([
  'receive_stock', 'post_invoice', 'post_delivery', 'record_payment',
  'reserve_stock', 'complete_stop', 'post_count', 'settle_stop'
]);

function validateOperationType(type) {
  if (!IDEMPOTENCY_TYPES.includes(type)) {
    throw new ValidationError(`invalid idempotency operation type: ${type}`);
  }
  return type;
}

function validateOperationKey(key) {
  if (!key || typeof key !== 'string') throw new ValidationError('operation_key is required');
  const k = key.trim();
  if (k.length < 16 || k.length > 128) throw new ValidationError('operation_key must be 16-128 characters');
  return k;
}

function checkAndClaimOperationKey(db, operationType, operationKey, { entityId = null, entityType = null } = {}) {
  const type = validateOperationType(operationType);
  const key = validateOperationKey(operationKey);

  // Try to insert the operation key
  const info = db.prepare(
    `INSERT INTO operation_keys (operation_type, operation_key, entity_id, entity_type, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(type, key, entityId, entityType, utcNowIso());

  return { claimed: true, operationKeyId: Number(info.lastInsertRowid) };
}

function tryClaimOperationKey(db, operationType, operationKey, { entityId = null, entityType = null } = {}) {
  const type = validateOperationType(operationType);
  const key = validateOperationKey(operationKey);

  try {
    const info = db.prepare(
      `INSERT INTO operation_keys (operation_type, operation_key, entity_id, entity_type, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(type, key, entityId, entityType, utcNowIso());
    return { claimed: true, operationKeyId: Number(info.lastInsertRowid) };
  } catch (err) {
    if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''))) {
      // Key already exists - duplicate operation
      const existing = db.prepare(
        'SELECT id, entity_id, entity_type, created_at FROM operation_keys WHERE operation_type = ? AND operation_key = ?'
      ).get(type, key);
      return { claimed: false, existing };
    }
    throw err;
  }
}

function releaseOperationKey(db, operationType, operationKey) {
  const type = validateOperationType(operationType);
  const key = validateOperationKey(operationKey);
  db.prepare('DELETE FROM operation_keys WHERE operation_type = ? AND operation_key = ?').run(type, key);
}

module.exports = {
  IDEMPOTENCY_TYPES,
  validateOperationType,
  validateOperationKey,
  checkAndClaimOperationKey,
  tryClaimOperationKey,
  releaseOperationKey,
};
