'use strict';
// Product repository — the ONLY place that queries the products table.
// Takes an open db handle; contains zero business decisions beyond persistence.
const { NotFoundError } = require('../domain/errors');
const { utcNowIso } = require('../db');

function toRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    barcode: r.barcode,
    productType: r.product_type,
    isActive: r.is_active === 1,
    defaultUnitCost: r.default_unit_cost,
    defaultSalePrice: r.default_sale_price,
    taxClass: r.tax_class,
    minStock: r.min_stock,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const UPDATE_COLUMNS = {
  name: 'name',
  barcode: 'barcode',
  productType: 'product_type',
  defaultUnitCost: 'default_unit_cost',
  defaultSalePrice: 'default_sale_price',
  taxClass: 'tax_class',
  minStock: 'min_stock',
  notes: 'notes',
};

function createProductRepository(db) {
  return {
    insert({ sku, name, barcode, productType, isActive, defaultUnitCost, defaultSalePrice, taxClass, minStock, notes }) {
      const now = utcNowIso();
      const info = db.prepare(
        `INSERT INTO products (sku, name, barcode, product_type, is_active, default_unit_cost,
                               default_sale_price, tax_class, min_stock, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(sku, name, barcode, productType, isActive ? 1 : 0, defaultUnitCost,
        defaultSalePrice, taxClass, minStock, notes, now, now);
      return this.getById(Number(info.lastInsertRowid));
    },
    getById(id) {
      const r = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (!r) throw new NotFoundError(`product ${id} not found`);
      return toRow(r);
    },
    getBySku(sku) {
      const r = db.prepare('SELECT * FROM products WHERE sku = ?').get(sku);
      return toRow(r);
    },
    list({ search = '', activeOnly = false, limit = 200, offset = 0 } = {}) {
      const conds = [];
      const params = [];
      if (search) { conds.push('(sku LIKE ? OR name LIKE ? OR COALESCE(barcode, \'\') LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      if (activeOnly) conds.push('is_active = 1');
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      return db.prepare(`SELECT * FROM products ${where} ORDER BY name LIMIT ? OFFSET ?`).all(...params, limit, offset).map(toRow);
    },
    setActive(id, active) {
      const now = utcNowIso();
      const info = db.prepare('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, now, id);
      if (info.changes === 0) throw new NotFoundError(`product ${id} not found`);
      return this.getById(id);
    },
    // Partial update over the P05 updatable subset (caller validates; sku never).
    update(id, fields) {
      const sets = [];
      const params = [];
      for (const [key, column] of Object.entries(UPDATE_COLUMNS)) {
        if (fields[key] !== undefined) { sets.push(`${column} = ?`); params.push(fields[key]); }
      }
      if (sets.length === 0) throw new NotFoundError(`product ${id} not found`);
      sets.push('updated_at = ?');
      params.push(utcNowIso(), id);
      const info = db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (info.changes === 0) throw new NotFoundError(`product ${id} not found`);
      return this.getById(id);
    },
    // Hard delete is only allowed when nothing references the product.
    // Anything with receipts/movements must be deactivated instead (retention policy).
    remove(id) {
      const info = db.prepare('DELETE FROM products WHERE id = ?').run(id);
      if (info.changes === 0) throw new NotFoundError(`product ${id} not found`);
      return true;
    },
    isReferenced(id) {
      const line = db.prepare('SELECT 1 FROM purchase_receipt_lines WHERE product_id = ? LIMIT 1').get(id);
      if (line) return true;
      const mov = db.prepare('SELECT 1 FROM stock_movements WHERE product_id = ? LIMIT 1').get(id);
      return Boolean(mov);
    },
  };
}

module.exports = { createProductRepository };
