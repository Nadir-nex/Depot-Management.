'use strict';
// Party use-cases (Phase 11). One identity, N roles, event-derived balances.
// Credit policy is BLOCK with explicit audited override; the checker is
// centralized here so future sales (P13) cannot invent their own rule.
const { ConflictError, StateError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const {
  validatePartyCode,
  validateDisplayName,
  validatePhone,
  validateEmail,
  validateRoles,
  validateCreditLimit,
  validatePaymentTerms,
  validateCreditAmount,
} = require('../domain/parties');
const {
  createPartyRepository,
  createPartyRoleRepository,
  createPartyPhoneRepository,
} = require('../data/partyRepository');
const { createAuditRepository } = require('../data/stockRepository');
const { getPartyBalance } = require('./payments');
const { withTransaction, utcNowIso } = require('../db');

function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function short(v, n = 64) {
  return cleanText(v).slice(0, n);
}

function toPartyFields(raw = {}) {
  return {
    displayName: validateDisplayName(raw.displayName ?? raw.display_name),
    phone: validatePhone(raw.phone ?? ''),
    email: validateEmail(raw.email ?? ''),
    address: cleanText(raw.address ?? '').slice(0, 500),
    city: cleanText(raw.city ?? '').slice(0, 100),
    taxId: cleanText(raw.taxId ?? raw.tax_id ?? '').slice(0, 64),
    tradeRegister: cleanText(raw.tradeRegister ?? raw.trade_register ?? '').slice(0, 64),
    customerTypeCode: cleanText(raw.customerTypeCode ?? raw.customer_type_code ?? '').slice(0, 64) || null,
    creditLimit: validateCreditLimit(raw.creditLimit ?? raw.credit_limit),
    paymentTermsDays: validatePaymentTerms(raw.paymentTermsDays ?? raw.payment_terms_days),
    notes: cleanText(raw.notes ?? '').slice(0, 2000),
  };
}

function generatePartyCode(db, roles) {
  const prefix = roles.length === 1 && roles[0] === 'supplier' ? 'SUPP' : 'CUST';
  const day = utcNowIso().slice(0, 10).replace(/-/g, '');
  const parties = createPartyRepository(db);
  for (let attempt = 0; attempt < 100; attempt++) {
    const seq = String(parties.countByCodePrefix(`${prefix}-${day}-`) + 1 + attempt).padStart(4, '0');
    const code = `${prefix}-${day}-${seq}`;
    if (!parties.getByCode(code)) return code;
  }
  throw new StateError('could not generate a party code');
}

function createParty(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'customers.edit');
  const roles = validateRoles(raw.roles ?? ['customer']);
  const code = validatePartyCode(raw.code) || null;
  const fields = toPartyFields(raw);
  return withTransaction(db, () => {
    const finalCode = code || generatePartyCode(db, roles);
    const created = createPartyRepository(db).insert({ code: finalCode, ...fields });
    createPartyRoleRepository(db).setRoles(created.id, roles);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'party.create', entityType: 'party', entityId: created.id, details: `code=${finalCode} roles=${roles.join(',')}`, after: `roles=${roles.join(',')}`, referenceNo: finalCode });
    return getParty(db, created.id);
  });
}

function getParty(db, id) {
  const party = createPartyRepository(db).getById(id);
  return {
    ...party,
    roles: createPartyRoleRepository(db).ofParty(id),
    phones: createPartyPhoneRepository(db).ofParty(id),
    balance: getPartyBalance(db, id),
  };
}

function listParties(db, opts) {
  const rows = createPartyRepository(db).list(opts);
  return rows.map((p) => ({ ...p, roles: createPartyRoleRepository(db).ofParty(p.id), balance: getPartyBalance(db, p.id) }));
}

function updateParty(db, id, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'customers.edit');
  if (raw.code !== undefined) throw new ValidationError('party code is immutable; create a new party instead');
  const fields = {};
  const pick = (out, key, validator, ...sources) => {
    for (const s of sources) {
      if (raw[s] !== undefined) { out[key] = validator(raw[s]); break; }
    }
  };
  pick(fields, 'displayName', validateDisplayName, 'displayName', 'display_name');
  pick(fields, 'phone', validatePhone, 'phone');
  pick(fields, 'email', validateEmail, 'email');
  pick(fields, 'address', (v) => cleanText(v).slice(0, 500), 'address');
  pick(fields, 'city', (v) => cleanText(v).slice(0, 100), 'city');
  pick(fields, 'taxId', (v) => cleanText(v).slice(0, 64), 'taxId', 'tax_id');
  pick(fields, 'tradeRegister', (v) => cleanText(v).slice(0, 64), 'tradeRegister', 'trade_register');
  if (raw.customerTypeCode !== undefined || raw.customer_type_code !== undefined) {
    fields.customerTypeCode = cleanText(raw.customerTypeCode ?? raw.customer_type_code).slice(0, 64) || null;
  }
  if (raw.creditLimit !== undefined || raw.credit_limit !== undefined) {
    fields.creditLimit = validateCreditLimit(raw.creditLimit ?? raw.credit_limit);
  }
  if (raw.paymentTermsDays !== undefined || raw.payment_terms_days !== undefined) {
    fields.paymentTermsDays = validatePaymentTerms(raw.paymentTermsDays ?? raw.payment_terms_days);
  }
  pick(fields, 'notes', (v) => cleanText(v).slice(0, 2000), 'notes');
  if (Object.keys(fields).length === 0) throw new ValidationError('nothing to update');
  return withTransaction(db, () => {
    const before = createPartyRepository(db).getById(id);
    const updated = createPartyRepository(db).update(id, fields);
    const changed = Object.keys(fields).map((k) => `${k}: ${before[k]} → ${updated[k]}`).join('; ').slice(0, 400);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'party.update', entityType: 'party', entityId: id, details: `code=${before.code} ${changed}`, before: `code=${before.code}`, after: changed, referenceNo: before.code });
    return getParty(db, id);
  });
}

function setPartyRoles(db, id, roles, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'customers.edit');
  const clean = validateRoles(roles);
  return withTransaction(db, () => {
    const before = createPartyRepository(db).getById(id);
    const beforeRoles = createPartyRoleRepository(db).ofParty(id);
    const afterRoles = createPartyRoleRepository(db).setRoles(id, clean);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'party.roles_set', entityType: 'party', entityId: id, details: `code=${before.code}`, before: `roles=${beforeRoles.join(',')}`, after: `roles=${afterRoles.join(',')}`, referenceNo: before.code });
    return getParty(db, id);
  });
}

function setPartyActive(db, id, active, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'customers.edit');
  return withTransaction(db, () => {
    const before = createPartyRepository(db).getById(id);
    const updated = createPartyRepository(db).setActive(id, active);
    createAuditRepository(db).append({ actor: auth.actor, operation: active ? 'party.reactivate' : 'party.deactivate', entityType: 'party', entityId: id, details: `code=${before.code}`, before: `isActive=${before.isActive}`, after: `isActive=${updated.isActive}`, referenceNo: before.code });
    return getParty(db, id);
  });
}

function deleteParty(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'customers.edit');
  return withTransaction(db, () => {
    const parties = createPartyRepository(db);
    const current = parties.getById(id);
    if (parties.isReferenced(id)) {
      throw new ConflictError(`party ${current.code} has linked receipts and cannot be deleted; deactivate it instead`);
    }
    parties.remove(id);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'party.delete', entityType: 'party', entityId: id, details: `code=${current.code}`, before: `code=${current.code} name=${current.displayName}`, referenceNo: current.code });
    return true;
  });
}

function addPartyPhone(db, partyId, { label = '', phone }, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'customers.edit');
  return withTransaction(db, () => {
    createPartyRepository(db).getById(partyId);
    const cleanPhone = validatePhone(phone);
    if (!cleanPhone) throw new ValidationError('phone is required');
    const row = createPartyPhoneRepository(db).add({ partyId, label: short(label, 32), phone: cleanPhone });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'party.phone_add', entityType: 'party', entityId: partyId, details: `phone=${row.phone}` });
    return row;
  });
}

function removePartyPhone(db, phoneId, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'customers.edit');
  return withTransaction(db, () => {
    const current = createPartyPhoneRepository(db).getById(phoneId);
    createPartyPhoneRepository(db).remove(phoneId);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'party.phone_remove', entityType: 'party', entityId: current.party_id, details: `phone=${current.phone}`, before: `phone=${current.phone}` });
    return true;
  });
}

// Centralized credit check (pure query shape). Exposure = OUTSTANDING customer
// receivable (net of payments) + the proposed additional amount. NULL = unlimited.
function checkCredit(db, { partyId, additionalAmount = 0 }) {
  const party = createPartyRepository(db).getById(partyId);
  const amount = validateCreditAmount(additionalAmount);
  const balance = getPartyBalance(db, partyId);
  const exposure = balance.receivable + amount;
  if (party.creditLimit === null || party.creditLimit === undefined) {
    return { allowed: true, exposure, limit: null, balance };
  }
  if (exposure <= party.creditLimit) return { allowed: true, exposure, limit: party.creditLimit, balance };
  return { allowed: false, exposure, limit: party.creditLimit, balance, reason: `credit limit exceeded: exposure ${exposure} > limit ${party.creditLimit}` };
}

// Enforcing gate: throws StateError when blocked unless a valid override
// ({reason}) is supplied by a credit.override holder. Overrides are audited.
function assertCredit(db, { partyId, additionalAmount = 0, override = null, auth = 'system' } = {}) {
  const check = checkCredit(db, { partyId, additionalAmount });
  if (check.allowed) return check;
  const actor = normalizeAuth(auth);
  const reason = cleanText(override && override.reason);
  if (!reason) throw new StateError(check.reason);
  requirePermission(actor, 'credit.override');
  const party = createPartyRepository(db).getById(partyId);
  createAuditRepository(db).append({ actor: actor.actor, operation: 'credit.override', entityType: 'party', entityId: partyId, details: `code=${party.code} exposure=${check.exposure} limit=${check.limit}`, reason: reason.slice(0, 1000), referenceNo: party.code });
  return { ...check, overridden: true };
}

module.exports = {
  createParty,
  getParty,
  listParties,
  updateParty,
  setPartyRoles,
  setPartyActive,
  deleteParty,
  addPartyPhone,
  removePartyPhone,
  checkCredit,
  assertCredit,
};
