const { DatabaseSync } = require('node:sqlite');
const path = require('path');

let sqlite = null;
const DB_PATH = path.join(__dirname, 'database.sqlite');

function init() {
  sqlite = new DatabaseSync(DB_PATH);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#0288d1'
    );
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6a1b9a'
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT UNIQUE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      qty INTEGER NOT NULL CHECK (qty > 0),
      buy_price REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      expiry_date TEXT,
      supplier TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_shipments_item ON shipments(item_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_expiry ON shipments(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
    CREATE TABLE IF NOT EXISTS districts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
      latitude REAL,
      longitude REAL,
      notes TEXT DEFAULT '',
      deleted_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS customer_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      phone_number TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_customers_district ON customers(district_id);
    CREATE INDEX IF NOT EXISTS idx_customers_deleted ON customers(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_phones_customer ON customer_phones(customer_id);
    CREATE INDEX IF NOT EXISTS idx_phones_number ON customer_phones(phone_number);
  `);
  // migration for DBs created before categories/companies
  try { sqlite.exec('ALTER TABLE items ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL'); } catch {}
  try { sqlite.exec('ALTER TABLE items ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL'); } catch {}
  return sqlite;
}

function getDb() {
  if (!sqlite) init();
  return sqlite;
}

// ---- categories / companies ----
function listCategories() {
  return getDb().prepare('SELECT * FROM categories ORDER BY name').all();
}
function addCategory({ name, color }) {
  const n = (name || '').trim();
  if (!n) throw new Error('اسم الفئة مطلوب');
  try {
    const r = getDb().prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(n, (color || '#0288d1').trim());
    return { id: Number(r.lastInsertRowid), name: n };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('الفئة موجودة من قبل');
    throw e;
  }
}
function listCompanies() {
  return getDb().prepare('SELECT * FROM companies ORDER BY name').all();
}
function addCompany({ name, color }) {
  const n = (name || '').trim();
  if (!n) throw new Error('اسم الشركة مطلوب');
  try {
    const r = getDb().prepare('INSERT INTO companies (name, color) VALUES (?, ?)').run(n, (color || '#6a1b9a').trim());
    return { id: Number(r.lastInsertRowid), name: n };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('الشركة موجودة من قبل');
    throw e;
  }
}

// Add product: name + barcode + optional category/company
function addItem({ name, barcode, category_id, company_id }) {
  const db = getDb();
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('الاسم مطلوب');
  const cleanBarcode = (barcode || '').trim() || null;
  try {
    const r = db.prepare('INSERT INTO items (name, barcode, category_id, company_id) VALUES (?, ?, ?, ?)').run(
      cleanName, cleanBarcode,
      category_id || null, company_id || null
    );
    return { id: Number(r.lastInsertRowid), name: cleanName, barcode: cleanBarcode };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('الباركود موجود من قبل');
    throw e;
  }
}

// stock(item) = SUM(shipments.qty)
function listItems(search = '', categoryId = null, companyId = null) {
  const db = getDb();
  const like = `%${(search || '').trim()}%`;
  return db.prepare(`
    SELECT
      i.id, i.name, i.barcode, i.category_id, i.company_id,
      c.name AS category_name, c.color AS category_color,
      co.name AS company_name, co.color AS company_color,
      COALESCE(SUM(s.qty), 0) AS qty,
      MAX(s.created_at) AS last_in,
      (SELECT s2.buy_price FROM shipments s2 WHERE s2.item_id = i.id ORDER BY s2.id DESC LIMIT 1) AS last_buy,
      (SELECT s3.sell_price FROM shipments s3 WHERE s3.item_id = i.id ORDER BY s3.id DESC LIMIT 1) AS last_sell,
      (SELECT MIN(s4.expiry_date) FROM shipments s4 WHERE s4.item_id = i.id AND s4.expiry_date IS NOT NULL AND s4.expiry_date != '') AS nearest_expiry
    FROM items i
    LEFT JOIN shipments s ON s.item_id = i.id
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN companies co ON co.id = i.company_id
    WHERE (i.name LIKE ? OR COALESCE(i.barcode,'') LIKE ? OR COALESCE(c.name,'') LIKE ? OR COALESCE(co.name,'') LIKE ?)
      AND (? IS NULL OR i.category_id = ?)
      AND (? IS NULL OR i.company_id = ?)
    GROUP BY i.id
    ORDER BY i.id DESC
  `).all(like, like, like, like, categoryId, categoryId, companyId, companyId);
}

function addShipment({ item_id, qty, buy_price, sell_price, expiry_date, supplier }) {
  const db = getDb();
  const q = parseInt(qty, 10);
  if (!item_id) throw new Error('اختر المنتج');
  if (!Number.isFinite(q) || q <= 0) throw new Error('الكمية يجب أن تكون أكبر من 0');
  const r = db.prepare(`
    INSERT INTO shipments (item_id, qty, buy_price, sell_price, expiry_date, supplier)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    item_id,
    q,
    Number(buy_price) || 0,
    Number(sell_price) || 0,
    (expiry_date || '').trim() || null,
    (supplier || '').trim() || ''
  );
  return { id: Number(r.lastInsertRowid) };
}

function listShipments(itemId) {
  const db = getDb();
  if (itemId) return db.prepare('SELECT * FROM shipments WHERE item_id = ? ORDER BY id DESC').all(itemId);
  return db.prepare('SELECT * FROM shipments ORDER BY id DESC LIMIT 100').all();
}

// Detailed shipments view: one row per shipment (not grouped), with filters
function listShipmentsDetailed(search = '', categoryId = null, companyId = null, expiringOnly = false, sort = 'expiry_asc') {
  const db = getDb();
  const like = `%${(search || '').trim()}%`;
  const orderBy = sort === 'qty_desc'
    ? 's.qty DESC'
    : sort === 'newest'
      ? 's.id DESC'
      : "CASE WHEN s.expiry_date IS NULL OR s.expiry_date = '' THEN 1 ELSE 0 END, s.expiry_date ASC";
  return db.prepare(`
    SELECT s.id, s.qty, s.buy_price, s.sell_price, s.expiry_date, s.supplier, s.created_at,
      i.id AS item_id, i.name AS item_name, i.barcode,
      c.name AS category_name, c.color AS category_color,
      co.name AS company_name, co.color AS company_color
    FROM shipments s
    JOIN items i ON i.id = s.item_id
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN companies co ON co.id = i.company_id
    WHERE (i.name LIKE ? OR COALESCE(i.barcode,'') LIKE ? OR COALESCE(c.name,'') LIKE ? OR COALESCE(co.name,'') LIKE ?)
      AND (? IS NULL OR i.category_id = ?)
      AND (? IS NULL OR i.company_id = ?)
      AND (? = 0 OR (s.expiry_date IS NOT NULL AND s.expiry_date != ''))
    ORDER BY ${orderBy}
    LIMIT 500
  `).all(like, like, like, like, categoryId, categoryId, companyId, companyId, expiringOnly ? 1 : 0);
}

function getOverview() {
  const db = getDb();
  const totalItems = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
  const totalQty = db.prepare('SELECT COALESCE(SUM(qty),0) AS s FROM shipments').get().s;
  const nearExpiry = db.prepare(`
    SELECT COUNT(*) AS c FROM shipments
    WHERE expiry_date IS NOT NULL AND expiry_date != ''
    AND date(expiry_date) <= date('now', '+90 days')
  `).get().c;
  return { totalItems, totalQty, nearExpiry };
}

// ---------------- Customers (Phase A) ----------------

function listDistricts() {
  return getDb().prepare('SELECT * FROM districts ORDER BY name').all();
}

function addDistrict({ name }) {
  const n = (name || '').trim();
  if (!n) throw new Error('اسم الحي/المنطقة مطلوب');
  try {
    const r = getDb().prepare('INSERT INTO districts (name) VALUES (?)').run(n);
    return { id: Number(r.lastInsertRowid), name: n };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('هذه المنطقة موجودة من قبل');
    throw e;
  }
}

function cleanGps(v, min, max, label) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(label);
  return n;
}

// owners of a phone on OTHER, non-deleted customers (warning only, never blocks)
function findPhoneOwners(phoneNumber, excludeCustomerId = null) {
  const p = (phoneNumber || '').trim();
  if (!p) return [];
  return getDb().prepare(`
    SELECT c.id, c.name FROM customer_phones p
    JOIN customers c ON c.id = p.customer_id
    WHERE p.phone_number = ? AND c.deleted_at IS NULL
      AND (? IS NULL OR c.id != ?)
  `).all(p, excludeCustomerId, excludeCustomerId);
}

function addCustomer({ name, district_id, latitude, longitude, notes, phones }) {
  const db = getDb();
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('اسم الزبون مطلوب');
  const lat = cleanGps(latitude, -90, 90, 'خط العرض يجب أن يكون بين -90 و 90');
  const lng = cleanGps(longitude, -180, 180, 'خط الطول يجب أن يكون بين -180 و 180');
  const phoneList = (phones || []).map(p => (p || '').trim()).filter(Boolean);

  db.exec('BEGIN');
  try {
    const r = db.prepare(`
      INSERT INTO customers (name, district_id, latitude, longitude, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(cleanName, district_id || null, lat, lng, (notes || '').trim());
    const id = Number(r.lastInsertRowid);
    const dupWarnings = [];
    const ins = db.prepare('INSERT INTO customer_phones (customer_id, phone_number) VALUES (?, ?)');
    for (const ph of phoneList) {
      ins.run(id, ph);
      const owners = findPhoneOwners(ph, id);
      if (owners.length) dupWarnings.push({ phone: ph, owners });
    }
    db.exec('COMMIT');
    return { id, name: cleanName, duplicatePhones: dupWarnings };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// mode: 'id' | 'name' | 'phone'; deleted: 'active' (default) | 'deleted' | 'all'
function listCustomers({ mode = 'name', query = '', districtId = null, deleted = 'active' } = {}) {
  const db = getDb();
  const q = (query || '').trim();
  const delCond = deleted === 'deleted' ? 'c.deleted_at IS NOT NULL' : deleted === 'all' ? '1=1' : 'c.deleted_at IS NULL';
  let where = '';
  let params = [];
  if (mode === 'id') {
    const n = parseInt(q, 10);
    if (q !== '' && (!Number.isFinite(n) || n <= 0)) return [];
    where = q === '' ? '1=1' : 'c.id = ?';
    params = q === '' ? [] : [n];
  } else if (mode === 'phone') {
    if (q === '') {
      where = '1=1';
    } else {
      where = `EXISTS (SELECT 1 FROM customer_phones p WHERE p.customer_id = c.id AND p.phone_number LIKE ?)`;
      params = [`%${q}%`];
    }
  } else {
    where = q === '' ? '1=1' : 'c.name LIKE ?';
    params = q === '' ? [] : [`%${q}%`];
  }
  return db.prepare(`
    SELECT c.id, c.name, c.district_id, d.name AS district_name,
      c.latitude, c.longitude, c.notes, c.deleted_at, c.created_at, c.updated_at,
      (SELECT COUNT(*) FROM customer_phones p WHERE p.customer_id = c.id) AS phone_count
    FROM customers c
    LEFT JOIN districts d ON d.id = c.district_id
    WHERE ${delCond} AND ${where}
      AND (? IS NULL OR c.district_id = ?)
    ORDER BY c.id DESC
  `).all(...params, districtId, districtId);
}

function getCustomer(id, includeDeleted = true) {
  const db = getDb();
  const row = db.prepare(`
    SELECT c.*, d.name AS district_name FROM customers c
    LEFT JOIN districts d ON d.id = c.district_id
    WHERE c.id = ? ${includeDeleted ? '' : 'AND c.deleted_at IS NULL'}
  `).get(id);
  if (!row) return null;
  row.phones = db.prepare('SELECT * FROM customer_phones WHERE customer_id = ? ORDER BY id').all(id);
  return row;
}

function updateCustomer({ id, name, district_id, latitude, longitude, notes }) {
  const db = getDb();
  const cleanName = (name || '').trim();
  if (!id) throw new Error('رقم الزبون مطلوب');
  if (!cleanName) throw new Error('اسم الزبون مطلوب');
  const lat = cleanGps(latitude, -90, 90, 'خط العرض يجب أن يكون بين -90 و 90');
  const lng = cleanGps(longitude, -180, 180, 'خط الطول يجب أن يكون بين -180 و 180');
  const r = db.prepare(`
    UPDATE customers SET name = ?, district_id = ?, latitude = ?, longitude = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(cleanName, district_id || null, lat, lng, (notes || '').trim(), id);
  if (r.changes === 0) throw new Error('الزبون غير موجود أو محذوف');
  return { id };
}

function deleteCustomer(id) {
  const r = getDb().prepare(`UPDATE customers SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(id);
  if (r.changes === 0) throw new Error('الزبون غير موجود أو محذوف مسبقاً');
  return { id };
}

function restoreCustomer(id) {
  const r = getDb().prepare(`UPDATE customers SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  if (r.changes === 0) throw new Error('الزبون غير موجود أو غير محذوف');
  return { id };
}

function addCustomerPhone({ customer_id, phone_number }) {
  const db = getDb();
  const ph = (phone_number || '').trim();
  if (!customer_id) throw new Error('رقم الزبون مطلوب');
  if (!ph) throw new Error('رقم الهاتف مطلوب');
  const cust = db.prepare('SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL').get(customer_id);
  if (!cust) throw new Error('الزبون غير موجود أو محذوف');
  const r = db.prepare('INSERT INTO customer_phones (customer_id, phone_number) VALUES (?, ?)').run(customer_id, ph);
  const owners = findPhoneOwners(ph, customer_id);
  return { id: Number(r.lastInsertRowid), duplicate: owners.length > 0, owners };
}

function deleteCustomerPhone(phoneId) {
  const r = getDb().prepare('DELETE FROM customer_phones WHERE id = ?').run(phoneId);
  if (r.changes === 0) throw new Error('رقم الهاتف غير موجود');
  return { id: phoneId };
}

module.exports = { init, addItem, listItems, addShipment, listShipments, listShipmentsDetailed, getOverview, listCategories, addCategory, listCompanies, addCompany, listDistricts, addDistrict, addCustomer, listCustomers, getCustomer, updateCustomer, deleteCustomer, restoreCustomer, addCustomerPhone, deleteCustomerPhone, findPhoneOwners };
