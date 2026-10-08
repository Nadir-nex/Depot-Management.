'use strict';
// Pricing service (Phase 07) — the ONE price-resolution service all future
// sales flows must use. The resolver is a PURE QUERY: no writes, no audit.
// Posted documents snapshot the resolved price on their own lines, so later
// tariff edits can never rewrite history (tested). Discounts stay explicit:
// an override is reported as source 'line-override' while the tariff base
// remains queryable underneath.
const { ConflictError, ValidationError } = require('../domain/errors');
const { normalizeAuth, requirePermission } = require('../domain/permissions');
const { PRICE_SOURCES } = require('../domain/vocabulary');
const {
  validateListCode,
  validateListName,
  validateScope,
  validateValidity,
  validatePriority,
  validateLinePrice,
} = require('../domain/pricing');
const { createProductRepository } = require('../data/productRepository');
const { createPackRepository } = require('../data/catalogRepository');
const { createPriceListRepository, createPriceLineRepository } = require('../data/pricingRepository');
const { createAuditRepository } = require('../data/stockRepository');
const { withTransaction, utcNowIso } = require('../db');

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(err.message || ''));
}

// Specificity rank: lower wins. Ties inside one rank break by list priority
// (higher first), then lowest list id — deterministic, no ambiguity.
const SCOPE_RANK = { customer: 0, customer_type: 1, general: 2 };

function createPriceList(db, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'pricing.edit');
  const code = validateListCode(raw.code);
  const name = validateListName(raw.name);
  const { scopeType, scopeKey } = validateScope(raw.scopeType ?? raw.scope_type, raw.scopeKey ?? raw.scope_key);
  const { validFrom, validTo } = validateValidity(raw.validFrom ?? raw.valid_from, raw.validTo ?? raw.valid_to);
  return withTransaction(db, () => {
    try {
      const created = createPriceListRepository(db).insert({
        code, name, scopeType, scopeKey,
        isActive: raw.isActive === undefined ? true : Boolean(raw.isActive),
        priority: validatePriority(raw.priority),
        validFrom, validTo,
      });
      createAuditRepository(db).append({ actor: auth.actor, operation: 'pricing.list_create', entityType: 'price_list', entityId: created.id, details: `code=${code}`, referenceNo: code });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError(`price list ${code} already exists`);
      throw err;
    }
  });
}

function updatePriceList(db, id, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'pricing.edit');
  if (raw.code !== undefined) throw new ValidationError('price list code is immutable; create a new list instead');
  const fields = {};
  if (raw.name !== undefined) fields.name = validateListName(raw.name);
  if (raw.isActive !== undefined) fields.isActive = Boolean(raw.isActive);
  if (raw.priority !== undefined) fields.priority = validatePriority(raw.priority);
  if (raw.validFrom !== undefined || raw.valid_from !== undefined || raw.validTo !== undefined || raw.valid_to !== undefined) {
    const current = createPriceListRepository(db).getById(id);
    const { validFrom, validTo } = validateValidity(
      raw.validFrom ?? raw.valid_from ?? current.validFrom,
      raw.validTo ?? raw.valid_to ?? current.validTo
    );
    fields.validFrom = validFrom;
    fields.validTo = validTo;
  }
  if (Object.keys(fields).length === 0) throw new ValidationError('nothing to update');
  return withTransaction(db, () => {
    const updated = createPriceListRepository(db).update(id, fields);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'pricing.list_update', entityType: 'price_list', entityId: id, details: `code=${updated.code}`, referenceNo: updated.code });
    return updated;
  });
}

function deletePriceList(db, id, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'pricing.edit');
  return withTransaction(db, () => {
    const current = createPriceListRepository(db).getById(id);
    createPriceListRepository(db).remove(id); // lines cascade; posted docs keep their snapshots
    createAuditRepository(db).append({ actor: auth.actor, operation: 'pricing.list_delete', entityType: 'price_list', entityId: id, details: `code=${current.code}`, before: `code=${current.code}`, referenceNo: current.code });
    return true;
  });
}

// Upsert one line. packId null = base-piece price; otherwise price is PER PACK.
function setPriceLine(db, listId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'pricing.edit');
  const unitPrice = validateLinePrice(raw.unitPrice ?? raw.unit_price);
  return withTransaction(db, () => {
    createPriceListRepository(db).getById(listId);
    const product = createProductRepository(db).getById(raw.productId ?? raw.product_id);
    let packId = raw.packId ?? raw.pack_id ?? null;
    if (packId !== null && packId !== undefined) {
      const pack = createPackRepository(db).getById(packId);
      if (pack.product_id !== product.id) throw new ValidationError('pack belongs to a different product');
      packId = pack.id;
    } else {
      packId = null;
    }
    const row = createPriceLineRepository(db).set({ listId, productId: product.id, packId, unitPrice });
    createAuditRepository(db).append({ actor: auth.actor, operation: 'pricing.line_set', entityType: 'price_list_line', entityId: row.id, details: `list=${listId} sku=${product.sku} price=${unitPrice}`, referenceNo: product.sku.slice(0, 64) });
    return row;
  });
}

function removePriceLine(db, listId, raw = {}, actorOrAuth = 'system') {
  const auth = requirePermission(normalizeAuth(actorOrAuth), 'pricing.edit');
  return withTransaction(db, () => {
    createPriceListRepository(db).getById(listId);
    const product = createProductRepository(db).getById(raw.productId ?? raw.product_id);
    const packId = raw.packId ?? raw.pack_id ?? null;
    createPriceLineRepository(db).remove(listId, product.id, packId);
    createAuditRepository(db).append({ actor: auth.actor, operation: 'pricing.line_remove', entityType: 'price_list_line', entityId: null, details: `list=${listId} sku=${product.sku}`, referenceNo: product.sku.slice(0, 64) });
    return true;
  });
}

function listPriceLists(db) {
  return createPriceListRepository(db).list();
}

function getPriceList(db, id) {
  const list = createPriceListRepository(db).getById(id);
  return { ...list, lines: createPriceLineRepository(db).linesOfList(id) };
}

// THE resolver. Pure query. Hierarchy:
// override → customer/product → customer_type tariff/product → general
// tariff/product → product default. Within a list, a pack line beats the base
// line. Equal specificity: higher priority, then lowest list id.
function resolveSalePrice(db, args = {}) {
  const product = createProductRepository(db).getById(args.productId ?? args.product_id);
  if (args.overridePrice !== undefined && args.overridePrice !== null) {
    return {
      unitPrice: validateLinePrice(args.overridePrice ?? args.override_price),
      source: PRICE_SOURCES.LINE_OVERRIDE,
      priceListId: null, priceListCode: null,
      packId: null, pricePer: 'piece', taxClass: product.taxClass,
    };
  }
  let packId = args.packId ?? args.pack_id ?? null;
  if (packId !== null && packId !== undefined) {
    const pack = createPackRepository(db).getById(packId);
    if (pack.product_id !== product.id) throw new ValidationError('pack belongs to a different product');
    packId = pack.id;
  } else {
    packId = null;
  }
  const atDate = args.atDate ?? args.at_date ?? utcNowIso().slice(0, 10);
  const rows = createPriceLineRepository(db).candidates({
    productId: product.id,
    customerTypeCode: args.customerTypeCode ?? args.customer_type_code ?? null,
    customerCode: args.customerCode ?? args.customer_code ?? null,
    atDate,
  });
  // Candidates arrive ordered by (priority DESC, id ASC); bucket by rank.
  const byRank = new Map();
  for (const r of rows) {
    const rank = SCOPE_RANK[r.scope_type];
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(r);
  }
  for (const rank of [0, 1, 2]) {
    const bucket = byRank.get(rank);
    if (!bucket || bucket.length === 0) continue;
    // Within the winning list: pack line first, then base line.
    const byList = new Map();
    for (const r of bucket) {
      if (!byList.has(r.list_id)) byList.set(r.list_id, []);
      byList.get(r.list_id).push(r);
    }
    for (const lines of byList.values()) {
      const win = (packId !== null && lines.find((l) => l.pack_id === packId)) || lines.find((l) => l.pack_id === null);
      if (win) {
        return {
          unitPrice: win.unit_price,
          source: rank === 0 ? PRICE_SOURCES.CUSTOMER_PRODUCT : rank === 1 ? PRICE_SOURCES.TARIFF_PRODUCT : PRICE_SOURCES.GENERAL_TARIFF,
          priceListId: win.list_id, priceListCode: win.list_code,
          packId: win.pack_id, pricePer: win.pack_id === null ? 'piece' : 'pack',
          taxClass: product.taxClass,
        };
      }
    }
  }
  return {
    unitPrice: product.defaultSalePrice, source: PRICE_SOURCES.PRODUCT_DEFAULT,
    priceListId: null, priceListCode: null, packId: null, pricePer: 'piece', taxClass: product.taxClass,
  };
}

module.exports = {
  createPriceList,
  updatePriceList,
  deletePriceList,
  setPriceLine,
  removePriceLine,
  listPriceLists,
  getPriceList,
  resolveSalePrice,
};
