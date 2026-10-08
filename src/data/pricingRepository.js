'use strict';
// Pricing repositories (Phase 07) — price_lists + price_list_lines only.
// Scope keys are plain strings (P11 hardens them later); validity/priority
// filtering helpers live here so the resolver issues ONE query.
const { NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function toList(r) {
  if (!r) return null;
  return {
    id: r.id, code: r.code, name: r.name,
    scopeType: r.scope_type, scopeKey: r.scope_key,
    isActive: r.is_active === 1, priority: r.priority,
    validFrom: r.valid_from, validTo: r.valid_to,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function createPriceListRepository(db) {
  return {
    insert({ code, name, scopeType, scopeKey, isActive, priority, validFrom, validTo }) {
      const now = utcNowIso();
      const info = db.prepare(
        `INSERT INTO price_lists
           (code, name, scope_type, scope_key, is_active, priority, valid_from, valid_to, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(code, name, scopeType, scopeKey, isActive ? 1 : 0, priority, validFrom, validTo, now, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM price_lists WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`price list ${id} not found`);
      return toList(r);
    },
    getByCode(code) {
      return toList(db.prepare('SELECT * FROM price_lists WHERE code = ?').get(code));
    },
    list() {
      return db.prepare('SELECT * FROM price_lists ORDER BY code').all().map(toList);
    },
    update(id, fields) {
      const map = { name: 'name', isActive: 'is_active', priority: 'priority', validFrom: 'valid_from', validTo: 'valid_to' };
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(map)) {
        if (fields[key] !== undefined) {
          sets.push(`${column} = ?`);
          params.push(key === 'isActive' ? (fields[key] ? 1 : 0) : fields[key]);
        }
      }
      if (sets.length === 0) throw new NotFoundError(`price list ${id} not found`);
      sets.push('updated_at = ?');
      params.push(utcNowIso(), id);
      const info = db.prepare(`UPDATE price_lists SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (info.changes === 0) throw new NotFoundError(`price list ${id} not found`);
      return this.getById(id);
    },
    remove(id) {
      const info = db.prepare('DELETE FROM price_lists WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`price list ${id} not found`);
      return true;
    },
  };
}

function createPriceLineRepository(db) {
  const byKey = (listId, productId, packId) => packId === null || packId === undefined
    ? db.prepare('SELECT * FROM price_list_lines WHERE price_list_id = ? AND product_id = ? AND pack_id IS NULL').get(listId, productId)
    : db.prepare('SELECT * FROM price_list_lines WHERE price_list_id = ? AND product_id = ? AND pack_id = ?').get(listId, productId, packId);

  return {
    // Upsert: one row per (list, product, representation), enforced by the
    // two partial unique indexes. Returns the stored row.
    set({ listId, productId, packId = null, unitPrice }) {
      const now = utcNowIso();
      const existing = byKey(listId, productId, packId);
      if (existing) {
        db.prepare('UPDATE price_list_lines SET unit_price = ?, updated_at = ? WHERE id = ?')
          .run(unitPrice, now, existing.id);
        return db.prepare('SELECT * FROM price_list_lines WHERE id = ?').get(existing.id);
      }
      const info = db.prepare(
        'INSERT INTO price_list_lines (price_list_id, product_id, pack_id, unit_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(listId, productId, packId, unitPrice, now, now);
      return db.prepare('SELECT * FROM price_list_lines WHERE id = ?').get(Number(info.lastInsertRowid));
    },
    remove(listId, productId, packId = null) {
      const existing = byKey(listId, productId, packId);
      if (!existing) throw new NotFoundError('price line not found');
      db.prepare('DELETE FROM price_list_lines WHERE id = ?').run(existing.id);
      return true;
    },
    linesOfList(listId) {
      return db.prepare(
        `SELECT l.*, p.sku AS product_sku, k.name AS pack_name
           FROM price_list_lines l
           JOIN products p ON p.id = l.product_id
           LEFT JOIN product_packs k ON k.id = l.pack_id
          WHERE l.price_list_id = ? ORDER BY p.sku`
      ).all(listId);
    },
    // Resolver input: every line that could apply, with its list's rank data.
    // Validity + activity filtered in SQL; specificity ordering done by caller.
    candidates({ productId, customerTypeCode = null, customerCode = null, atDate }) {
      const conds = ['l.product_id = ?', 's.is_active = 1',
        '(s.valid_from IS NULL OR s.valid_from <= ?)',
        '(s.valid_to IS NULL OR s.valid_to >= ?)'];
      const params = [productId, atDate, atDate];
      const scopeConds = ["(s.scope_type = 'general')"];
      if (customerTypeCode) { scopeConds.push("(s.scope_type = 'customer_type' AND s.scope_key = ?)"); params.push(customerTypeCode); }
      if (customerCode) { scopeConds.push("(s.scope_type = 'customer' AND s.scope_key = ?)"); params.push(customerCode); }
      conds.push(`(${scopeConds.join(' OR ')})`);
      return db.prepare(
        `SELECT l.id, l.pack_id, l.unit_price, s.id AS list_id, s.code AS list_code,
                s.scope_type, s.priority
           FROM price_list_lines l
           JOIN price_lists s ON s.id = l.price_list_id
          WHERE ${conds.join(' AND ')}
          ORDER BY s.priority DESC, s.id ASC`
      ).all(...params);
    },
  };
}

module.exports = { createPriceListRepository, createPriceLineRepository };
