'use strict';
// Catalog repositories (Phase 06) — the ONLY place querying categories, units,
// product_packs and product_barcodes. Raw SQL + FK mapping, zero business rules
// beyond NULL-aware sibling lookup (uniqueness itself is enforced by callers).
const { NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function createCategoryRepository(db) {
  return {
    insert({ name, parentId }) {
      const now = utcNowIso();
      const info = db.prepare(
        'INSERT INTO product_categories (name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?)'
      ).run(name, parentId, now, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM product_categories WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`category ${id} not found`);
      return r;
    },
    // NULL-aware: SQL `= NULL` never matches, so roots need IS NULL.
    findSibling(parentId, name) {
      if (parentId === null || parentId === undefined) {
        return db.prepare('SELECT * FROM product_categories WHERE parent_id IS NULL AND name = ?').get(name) || null;
      }
      return db.prepare('SELECT * FROM product_categories WHERE parent_id = ? AND name = ?').get(parentId, name) || null;
    },
    childrenOf(parentId) {
      if (parentId === null || parentId === undefined) {
        return db.prepare('SELECT * FROM product_categories WHERE parent_id IS NULL ORDER BY name').all();
      }
      return db.prepare('SELECT * FROM product_categories WHERE parent_id = ? ORDER BY name').all(parentId);
    },
    list() {
      return db.prepare('SELECT * FROM product_categories ORDER BY COALESCE(parent_id, 0), name').all();
    },
    remove(id) {
      const info = db.prepare('DELETE FROM product_categories WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`category ${id} not found`);
      return true;
    },
    productCount(id) {
      return db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(id).n;
    },
  };
}

function createUnitRepository(db) {
  return {
    insert({ code, name }) {
      const info = db.prepare('INSERT INTO units (code, name, created_at) VALUES (?, ?, ?)')
        .run(code, name, utcNowIso());
      return this.getByCode(code);
    },
    getByCode(code) {
      return db.prepare('SELECT * FROM units WHERE code = ?').get(code) || null;
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM units WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`unit ${id} not found`);
      return r;
    },
    list() {
      return db.prepare('SELECT * FROM units ORDER BY code').all();
    },
  };
}

function createPackRepository(db) {
  return {
    insert({ productId, name, unitId, qtyPerPack }) {
      const info = db.prepare(
        'INSERT INTO product_packs (product_id, name, unit_id, qty_per_pack, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(productId, name, unitId, qtyPerPack, utcNowIso());
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare(
        `SELECT p.*, u.code AS unit_code, u.name AS unit_name FROM product_packs p
         JOIN units u ON u.id = p.unit_id WHERE p.id = ?`
      ).get(id);
      if (!r) throw new NotFoundError(`pack ${id} not found`);
      return r;
    },
    findByProductAndName(productId, name) {
      return db.prepare('SELECT * FROM product_packs WHERE product_id = ? AND name = ?').get(productId, name) || null;
    },
    listOfProduct(productId) {
      return db.prepare(
        `SELECT p.*, u.code AS unit_code FROM product_packs p
         JOIN units u ON u.id = p.unit_id WHERE p.product_id = ? ORDER BY p.name`
      ).all(productId);
    },
  };
}

function createBarcodeRepository(db) {
  return {
    insert({ productId, packId = null, code, preferred = false }) {
      // Demote first: the partial unique index allows only one preferred row.
      if (preferred) {
        db.prepare('UPDATE product_barcodes SET is_preferred = 0 WHERE product_id = ?').run(productId);
      }
      const id = db.prepare(
        'INSERT INTO product_barcodes (product_id, pack_id, code, is_preferred, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(productId, packId, code, preferred ? 1 : 0, utcNowIso());
      return this.getById(Number(id.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM product_barcodes WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`barcode ${id} not found`);
      return r;
    },
    // Single deterministic lookup path for every consumer (sales, purchases,
    // inventory, delivery): exact code → product + optional pack presentation.
    resolve(code) {
      const r = db.prepare(
        `SELECT b.id, b.code, b.is_preferred, b.pack_id,
                p.id AS product_id, p.sku AS product_sku, p.name AS product_name,
                k.name AS pack_name, k.qty_per_pack, u.code AS pack_unit
           FROM product_barcodes b
           JOIN products p ON p.id = b.product_id
           LEFT JOIN product_packs k ON k.id = b.pack_id
           LEFT JOIN units u ON u.id = k.unit_id
          WHERE b.code = ?`
      ).get(code);
      return r || null;
    },
    listOfProduct(productId) {
      return db.prepare('SELECT * FROM product_barcodes WHERE product_id = ? ORDER BY is_preferred DESC, id').all(productId);
    },
    remove(id) {
      const cur = this.getById(id);
      db.prepare('DELETE FROM product_barcodes WHERE id = ?').run(id);
      // Preferred removed while others remain: promote the oldest survivor.
      if (cur.is_preferred === 1) {
        const next = db.prepare('SELECT id FROM product_barcodes WHERE product_id = ? ORDER BY id LIMIT 1').get(cur.product_id);
        if (next) db.prepare('UPDATE product_barcodes SET is_preferred = 1 WHERE id = ?').run(next.id);
      }
      return true;
    },
  };
}

module.exports = { createCategoryRepository, createUnitRepository, createPackRepository, createBarcodeRepository };
