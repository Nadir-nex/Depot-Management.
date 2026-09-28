const { DatabaseSync } = require('node:sqlite');
const path = require('path');

let sqlite = null;
const DB_PATH = path.join(__dirname, 'database.sqlite');

function init() {
  sqlite = new DatabaseSync(DB_PATH);
  sqlite.exec('PRAGMA foreign_keys = ON');
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
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      delivery_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      discount_amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id),
      qty INTEGER NOT NULL CHECK (qty > 0),
      unit_price REAL NOT NULL CHECK (unit_price > 0),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(delivery_date);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orderitems_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_orderitems_item ON order_items(item_id);
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      deleted_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS employee_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      phone_number TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS employee_roles (
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      PRIMARY KEY (employee_id, role)
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plate_number TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_available INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
    CREATE INDEX IF NOT EXISTS idx_employees_deleted ON employees(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_emphones_employee ON employee_phones(employee_id);
    CREATE INDEX IF NOT EXISTS idx_emphones_number ON employee_phones(phone_number);
    CREATE INDEX IF NOT EXISTS idx_emroles_employee ON employee_roles(employee_id);
    CREATE INDEX IF NOT EXISTS idx_emroles_role ON employee_roles(role);
    CREATE INDEX IF NOT EXISTS idx_vehicles_name ON vehicles(name);
    CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_number);
    CREATE INDEX IF NOT EXISTS idx_vehicles_deleted ON vehicles(deleted_at);
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
      driver_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
      delivery_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
      started_at TEXT NULL,
      completed_at TEXT NULL,
      hidden_at TEXT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS delivery_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(delivery_id, customer_id)
    );
    CREATE TABLE IF NOT EXISTS delivery_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      stop_id INTEGER NOT NULL REFERENCES delivery_stops(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      delivered_at TEXT NULL,
      removed_at TEXT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(delivery_id, order_id)
    );
    CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(delivery_date);
    CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_vehicle ON deliveries(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_dstops_delivery ON delivery_stops(delivery_id);
    CREATE INDEX IF NOT EXISTS idx_dorders_delivery ON delivery_orders(delivery_id);
    CREATE INDEX IF NOT EXISTS idx_dorders_order ON delivery_orders(order_id);
    CREATE INDEX IF NOT EXISTS idx_dorders_stop ON delivery_orders(stop_id);
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

// Safe online backup: transactionally consistent snapshot written to a new
// file. The live database is never modified, moved, or replaced.
function exportBackup(targetPath) {
  const dest = String(targetPath || '').trim();
  if (!dest) throw new Error('مسار التصدير مطلوب');
  const fs = require('fs');
  if (fs.existsSync(dest)) fs.unlinkSync(dest); // save dialog already confirmed overwrite
  getDb().exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  return { path: dest };
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
  db.exec('BEGIN');
  try {
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
    // selling-price rule: product sells at its highest receipt sell_price —
    // synchronize all receipts of this product to the new maximum.
    const mx = db.prepare('SELECT MAX(sell_price) AS m FROM shipments WHERE item_id = ?').get(item_id).m;
    if (Number(mx) > 0) {
      db.prepare('UPDATE shipments SET sell_price = ? WHERE item_id = ? AND sell_price != ?').run(mx, item_id, mx);
    }
    db.exec('COMMIT');
    return { id: Number(r.lastInsertRowid) };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
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

// ---------------- Orders (Phase B) ----------------

const ORDER_STATUSES = ['draft', 'confirmed', 'waiting', 'out_for_delivery', 'delivered', 'cancelled'];
const ORDER_TRANSITIONS = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['waiting', 'cancelled'],
  waiting: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

function orderRef(orderId, customerId) {
  return `C${customerId}-${orderId}`;
}

// current selling price = highest receipt sell_price; stock = SUM(qty)
function productPricing(itemId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT COALESCE(MAX(sell_price), 0) AS price, COALESCE(SUM(qty), 0) AS stock
    FROM shipments WHERE item_id = ?
  `).get(itemId);
  return { price: Number(row.price) || 0, stock: Number(row.stock) || 0 };
}

// mode: 'name' | 'barcode' — products with price+stock for order building
function listProductsForOrder(mode = 'name', query = '') {
  const db = getDb();
  const q = (query || '').trim();
  const cond = q === '' ? '1=1' : (mode === 'barcode' ? `COALESCE(i.barcode,'') LIKE ?` : `i.name LIKE ?`);
  const params = q === '' ? [] : [`%${q}%`];
  return db.prepare(`
    SELECT i.id, i.name, i.barcode,
      COALESCE(MAX(s.sell_price), 0) AS price,
      COALESCE(SUM(s.qty), 0) AS stock
    FROM items i
    LEFT JOIN shipments s ON s.item_id = i.id
    WHERE ${cond}
    GROUP BY i.id
    ORDER BY i.name
    LIMIT 100
  `).all(...params);
}

function combineItems(items) {
  const map = new Map();
  for (const it of (items || [])) {
    const itemId = Number(it.item_id);
    const qty = Number(it.qty);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new Error('منتج غير صالح في الطلبية');
    if (!Number.isInteger(qty) || qty <= 0) throw new Error('الكمية يجب أن تكون عدداً صحيحاً أكبر من 0');
    map.set(itemId, (map.get(itemId) || 0) + qty);
  }
  if (!map.size) throw new Error('الطلبية يجب أن تحتوي على منتج واحد على الأقل');
  return [...map.entries()].map(([item_id, qty]) => ({ item_id, qty }));
}

function checkDiscount(discount, subtotal) {
  const d = Number(discount) || 0;
  if (!Number.isFinite(d) || d < 0) throw new Error('التخفيض يجب أن يكون 0 أو أكثر');
  if (d > subtotal) throw new Error('التخفيض لا يمكن أن يتجاوز المجموع');
  return d;
}

function validDeliveryDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('تاريخ التوصيل يجب أن يكون YYYY-MM-DD');
  return s;
}

function getActiveCustomer(db, customerId) {
  const c = db.prepare('SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL').get(customerId);
  if (!c) throw new Error('الزبون غير موجود أو محذوف');
  return c;
}

function createOrder({ customer_id, notes, discount_amount, items }) {
  const db = getDb();
  const cid = Number(customer_id);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error('اختر الزبون');
  getActiveCustomer(db, cid);
  const combined = combineItems(items);
  db.exec('BEGIN');
  try {
    let subtotal = 0;
    const priced = combined.map(({ item_id, qty }) => {
      const prod = db.prepare('SELECT id FROM items WHERE id = ?').get(item_id);
      if (!prod) throw new Error('منتج غير موجود في المخزون');
      const { price } = productPricing(item_id);
      if (!(price > 0)) throw new Error('لا يوجد سعر بيع صالح لهذا المنتج — حدّث السعر في المخزون أولاً');
      subtotal += qty * price;
      return { item_id, qty, unit_price: price };
    });
    const discount = checkDiscount(discount_amount, subtotal);
    // orders.delivery_date = actual delivery date only — stays NULL until delivered
    const r = db.prepare(`
      INSERT INTO orders (customer_id, delivery_date, status, discount_amount, notes)
      VALUES (?, NULL, 'draft', ?, ?)
    `).run(cid, discount, (notes || '').trim());
    const orderId = Number(r.lastInsertRowid);
    const ins = db.prepare('INSERT INTO order_items (order_id, item_id, qty, unit_price) VALUES (?, ?, ?, ?)');
    for (const p of priced) ins.run(orderId, p.item_id, p.qty, p.unit_price);
    db.exec('COMMIT');
    return { id: orderId, reference: orderRef(orderId, cid) };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function getDraftOrder(db, id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw new Error('الطلبية غير موجودة');
  if (o.status !== 'draft') throw new Error('لا يمكن تعديل طلبية غير مسودة');
  return o;
}

// full replace of a draft order (customer, notes, discount, items) — delivery_date untouched (actual date only)
function updateDraftOrder({ id, customer_id, notes, discount_amount, items }) {
  const db = getDb();
  const o = getDraftOrder(db, id);
  void o;
  const cid = Number(customer_id);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error('اختر الزبون');
  getActiveCustomer(db, cid);
  const combined = combineItems(items);
  db.exec('BEGIN');
  try {
    let subtotal = 0;
    const priced = combined.map(({ item_id, qty }) => {
      const prod = db.prepare('SELECT id FROM items WHERE id = ?').get(item_id);
      if (!prod) throw new Error('منتج غير موجود في المخزون');
      const { price } = productPricing(item_id);
      if (!(price > 0)) throw new Error('لا يوجد سعر بيع صالح لهذا المنتج — حدّث السعر في المخزون أولاً');
      subtotal += qty * price;
      return { item_id, qty, unit_price: price };
    });
    const discount = checkDiscount(discount_amount, subtotal);
    db.prepare(`UPDATE orders SET customer_id = ?, discount_amount = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(cid, discount, (notes || '').trim(), id);
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
    const ins = db.prepare('INSERT INTO order_items (order_id, item_id, qty, unit_price) VALUES (?, ?, ?, ?)');
    for (const p of priced) ins.run(id, p.item_id, p.qty, p.unit_price);
    db.exec('COMMIT');
    return { id, reference: orderRef(id, cid) };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function orderTotals(order, items) {
  const subtotal = items.reduce((a, i) => a + Number(i.qty) * Number(i.unit_price), 0);
  const discount = Number(order.discount_amount) || 0;
  return { subtotal, discount, total: subtotal - discount };
}

function stockWarnings(items) {
  const db = getDb();
  return items.map(i => {
    const { stock } = productPricing(i.item_id);
    return { item_id: i.item_id, qty: i.qty, stock, short: Number(i.qty) > Number(stock) };
  }).filter(w => w.short);
}

function getOrder(id) {
  const db = getDb();
  const o = db.prepare(`
    SELECT o.*, c.name AS customer_name, c.deleted_at AS customer_deleted,
      d.name AS district_name
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN districts d ON d.id = c.district_id
    WHERE o.id = ?
  `).get(id);
  if (!o) return null;
  o.reference = orderRef(o.id, o.customer_id);
  o.items = db.prepare(`
    SELECT oi.*, i.name AS item_name, i.barcode FROM order_items oi
    JOIN items i ON i.id = oi.item_id
    WHERE oi.order_id = ? ORDER BY oi.id
  `).all(id);
  const t = orderTotals(o, o.items);
  o.subtotal = t.subtotal;
  o.total = t.total;
  o.warnings = stockWarnings(o.items);
  return o;
}

function confirmOrder(id) {
  const db = getDb();
  const o = getDraftOrder(db, id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  if (!items.length) throw new Error('لا يمكن تأكيد طلبية فارغة');
  getActiveCustomer(db, o.customer_id);
  for (const i of items) {
    if (!Number.isInteger(Number(i.qty)) || Number(i.qty) <= 0) throw new Error('كمية غير صالحة في الطلبية');
    if (!(Number(i.unit_price) > 0)) throw new Error('سعر غير صالح في الطلبية');
    if (!db.prepare('SELECT id FROM items WHERE id = ?').get(i.item_id)) throw new Error('منتج غير موجود في المخزون');
  }
  const t = orderTotals(o, items);
  checkDiscount(o.discount_amount, t.subtotal);
  if (t.total < 0) throw new Error('الإجمالي لا يمكن أن يكون سالباً');
  db.prepare(`UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`).run(id);
  return { id, warnings: stockWarnings(items) };
}

function setOrderStatus(id, to) {
  const db = getDb();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw new Error('الطلبية غير موجودة');
  if (!ORDER_STATUSES.includes(to)) throw new Error('حالة غير صالحة');
  if (!ORDER_TRANSITIONS[o.status].includes(to)) throw new Error(`لا يمكن الانتقال من ${o.status} إلى ${to}`);
  // direct delivered-marking stamps the actual date when still empty
  if (to === 'delivered') {
    db.prepare(`UPDATE orders SET status = 'delivered', delivery_date = COALESCE(delivery_date, date('now')), updated_at = datetime('now') WHERE id = ?`).run(id);
  } else {
    db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(to, id);
  }
  // cancelling closes any active delivery membership, history rows stay
  if (to === 'cancelled') detachOrderFromDeliveries(id);
  return { id, status: to };
}

function setDeliveryDate(id, deliveryDate) {
  const db = getDb();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw new Error('الطلبية غير موجودة');
  if (o.status === 'delivered' || o.status === 'cancelled') throw new Error('لا يمكن تغيير تاريخ طلبية مكتملة أو ملغاة');
  db.prepare(`UPDATE orders SET delivery_date = ?, updated_at = datetime('now') WHERE id = ?`).run(validDeliveryDate(deliveryDate), id);
  return { id };
}

function deleteOrder(id) {
  const db = getDb();
  try {
    const r = db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    if (r.changes === 0) throw new Error('الطلبية غير موجودة');
  } catch (e) {
    if (String(e.message).includes('FOREIGN KEY')) throw new Error('لا يمكن حذف طلبية مرتبطة بسجل توصيل');
    throw e;
  }
  return { id };
}

// modes: 'id' | 'reference' | 'customer_id' | 'customer_name' | 'phone'
function listOrders({ mode = 'id', query = '', status = null, districtId = null, customerId = null, deliveryDate = null, sort = 'newest' } = {}) {
  const db = getDb();
  const q = (query || '').trim();
  let where = '1=1';
  let params = [];
  if (q !== '') {
    if (mode === 'id') {
      const n = parseInt(q, 10);
      if (!Number.isFinite(n) || n <= 0) return [];
      where = 'o.id = ?'; params = [n];
    } else if (mode === 'reference') {
      const m = q.match(/^C?\s*(\d+)\s*-\s*(\d+)$/i);
      if (m) { where = '(o.id = ? AND o.customer_id = ?)'; params = [Number(m[2]), Number(m[1])]; }
      else {
        const n = parseInt(q, 10);
        if (!Number.isFinite(n) || n <= 0) return [];
        where = 'o.id = ?'; params = [n];
      }
    } else if (mode === 'customer_id') {
      const n = parseInt(q, 10);
      if (!Number.isFinite(n) || n <= 0) return [];
      where = 'o.customer_id = ?'; params = [n];
    } else if (mode === 'phone') {
      where = `EXISTS (SELECT 1 FROM customer_phones p WHERE p.customer_id = o.customer_id AND p.phone_number LIKE ?)`;
      params = [`%${q}%`];
    } else {
      where = 'c.name LIKE ?'; params = [`%${q}%`];
    }
  }
  const orderBy = sort === 'oldest' ? 'o.id ASC' : 'o.id DESC';
  // status 'active' = confirmed + waiting + out_for_delivery (quick-filter group)
  let statusCond = '(? IS NULL OR o.status = ?)';
  let statusParams = [status, status];
  if (status === 'active') {
    statusCond = `o.status IN ('confirmed','waiting','out_for_delivery')`;
    statusParams = [];
  }
  return db.prepare(`
    SELECT o.id, o.customer_id, c.name AS customer_name, d.name AS district_name,
      o.delivery_date, o.status, o.discount_amount, o.created_at,
      COALESCE((SELECT SUM(qty * unit_price) FROM order_items WHERE order_id = o.id), 0) AS subtotal,
      COALESCE((SELECT SUM(qty * unit_price) FROM order_items WHERE order_id = o.id), 0) - o.discount_amount AS total,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN districts d ON d.id = c.district_id
    WHERE ${where}
      AND ${statusCond}
      AND (? IS NULL OR c.district_id = ?)
      AND (? IS NULL OR o.customer_id = ?)
      AND (? IS NULL OR o.delivery_date = ?)
    ORDER BY ${orderBy}
    LIMIT 500
  `).all(...params, ...statusParams, districtId, districtId, customerId, customerId, deliveryDate, deliveryDate)
    .map(r => ({ ...r, reference: orderRef(r.id, r.customer_id) }));
}

function listCustomerOrders(customerId) {
  const db = getDb();
  return db.prepare(`
    SELECT o.id, o.delivery_date, o.status, o.discount_amount, o.created_at,
      COALESCE((SELECT SUM(qty * unit_price) FROM order_items WHERE order_id = o.id), 0) AS subtotal,
      COALESCE((SELECT SUM(qty * unit_price) FROM order_items WHERE order_id = o.id), 0) - o.discount_amount AS total,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o WHERE o.customer_id = ? ORDER BY o.id DESC LIMIT 200
  `).all(customerId).map(r => ({ ...r, reference: orderRef(r.id, customerId) }));
}

// ---------------- Staff & Vehicles (Phase C) ----------------

const EMPLOYEE_ROLES = ['collector', 'driver'];

function cleanRoles(roles) {
  const list = [...new Set((roles || []).map(r => String(r).trim()).filter(Boolean))];
  for (const r of list) {
    if (!EMPLOYEE_ROLES.includes(r)) throw new Error('دور غير صالح: ' + r);
  }
  return list;
}

function employeeRolesMap(db, ids) {
  const map = {};
  if (!ids.length) return map;
  const rows = db.prepare(`SELECT employee_id, role FROM employee_roles WHERE employee_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  for (const r of rows) (map[r.employee_id] = map[r.employee_id] || []).push(r.role);
  return map;
}

function employeePhonesMap(db, ids) {
  const map = {};
  if (!ids.length) return map;
  const rows = db.prepare(`SELECT id, employee_id, phone_number FROM employee_phones WHERE employee_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids);
  for (const r of rows) (map[r.employee_id] = map[r.employee_id] || []).push({ id: r.id, phone_number: r.phone_number });
  return map;
}

// mode: 'id' | 'name' | 'phone'; deleted: 'active' (default) | 'deleted'
function listEmployees({ mode = 'name', query = '', deleted = 'active' } = {}) {
  const db = getDb();
  const q = (query || '').trim();
  const delCond = deleted === 'deleted' ? 'e.deleted_at IS NOT NULL' : 'e.deleted_at IS NULL';
  let where = '1=1';
  let params = [];
  if (q !== '') {
    if (mode === 'id') {
      const num = parseInt(q, 10);
      if (!Number.isFinite(num) || num <= 0) return [];
      where = 'e.id = ?'; params = [num];
    } else if (mode === 'phone') {
      where = `EXISTS (SELECT 1 FROM employee_phones p WHERE p.employee_id = e.id AND p.phone_number LIKE ?)`;
      params = [`%${q}%`];
    } else {
      where = 'e.name LIKE ?'; params = [`%${q}%`];
    }
  }
  const rows = db.prepare(`
    SELECT e.* FROM employees e WHERE ${delCond} AND ${where} ORDER BY e.id DESC LIMIT 500
  `).all(...params);
  const ids = rows.map(r => r.id);
  const roles = employeeRolesMap(db, ids);
  const phones = employeePhonesMap(db, ids);
  return rows.map(r => ({ ...r, roles: roles[r.id] || [], phones: phones[r.id] || [] }));
}

function getEmployee(id, includeDeleted = true) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM employees WHERE id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`).get(id);
  if (!row) return null;
  row.roles = (db.prepare('SELECT role FROM employee_roles WHERE employee_id = ?').all(id)).map(r => r.role);
  row.phones = db.prepare('SELECT * FROM employee_phones WHERE employee_id = ? ORDER BY id').all(id);
  return row;
}

function addEmployee({ name, notes, phones, roles }) {
  const db = getDb();
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('اسم الموظف مطلوب');
  const roleList = cleanRoles(roles);
  const phoneList = (phones || []).map(p => (p || '').trim()).filter(Boolean);
  db.exec('BEGIN');
  try {
    const r = db.prepare('INSERT INTO employees (name, notes) VALUES (?, ?)').run(cleanName, (notes || '').trim());
    const id = Number(r.lastInsertRowid);
    const insP = db.prepare('INSERT INTO employee_phones (employee_id, phone_number) VALUES (?, ?)');
    for (const ph of phoneList) insP.run(id, ph);
    const insR = db.prepare('INSERT INTO employee_roles (employee_id, role) VALUES (?, ?)');
    for (const role of roleList) insR.run(id, role);
    db.exec('COMMIT');
    return { id, name: cleanName };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function updateEmployee({ id, name, notes }) {
  const db = getDb();
  const cleanName = (name || '').trim();
  if (!id) throw new Error('رقم الموظف مطلوب');
  if (!cleanName) throw new Error('اسم الموظف مطلوب');
  const r = db.prepare(`UPDATE employees SET name = ?, notes = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
    .run(cleanName, (notes || '').trim(), id);
  if (r.changes === 0) throw new Error('الموظف غير موجود أو محذوف');
  return { id };
}

function deleteEmployee(id) {
  const r = getDb().prepare(`UPDATE employees SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(id);
  if (r.changes === 0) throw new Error('الموظف غير موجود أو محذوف مسبقاً');
  return { id };
}

function restoreEmployee(id) {
  const r = getDb().prepare(`UPDATE employees SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  if (r.changes === 0) throw new Error('الموظف غير موجود أو غير محذوف');
  return { id };
}

function addEmployeePhone({ employee_id, phone_number }) {
  const db = getDb();
  const ph = (phone_number || '').trim();
  if (!employee_id) throw new Error('رقم الموظف مطلوب');
  if (!ph) throw new Error('رقم الهاتف مطلوب');
  if (!db.prepare('SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL').get(employee_id)) throw new Error('الموظف غير موجود أو محذوف');
  const r = db.prepare('INSERT INTO employee_phones (employee_id, phone_number) VALUES (?, ?)').run(employee_id, ph);
  return { id: Number(r.lastInsertRowid) };
}

function deleteEmployeePhone(phoneId) {
  const r = getDb().prepare('DELETE FROM employee_phones WHERE id = ?').run(phoneId);
  if (r.changes === 0) throw new Error('رقم الهاتف غير موجود');
  return { id: phoneId };
}

function setEmployeeRoles({ employee_id, roles }) {
  const db = getDb();
  if (!db.prepare('SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL').get(employee_id)) throw new Error('الموظف غير موجود أو محذوف');
  const clean = cleanRoles(roles);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM employee_roles WHERE employee_id = ?').run(employee_id);
    const ins = db.prepare('INSERT INTO employee_roles (employee_id, role) VALUES (?, ?)');
    for (const role of clean) ins.run(employee_id, role);
    db.exec('COMMIT');
    return { employee_id, roles: clean };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// future Delivery selection: active employees holding the role
function listEmployeesByRole(role) {
  const db = getDb();
  if (!EMPLOYEE_ROLES.includes(role)) throw new Error('دور غير صالح');
  const rows = db.prepare(`
    SELECT e.* FROM employees e
    JOIN employee_roles r ON r.employee_id = e.id
    WHERE e.deleted_at IS NULL AND r.role = ? ORDER BY e.name
  `).all(role);
  const ids = rows.map(r => r.id);
  const phones = employeePhonesMap(db, ids);
  return rows.map(r => ({ ...r, phones: phones[r.id] || [] }));
}

// ---- vehicles ----
function listVehicles({ mode = 'name', query = '', deleted = 'active' } = {}) {
  const db = getDb();
  const q = (query || '').trim();
  const delCond = deleted === 'deleted' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
  if (q !== '' && mode === 'id') {
    const num = parseInt(q, 10);
    if (!Number.isFinite(num) || num <= 0) return [];
    return db.prepare(`SELECT * FROM vehicles WHERE ${delCond} AND id = ? ORDER BY id DESC`).all(num);
  }
  const cond = q === '' ? '1=1' : (mode === 'plate' ? `COALESCE(plate_number,'') LIKE ?` : `name LIKE ?`);
  const params = q === '' ? [] : [`%${q}%`];
  return db.prepare(`SELECT * FROM vehicles WHERE ${delCond} AND ${cond} ORDER BY id DESC LIMIT 500`).all(...params);
}

function getVehicle(id, includeDeleted = true) {
  return getDb().prepare(`SELECT * FROM vehicles WHERE id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`).get(id) || null;
}

function addVehicle({ name, plate_number, notes, is_available }) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('اسم المركبة مطلوب');
  const r = getDb().prepare('INSERT INTO vehicles (name, plate_number, notes, is_available) VALUES (?, ?, ?, ?)')
    .run(cleanName, (plate_number || '').trim(), (notes || '').trim(), is_available === false || is_available === 0 ? 0 : 1);
  return { id: Number(r.lastInsertRowid), name: cleanName };
}

function updateVehicle({ id, name, plate_number, notes, is_available }) {
  const cleanName = (name || '').trim();
  if (!id) throw new Error('رقم المركبة مطلوب');
  if (!cleanName) throw new Error('اسم المركبة مطلوب');
  const r = getDb().prepare(`UPDATE vehicles SET name = ?, plate_number = ?, notes = ?, is_available = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
    .run(cleanName, (plate_number || '').trim(), (notes || '').trim(), is_available === false || is_available === 0 ? 0 : 1, id);
  if (r.changes === 0) throw new Error('المركبة غير موجودة أو محذوفة');
  return { id };
}

function deleteVehicle(id) {
  const r = getDb().prepare(`UPDATE vehicles SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).run(id);
  if (r.changes === 0) throw new Error('المركبة غير موجودة أو محذوفة مسبقاً');
  return { id };
}

function restoreVehicle(id) {
  const r = getDb().prepare(`UPDATE vehicles SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  if (r.changes === 0) throw new Error('المركبة غير موجودة أو غير محذوفة');
  return { id };
}

function setVehicleAvailability({ id, is_available }) {
  const r = getDb().prepare(`UPDATE vehicles SET is_available = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
    .run(is_available ? 1 : 0, id);
  if (r.changes === 0) throw new Error('المركبة غير موجودة أو محذوفة');
  return { id, is_available: is_available ? 1 : 0 };
}

// ---------------- Deliveries (Phase D) ----------------
// orders.delivery_date = actual calendar date, set ONLY when the order is delivered.

const DELIVERY_STATUSES = ['planned', 'in_progress', 'completed'];

function getDeliveryRow(db, id, includeHidden = true) {
  const d = db.prepare(`SELECT * FROM deliveries WHERE id = ? ${includeHidden ? '' : 'AND hidden_at IS NULL'}`).get(id);
  if (!d) throw new Error('شحنة التوصيل غير موجودة');
  return d;
}

function checkDriver(db, driverId) {
  const e = db.prepare(`SELECT e.id FROM employees e JOIN employee_roles r ON r.employee_id = e.id WHERE e.id = ? AND e.deleted_at IS NULL AND r.role = 'driver'`).get(driverId);
  if (!e) throw new Error('اختر سائقاً (موظف بدور سائق وغير محذوف)');
}

function checkVehicle(db, vehicleId) {
  const v = db.prepare('SELECT id, is_available FROM vehicles WHERE id = ? AND deleted_at IS NULL').get(vehicleId);
  if (!v) throw new Error('المركبة غير موجودة أو محذوفة');
  if (!v.is_available) throw new Error('المركبة غير متوفرة للعمل');
  return v;
}

// eligible: confirmed/waiting (spec §10); not delivered/cancelled/draft;
// not actively assigned to another visible delivery.
function checkOrderEligible(db, orderId) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) throw new Error('الطلبية غير موجودة');
  if (o.status === 'draft') throw new Error('لا يمكن إرفاق طلبية مسودة');
  if (o.status === 'cancelled') throw new Error('لا يمكن إرفاق طلبية ملغاة');
  if (o.status === 'delivered') throw new Error('الطلبية تم توصيلها مسبقاً');
  const busy = db.prepare(`
    SELECT 1 FROM delivery_orders m
    WHERE m.order_id = ? AND m.removed_at IS NULL AND m.delivered_at IS NULL
  `).get(orderId);
  if (busy) throw new Error('الطلبية مرفقة بشحنة توصيل نشطة أخرى');
  return o;
}

function findOrCreateStop(db, deliveryId, customerId) {
  let stop = db.prepare('SELECT * FROM delivery_stops WHERE delivery_id = ? AND customer_id = ?').get(deliveryId, customerId);
  if (stop) return stop;
  const maxSeq = db.prepare('SELECT COALESCE(MAX(sequence), 0) AS m FROM delivery_stops WHERE delivery_id = ?').get(deliveryId).m;
  const r = db.prepare('INSERT INTO delivery_stops (delivery_id, customer_id, sequence) VALUES (?, ?, ?)').run(deliveryId, customerId, Number(maxSeq) + 1);
  return db.prepare('SELECT * FROM delivery_stops WHERE id = ?').get(r.lastInsertRowid);
}

// committed demand per product: confirmed/waiting/out_for_delivery order lines
// that are assigned to a visible delivery and not yet delivered/removed.
function committedDemand(db) {
  const rows = db.prepare(`
    SELECT oi.item_id, COALESCE(SUM(oi.qty), 0) AS demand
    FROM delivery_orders m
    JOIN orders o ON o.id = m.order_id
    JOIN order_items oi ON oi.order_id = o.id
    WHERE m.removed_at IS NULL AND m.delivered_at IS NULL
      AND o.status IN ('confirmed', 'waiting', 'out_for_delivery')
    GROUP BY oi.item_id
  `).all();
  const map = {};
  for (const r of rows) map[r.item_id] = Number(r.demand);
  return map;
}

function physicalStock(db) {
  const rows = db.prepare('SELECT item_id, COALESCE(SUM(qty), 0) AS stock FROM shipments GROUP BY item_id').all();
  const map = {};
  for (const r of rows) map[r.item_id] = Number(r.stock);
  return map;
}

// stock preflight for a delivery: per-product {need, stock, demand(others), short}
function deliveryStockCheck(deliveryId) {
  const db = getDb();
  getDeliveryRow(db, deliveryId);
  const need = db.prepare(`
    SELECT oi.item_id, i.name AS item_name, COALESCE(SUM(oi.qty), 0) AS need
    FROM delivery_orders m
    JOIN order_items oi ON oi.order_id = m.order_id
    JOIN items i ON i.id = oi.item_id
    WHERE m.delivery_id = ? AND m.removed_at IS NULL AND m.delivered_at IS NULL
    GROUP BY oi.item_id
  `).all(deliveryId);
  const demand = committedDemand(db);
  const stock = physicalStock(db);
  return need.map(n => {
    const others = Math.max(0, (demand[n.item_id] || 0) - Number(n.need));
    const avail = (stock[n.item_id] || 0);
    return { item_id: n.item_id, item_name: n.item_name, need: Number(n.need), stock: avail, other_demand: others, short: Number(n.need) + others > avail };
  }).filter(w => w.short);
}

function createDelivery({ delivery_date, district_id, driver_id, vehicle_id, order_ids }) {
  const db = getDb();
  const date = validDeliveryDate(delivery_date);
  if (!date) throw new Error('تاريخ التوصيل مطلوب (YYYY-MM-DD)');
  const did = Number(district_id);
  if (district_id !== null && district_id !== undefined && district_id !== '' && !db.prepare('SELECT id FROM districts WHERE id = ?').get(did)) throw new Error('الحي الرئيسي غير موجود');
  checkDriver(db, Number(driver_id));
  checkVehicle(db, Number(vehicle_id));
  const ids = [...new Set((order_ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) throw new Error('شحنة التوصيل يجب أن تحتوي على طلبية واحدة على الأقل');
  db.exec('BEGIN');
  try {
    const r = db.prepare(`INSERT INTO deliveries (district_id, driver_id, vehicle_id, delivery_date, status) VALUES (?, ?, ?, ?, 'planned')`)
      .run(district_id ? did : null, Number(driver_id), Number(vehicle_id), date);
    const deliveryId = Number(r.lastInsertRowid);
    for (const oid of ids) {
      const o = checkOrderEligible(db, oid);
      const stop = findOrCreateStop(db, deliveryId, o.customer_id);
      db.prepare('INSERT INTO delivery_orders (delivery_id, stop_id, order_id) VALUES (?, ?, ?)').run(deliveryId, stop.id, oid);
    }
    db.exec('COMMIT');
    return { id: deliveryId };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function updatePlannedDelivery({ id, delivery_date, district_id, driver_id, vehicle_id }) {
  const db = getDb();
  const d = getDeliveryRow(db, id);
  if (d.status !== 'planned') throw new Error('لا يمكن تعديل شحنة بدأت أو اكتملت');
  const date = validDeliveryDate(delivery_date);
  if (!date) throw new Error('تاريخ التوصيل مطلوب');
  checkDriver(db, Number(driver_id));
  checkVehicle(db, Number(vehicle_id));
  const did = district_id ? Number(district_id) : null;
  if (did && !db.prepare('SELECT id FROM districts WHERE id = ?').get(did)) throw new Error('الحي الرئيسي غير موجود');
  db.prepare(`UPDATE deliveries SET delivery_date = ?, district_id = ?, driver_id = ?, vehicle_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(date, did, Number(driver_id), Number(vehicle_id), id);
  return { id };
}

function addOrderToDelivery({ delivery_id, order_id }) {
  const db = getDb();
  const d = getDeliveryRow(db, delivery_id);
  if (d.status !== 'planned') throw new Error('لا يمكن إضافة طلبيات بعد بدء الشحنة');
  db.exec('BEGIN');
  try {
    const o = checkOrderEligible(db, Number(order_id));
    const stop = findOrCreateStop(db, delivery_id, o.customer_id);
    db.prepare('INSERT INTO delivery_orders (delivery_id, stop_id, order_id) VALUES (?, ?, ?)').run(delivery_id, stop.id, o.id);
    db.exec('COMMIT');
    return { delivery_id, order_id: o.id, stop_id: stop.id };
  } catch (e) {
    db.exec('ROLLBACK');
    if (String(e.message).includes('UNIQUE')) throw new Error('الطلبية مرفقة بهذه الشحنة مسبقاً');
    throw e;
  }
}

function removeOrderFromDelivery({ delivery_id, order_id }) {
  const db = getDb();
  const d = getDeliveryRow(db, delivery_id);
  const m = db.prepare('SELECT * FROM delivery_orders WHERE delivery_id = ? AND order_id = ? AND removed_at IS NULL').get(delivery_id, order_id);
  if (!m) throw new Error('الطلبية غير مرفقة بهذه الشحنة');
  if (m.delivered_at) throw new Error('لا يمكن إزالة طلبية تم توصيلها');
  if (d.status === 'planned') {
    db.prepare('DELETE FROM delivery_orders WHERE id = ?').run(m.id);
  } else {
    db.prepare(`UPDATE delivery_orders SET removed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(m.id);
  }
  // drop stops left without active memberships (planned only; history preserved otherwise)
  if (d.status === 'planned') {
    db.prepare(`DELETE FROM delivery_stops WHERE id = ? AND NOT EXISTS (SELECT 1 FROM delivery_orders WHERE stop_id = delivery_stops.id)`).run(m.stop_id);
  }
  return { delivery_id, order_id };
}

function reorderStops({ delivery_id, stop_ids }) {
  const db = getDb();
  const d = getDeliveryRow(db, delivery_id);
  if (d.status !== 'planned') throw new Error('لا يمكن إعادة ترتيب التوقفات بعد بدء الشحنة');
  const existing = db.prepare('SELECT id FROM delivery_stops WHERE delivery_id = ?').all(delivery_id).map(s => s.id).sort((a, b) => a - b);
  const given = [...stop_ids].map(Number).sort((a, b) => a - b);
  if (existing.length !== given.length || existing.some((v, i) => v !== given[i])) throw new Error('قائمة التوقفات غير صالحة');
  db.exec('BEGIN');
  try {
    const upd = db.prepare('UPDATE delivery_stops SET sequence = ?, updated_at = datetime(\'now\') WHERE id = ?');
    [...stop_ids].map(Number).forEach((sid, i) => upd.run(i + 1, sid));
    db.exec('COMMIT');
    return { delivery_id };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function startDelivery(id) {
  const db = getDb();
  const d = getDeliveryRow(db, id);
  if (d.status !== 'planned') throw new Error('لا يمكن بدء شحنة بدأت أو اكتملت');
  const count = db.prepare('SELECT COUNT(*) AS c FROM delivery_orders WHERE delivery_id = ? AND removed_at IS NULL').get(id).c;
  if (!count) throw new Error('لا يمكن بدء شحنة فارغة');
  db.prepare(`UPDATE deliveries SET status = 'in_progress', started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
  const warnings = deliveryStockCheck(id);
  return { id, warnings };
}

function deliverOrder({ delivery_id, order_id }) {
  const db = getDb();
  const d = getDeliveryRow(db, delivery_id);
  if (d.status !== 'in_progress') throw new Error('توصيل الطلبيات متاح فقط أثناء سير الشحنة');
  const m = db.prepare('SELECT * FROM delivery_orders WHERE delivery_id = ? AND order_id = ? AND removed_at IS NULL AND delivered_at IS NULL').get(delivery_id, order_id);
  if (!m) throw new Error('الطلبية غير متاحة للتوصيل في هذه الشحنة');
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!o || o.status === 'cancelled') throw new Error('لا يمكن توصيل طلبية ملغاة');
  if (o.status === 'delivered') throw new Error('الطلبية تم توصيلها مسبقاً');
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE delivery_orders SET delivered_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(m.id);
    db.prepare(`UPDATE orders SET status = 'delivered', delivery_date = date('now'), updated_at = datetime('now') WHERE id = ?`).run(order_id);
    db.exec('COMMIT');
    return { delivery_id, order_id };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function completeDelivery(id) {
  const db = getDb();
  const d = getDeliveryRow(db, id);
  if (d.status !== 'in_progress') throw new Error('لا يمكن إنهاء شحنة لم تبدأ');
  db.prepare(`UPDATE deliveries SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
  return { id };
}

function hideDelivery(id) {
  const db = getDb();
  const d = getDeliveryRow(db, id);
  if (d.status === 'planned') throw new Error('الشحنة المخططة تُحذف بدل إخفائها');
  db.prepare(`UPDATE deliveries SET hidden_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
  return { id };
}

function deleteDelivery(id) {
  const db = getDb();
  const d = getDeliveryRow(db, id);
  if (d.status !== 'planned') throw new Error('لا يمكن حذف شحنة بدأت — أخفها بدل ذلك');
  db.prepare('DELETE FROM deliveries WHERE id = ?').run(id);
  return { id };
}

// an order cancelled in Orders while assigned: close active membership, keep history
function detachOrderFromDeliveries(orderId) {
  const db = getDb();
  db.prepare(`UPDATE delivery_orders SET removed_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ? AND removed_at IS NULL AND delivered_at IS NULL`).run(orderId);
}

function getDelivery(id) {
  const db = getDb();
  const d = db.prepare(`
    SELECT d.*, e.name AS driver_name, v.name AS vehicle_name, t.name AS district_name
    FROM deliveries d
    LEFT JOIN employees e ON e.id = d.driver_id
    LEFT JOIN vehicles v ON v.id = d.vehicle_id
    LEFT JOIN districts t ON t.id = d.district_id
    WHERE d.id = ?
  `).get(id);
  if (!d) return null;
  const stops = db.prepare(`
    SELECT s.*, c.name AS customer_name, t.name AS district_name
    FROM delivery_stops s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN districts t ON t.id = c.district_id
    WHERE s.delivery_id = ? ORDER BY s.sequence
  `).all(id);
  const stopIds = stops.map(s => s.id);
  let memberships = [];
  if (stopIds.length) {
    memberships = db.prepare(`
      SELECT m.*, o.customer_id, o.status AS order_status, o.delivery_date AS order_delivery_date,
        COALESCE((SELECT SUM(qty * unit_price) FROM order_items WHERE order_id = o.id), 0) - o.discount_amount AS total,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
      FROM delivery_orders m JOIN orders o ON o.id = m.order_id
      WHERE m.stop_id IN (${stopIds.map(() => '?').join(',')})
    `).all(...stopIds);
  }
  const byStop = {};
  for (const m of memberships) {
    m.reference = orderRef(m.order_id, m.customer_id);
    (byStop[m.stop_id] = byStop[m.stop_id] || []).push(m);
  }
  d.stops = stops.map(s => ({ ...s, orders: byStop[s.id] || [] }));
  d.order_count = memberships.filter(m => !m.removed_at).length;
  d.delivered_count = memberships.filter(m => m.delivered_at).length;
  d.warnings = d.status === 'planned' ? [] : deliveryStockCheckSafe(db, id);
  return d;
}

function deliveryStockCheckSafe(db, id) {
  try {
    const need = db.prepare(`
      SELECT oi.item_id, i.name AS item_name, COALESCE(SUM(oi.qty), 0) AS need
      FROM delivery_orders m
      JOIN order_items oi ON oi.order_id = m.order_id
      JOIN items i ON i.id = oi.item_id
      WHERE m.delivery_id = ? AND m.removed_at IS NULL AND m.delivered_at IS NULL
      GROUP BY oi.item_id
    `).all(id);
    const demand = committedDemand(db);
    const stock = physicalStock(db);
    return need.map(n => {
      const others = Math.max(0, (demand[n.item_id] || 0) - Number(n.need));
      return { item_id: n.item_id, item_name: n.item_name, need: Number(n.need), stock: stock[n.item_id] || 0, other_demand: others, short: Number(n.need) + others > (stock[n.item_id] || 0) };
    }).filter(w => w.short);
  } catch { return []; }
}

function listDeliveries({ status = null, date = null, districtId = null, driverId = null, vehicleId = null, includeHidden = false } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT d.*, e.name AS driver_name, v.name AS vehicle_name, t.name AS district_name,
      (SELECT COUNT(*) FROM delivery_stops WHERE delivery_id = d.id) AS stop_count,
      (SELECT COUNT(*) FROM delivery_orders WHERE delivery_id = d.id AND removed_at IS NULL) AS order_count,
      (SELECT COUNT(*) FROM delivery_orders WHERE delivery_id = d.id AND delivered_at IS NOT NULL) AS delivered_count
    FROM deliveries d
    LEFT JOIN employees e ON e.id = d.driver_id
    LEFT JOIN vehicles v ON v.id = d.vehicle_id
    LEFT JOIN districts t ON t.id = d.district_id
    WHERE (? = 1 OR d.hidden_at IS NULL)
      AND (? IS NULL OR d.status = ?)
      AND (? IS NULL OR d.delivery_date = ?)
      AND (? IS NULL OR d.district_id = ?)
      AND (? IS NULL OR d.driver_id = ?)
      AND (? IS NULL OR d.vehicle_id = ?)
    ORDER BY d.delivery_date DESC, d.id DESC
    LIMIT 500
  `).all(includeHidden ? 1 : 0, status, status, date, date, districtId, districtId, driverId, driverId, vehicleId, vehicleId);
}

// orders ready to attach: confirmed/waiting, unassigned, optionally suggest same-customer/district first
function eligibleOrders({ customerId = null, districtId = null, query = '' } = {}) {
  const db = getDb();
  const q = (query || '').trim();
  return db.prepare(`
    SELECT o.id, o.customer_id, c.name AS customer_name, t.name AS district_name,
      o.delivery_date, o.status, o.created_at,
      COALESCE((SELECT SUM(qty * unit_price) FROM order_items WHERE order_id = o.id), 0) - o.discount_amount AS total,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN districts t ON t.id = c.district_id
    WHERE o.status IN ('confirmed', 'waiting')
      AND NOT EXISTS (
        SELECT 1 FROM delivery_orders m
        WHERE m.order_id = o.id AND m.removed_at IS NULL AND m.delivered_at IS NULL
      )
      AND (? IS NULL OR o.customer_id = ?)
      AND (? IS NULL OR c.district_id = ?)
      AND (? = '' OR c.name LIKE ? OR CAST(o.id AS TEXT) LIKE ?)
    ORDER BY (o.customer_id = ?) DESC, (c.district_id = ?) DESC, o.id DESC
    LIMIT 100
  `).all(customerId, customerId, districtId, districtId, q, `%${q}%`, `%${q}%`, customerId || -1, districtId || -1)
    .map(r => ({ ...r, reference: orderRef(r.id, r.customer_id) }));
}

module.exports = { init, addItem, listItems, addShipment, listShipments, listShipmentsDetailed, getOverview, listCategories, addCategory, listCompanies, addCompany, listDistricts, addDistrict, addCustomer, listCustomers, getCustomer, updateCustomer, deleteCustomer, restoreCustomer, addCustomerPhone, deleteCustomerPhone, findPhoneOwners, ORDER_STATUSES, ORDER_TRANSITIONS, orderRef, productPricing, listProductsForOrder, createOrder, updateDraftOrder, getOrder, confirmOrder, setOrderStatus, setDeliveryDate, deleteOrder, listOrders, listCustomerOrders, EMPLOYEE_ROLES, listEmployees, getEmployee, addEmployee, updateEmployee, deleteEmployee, restoreEmployee, addEmployeePhone, deleteEmployeePhone, setEmployeeRoles, listEmployeesByRole, listVehicles, getVehicle, addVehicle, updateVehicle, deleteVehicle, restoreVehicle, setVehicleAvailability, DELIVERY_STATUSES, createDelivery, updatePlannedDelivery, addOrderToDelivery, removeOrderFromDelivery, reorderStops, startDelivery, deliverOrder, completeDelivery, hideDelivery, deleteDelivery, detachOrderFromDeliveries, getDelivery, listDeliveries, eligibleOrders, deliveryStockCheck, exportBackup };
