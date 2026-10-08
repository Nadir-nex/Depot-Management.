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
    CREATE TABLE IF NOT EXISTS customer_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      markup_percentage REAL NOT NULL DEFAULT 0 CHECK (markup_percentage >= 0),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
      customer_type_id INTEGER REFERENCES customer_types(id) ON DELETE SET NULL,
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
    CREATE TABLE IF NOT EXISTS product_costs (
      item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      current_cost REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS product_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      customer_type_id INTEGER NOT NULL REFERENCES customer_types(id) ON DELETE RESTRICT,
      auto_price INTEGER NOT NULL DEFAULT 0,
      manual_price INTEGER NULL CHECK (manual_price IS NULL OR manual_price > 0),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(item_id, customer_type_id)
    );
    CREATE INDEX IF NOT EXISTS idx_product_prices_item ON product_prices(item_id);
    CREATE INDEX IF NOT EXISTS idx_product_prices_type ON product_prices(customer_type_id);
    CREATE TABLE IF NOT EXISTS product_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      customer_type_id INTEGER NOT NULL REFERENCES customer_types(id) ON DELETE CASCADE,
      price_value INTEGER NOT NULL CHECK (price_value > 0),
      change_type TEXT NOT NULL CHECK (change_type IN ('automatic', 'manual_override', 'manual_cleared')),
      changed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_item ON product_price_history(item_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_item_type ON product_price_history(item_id, customer_type_id);
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
  // migration for customer types (Phase 1 — DB-driven, no hardcoded types)
  try { sqlite.exec(`CREATE TABLE IF NOT EXISTS customer_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      markup_percentage REAL NOT NULL DEFAULT 0 CHECK (markup_percentage >= 0),
      created_at TEXT DEFAULT (datetime('now'))
    )`); } catch {}
  try { sqlite.exec('ALTER TABLE customers ADD COLUMN customer_type_id INTEGER REFERENCES customer_types(id) ON DELETE SET NULL'); } catch {}
  // migration for persistent pricing layer (product_costs / product_prices / history + order_items.is_manual)
  try { sqlite.exec(`CREATE TABLE IF NOT EXISTS product_costs (
      item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      current_cost REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )`); } catch {}
  try { sqlite.exec(`CREATE TABLE IF NOT EXISTS product_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      customer_type_id INTEGER NOT NULL REFERENCES customer_types(id) ON DELETE RESTRICT,
      auto_price INTEGER NOT NULL DEFAULT 0,
      manual_price INTEGER NULL CHECK (manual_price IS NULL OR manual_price > 0),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(item_id, customer_type_id)
    )`); } catch {}
  try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_product_prices_item ON product_prices(item_id)'); } catch {}
  try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_product_prices_type ON product_prices(customer_type_id)'); } catch {}
  try { sqlite.exec(`CREATE TABLE IF NOT EXISTS product_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      customer_type_id INTEGER NOT NULL REFERENCES customer_types(id) ON DELETE CASCADE,
      price_value INTEGER NOT NULL CHECK (price_value > 0),
      change_type TEXT NOT NULL CHECK (change_type IN ('automatic', 'manual_override', 'manual_cleared')),
      changed_at TEXT DEFAULT (datetime('now'))
    )`); } catch {}
  try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_price_history_item ON product_price_history(item_id)'); } catch {}
  try { sqlite.exec('CREATE INDEX IF NOT EXISTS idx_price_history_item_type ON product_price_history(item_id, customer_type_id)'); } catch {}
  try { sqlite.exec('ALTER TABLE order_items ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0'); } catch {}
  // idempotent backfill: derive persisted costs/prices from shipment ledger (no zero-price flooding)
  try { backfillPricing(); } catch {}
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
function updateCategory({ id, name, color }) {
  const n = (name || '').trim();
  if (!id) throw new Error('رقم الفئة مطلوب');
  if (!n) throw new Error('اسم الفئة مطلوب');
  try {
    const r = getDb().prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(n, (color || '#0288d1').trim(), id);
    if (r.changes === 0) throw new Error('الفئة غير موجودة');
    return { id };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('هذا الاسم مستخدم لفئة أخرى');
    throw e;
  }
}

function deleteCategory(id) {
  // products reference SET NULL — deleting a category never deletes products
  const r = getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
  if (r.changes === 0) throw new Error('الفئة غير موجودة');
  return { id };
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

function updateCompany({ id, name, color }) {
  const n = (name || '').trim();
  if (!id) throw new Error('رقم الشركة مطلوب');
  if (!n) throw new Error('اسم الشركة مطلوب');
  try {
    const r = getDb().prepare('UPDATE companies SET name = ?, color = ? WHERE id = ?').run(n, (color || '#6a1b9a').trim(), id);
    if (r.changes === 0) throw new Error('الشركة غير موجودة');
    return { id };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('هذا الاسم مستخدم لشركة أخرى');
    throw e;
  }
}

function deleteCompany(id) {
  // products reference SET NULL — deleting a company never deletes products
  const r = getDb().prepare('DELETE FROM companies WHERE id = ?').run(id);
  if (r.changes === 0) throw new Error('الشركة غير موجودة');
  return { id };
}

// Add product: name + barcode + optional category/company
function addItem({ name, barcode, category_id, company_id }) {
  const db = getDb();
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('الاسم مطلوب');
  const cleanBarcode = (barcode || '').trim() || null;
  if (category_id && !db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(category_id))) throw new Error('الفئة غير موجودة');
  if (company_id && !db.prepare('SELECT id FROM companies WHERE id = ?').get(Number(company_id))) throw new Error('الشركة غير موجودة');
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

function getItem(id) {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, c.name AS category_name, co.name AS company_name
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN companies co ON co.id = i.company_id
    WHERE i.id = ?
  `).get(id) || null;
}

function updateItem({ id, name, barcode, category_id, company_id }) {
  const db = getDb();
  if (!id) throw new Error('رقم المنتج مطلوب');
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('الاسم مطلوب');
  const cleanBarcode = (barcode || '').trim() || null;
  if (cleanBarcode && db.prepare('SELECT id FROM items WHERE barcode = ? AND id != ?').get(cleanBarcode, id))
    throw new Error('الباركود موجود لدى منتج آخر');
  if (category_id && !db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(category_id))) throw new Error('الفئة غير موجودة');
  if (company_id && !db.prepare('SELECT id FROM companies WHERE id = ?').get(Number(company_id))) throw new Error('الشركة غير موجودة');
  const r = db.prepare('UPDATE items SET name = ?, barcode = ?, category_id = ?, company_id = ? WHERE id = ?')
    .run(cleanName, cleanBarcode, category_id || null, company_id || null, id);
  if (r.changes === 0) throw new Error('المنتج غير موجود');
  return { id };
}

function deleteItem(id) {
  const db = getDb();
  const ship = db.prepare('SELECT COUNT(*) AS c FROM shipments WHERE item_id = ?').get(id).c;
  if (ship > 0) throw new Error('لا يمكن حذف منتج لديه شحنات — احذف الشحنات أولاً');
  const ord = db.prepare('SELECT COUNT(*) AS c FROM order_items WHERE item_id = ?').get(id).c;
  if (ord > 0) throw new Error('لا يمكن حذف منتج مرتبط بطلبيات (سجل تاريخي)');
  const r = db.prepare('DELETE FROM items WHERE id = ?').run(id);
  if (r.changes === 0) throw new Error('المنتج غير موجود');
  return { id };
}

// stock(item) = SUM(shipments.qty) — Phase 3 will subtract per-order delivered qty
// cost(item) = persisted product_costs.current_cost (normally weighted average
//   SUM(qty*buy_price)/SUM(qty) from shipments). Display falls back to live wavg
//   when no persisted row exists yet (pre-backfill safety).
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
      COALESCE(pc.current_cost,
        CASE WHEN COALESCE(SUM(s.qty),0) > 0
          THEN COALESCE(SUM(s.qty * s.buy_price),0) / COALESCE(SUM(s.qty),1)
          ELSE 0 END) AS avg_cost,
      pc.current_cost AS current_cost,
      pc.updated_at AS cost_updated_at,
      (SELECT MIN(s4.expiry_date) FROM shipments s4 WHERE s4.item_id = i.id AND s4.expiry_date IS NOT NULL AND s4.expiry_date != '') AS nearest_expiry
    FROM items i
    LEFT JOIN shipments s ON s.item_id = i.id
    LEFT JOIN product_costs pc ON pc.item_id = i.id
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
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(Number(item_id))) throw new Error('المنتج غير موجود');
  // shipments.sell_price is legacy and ignored by pricing (kept for old rows only).
  // Pricing uses persisted product_costs.current_cost + product_prices (see recomputeItemTx).
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
    const newId = Number(r.lastInsertRowid);
    recomputeItemTx(db, Number(item_id));
    db.exec('COMMIT');
    return { id: newId };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

// Receipt CSV import — locked format: product,purchase_price,quantity (root items.csv is the reference).
// Rules (locked): exact-name match (else create product, no category/company),
// rows without usable price+qty create the product only (feeds no-price/no-stock warnings).
// Transactional: any unexpected error rolls everything back. Returns a per-row report.
function importReceipt(rows) {
  const db = getDb();
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) throw new Error('ملف فارغ — لا صفوف للاستيراد');
  if (list.length > 5000) throw new Error('الملف كبير جداً (أكثر من 5000 صف)');
  const report = { total: list.length, created: 0, matched: 0, shipments: 0, product_only: 0, skipped: [] };
  const affected = new Set();
  db.exec('BEGIN');
  try {
    const findItem = db.prepare('SELECT id FROM items WHERE name = ?');
    const insItem = db.prepare('INSERT INTO items (name, barcode, category_id, company_id) VALUES (?, NULL, NULL, NULL)');
    const insShip = db.prepare('INSERT INTO shipments (item_id, qty, buy_price, sell_price, expiry_date, supplier) VALUES (?, ?, ?, 0, NULL, ?)');
    list.forEach((r, i) => {
      const line = i + 1;
      const name = String(r && r.product !== undefined ? r.product : (r && r.name !== undefined ? r.name : '')).trim();
      if (!name) { report.skipped.push({ row: line, reason: 'اسم فارغ' }); return; }
      const priceRaw = r ? r.purchase_price : '';
      const qtyRaw = r ? r.quantity : '';
      const hasPrice = priceRaw !== undefined && priceRaw !== null && String(priceRaw).trim() !== '';
      const hasQty = qtyRaw !== undefined && qtyRaw !== null && String(qtyRaw).trim() !== '';
      let item = findItem.get(name);
      let isNew = false;
      if (!item) {
        try {
          item = { id: Number(insItem.run(name).lastInsertRowid) };
        } catch (e) {
          if (String(e.message).includes('UNIQUE')) item = findItem.get(name);
          else throw e;
        }
        if (!item) { report.skipped.push({ row: line, reason: 'تعذر إنشاء المنتج' }); return; }
        isNew = true;
        report.created += 1;
      } else {
        report.matched += 1;
      }
      if (!hasPrice && !hasQty) { report.product_only += 1; return; } // name-only row: product for alert testing
      const price = Number(String(priceRaw).trim().replace(',', '.'));
      const qtyNum = Number(String(qtyRaw).trim().replace(',', '.'));
      if (!hasPrice || !Number.isFinite(price) || price < 0) { report.product_only += 1; report.skipped.push({ row: line, reason: `«${name}»: سعر شراء غير صالح — أُنشئ المنتج بدون شحنة` }); return; }
      if (!hasQty || !Number.isInteger(qtyNum) || qtyNum <= 0) { report.product_only += 1; report.skipped.push({ row: line, reason: `«${name}»: كمية غير صالحة (يجب عدد صحيح > 0) — أُنشئ المنتج بدون شحنة` }); return; }
      insShip.run(item.id, qtyNum, price, '');
      report.shipments += 1;
      affected.add(Number(item.id));
      void isNew;
    });
    // receipt + cost/price/history stay consistent: recompute only affected products, same transaction
    for (const itemId of affected) {
      try { recomputeItemTx(db, itemId); } catch {}
    }
    db.exec('COMMIT');
    return report;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function getShipment(id) {
  return getDb().prepare('SELECT * FROM shipments WHERE id = ?').get(id) || null;
}

function updateShipment({ id, qty, buy_price, sell_price, expiry_date, supplier }) {
  const db = getDb();
  if (!id) throw new Error('رقم الشحنة مطلوب');
  const cur = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
  if (!cur) throw new Error('الشحنة غير موجودة');
  const q = parseInt(qty, 10);
  if (!Number.isFinite(q) || q <= 0) throw new Error('الكمية يجب أن تكون أكبر من 0');
  // item_id immutable — moving stock between products is not allowed (would rewrite two averages).
  // sell_price legacy, stored but ignored by pricing. Editing recalculates persisted cost/prices.
  db.exec('BEGIN');
  try {
    const r = db.prepare(`
      UPDATE shipments SET qty = ?, buy_price = ?, sell_price = ?, expiry_date = ?, supplier = ?
      WHERE id = ?
    `).run(q, Number(buy_price) || 0, Number(sell_price) || 0, (expiry_date || '').trim() || null, (supplier || '').trim() || '', id);
    if (r.changes === 0) throw new Error('الشحنة غير موجودة');
    recomputeItemTx(db, Number(cur.item_id));
    db.exec('COMMIT');
    return { id };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function deleteShipment(id) {
  const db = getDb();
  const cur = db.prepare('SELECT id, item_id FROM shipments WHERE id = ?').get(id);
  if (!cur) throw new Error('الشحنة غير موجودة');
  // No consumption ledger yet (Phase 3 deferred) so nothing references a shipment row directly.
  // Deleting recalculates persisted cost/prices; old order snapshots stay untouched.
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM shipments WHERE id = ?').run(id);
    recomputeItemTx(db, Number(cur.item_id));
    db.exec('COMMIT');
    return { id };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
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

// ---------------- Customer types (Phase 1 — DB-driven, no hardcode) ----------------

function listCustomerTypes() {
  return getDb().prepare('SELECT * FROM customer_types ORDER BY name').all();
}

function addCustomerType({ name, markup_percentage }) {
  const n = (name || '').trim();
  if (!n) throw new Error('اسم نوع الزبون مطلوب');
  const m = Number(markup_percentage);
  if (!Number.isFinite(m) || m < 0) throw new Error('النسبة يجب أن تكون 0 أو أكثر');
  const db = getDb();
  try {
    db.exec('BEGIN');
    const r = db.prepare('INSERT INTO customer_types (name, markup_percentage) VALUES (?, ?)').run(n, m);
    const typeId = Number(r.lastInsertRowid);
    // create price rows for existing cost-bearing products only (no zero-price flooding)
    const products = db.prepare(`
      SELECT i.id AS item_id, COALESCE(pc.current_cost, 0) AS basis,
        COALESCE((SELECT SUM(s.qty) FROM shipments s WHERE s.item_id = i.id), 0) AS stock
      FROM items i LEFT JOIN product_costs pc ON pc.item_id = i.id
    `).all();
    const ins = db.prepare(`INSERT OR IGNORE INTO product_prices
      (item_id, customer_type_id, auto_price, manual_price, updated_at)
      VALUES (?, ?, ?, NULL, datetime('now'))`);
    const hist = db.prepare(`INSERT INTO product_price_history
      (item_id, customer_type_id, price_value, change_type) VALUES (?, ?, ?, 'automatic')`);
    for (const p of products) {
      const basis = Number(p.basis) || 0;
      const stock = Number(p.stock) || 0;
      if (!(stock > 0 && basis > 0)) continue;
      const auto = Math.round(basis * (1 + m / 100));
      if (!(auto > 0)) continue;
      const info = ins.run(p.item_id, typeId, auto);
      if (info.changes > 0) hist.run(p.item_id, typeId, auto);
    }
    db.exec('COMMIT');
    return { id: typeId, name: n, markup_percentage: m };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    if (String(e.message).includes('UNIQUE')) throw new Error('هذا النوع موجود من قبل');
    throw e;
  }
}

function updateCustomerType({ id, name, markup_percentage }) {
  const n = (name || '').trim();
  if (!id) throw new Error('رقم النوع مطلوب');
  if (!n) throw new Error('اسم نوع الزبون مطلوب');
  const m = Number(markup_percentage);
  if (!Number.isFinite(m) || m < 0) throw new Error('النسبة يجب أن تكون 0 أو أكثر');
  const db = getDb();
  try {
    db.exec('BEGIN');
    const cur = db.prepare('SELECT * FROM customer_types WHERE id = ?').get(id);
    if (!cur) throw new Error('نوع الزبون غير موجود');
    try {
      db.prepare('UPDATE customer_types SET name = ?, markup_percentage = ? WHERE id = ?').run(n, m, id);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new Error('هذا الاسم مستخدم لنوع آخر');
      throw e;
    }
    // recompute auto_price for all rows of this type when markup changed; preserve manual_price
    if (Number(cur.markup_percentage) !== m) {
      recomputePricesForTypeTx(db, Number(id));
    }
    db.exec('COMMIT');
    return { id };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function deleteCustomerType(id) {
  const db = getDb();
  const used = db.prepare('SELECT COUNT(*) AS c FROM customers WHERE customer_type_id = ? AND deleted_at IS NULL').get(id).c;
  if (used > 0) throw new Error('لا يمكن حذف نوع مستخدم لدى زبائن — غيّر نوع الزبائن أولاً');
  const priced = db.prepare('SELECT COUNT(*) AS c FROM product_prices WHERE customer_type_id = ?').get(id).c;
  if (priced > 0) throw new Error('لا يمكن حذف نوع لديه أسعار منتجات — احذف أسعار النوع أولاً (أو أعد تعيينها)');
  try {
    // history rows for this type are removed with the type (CASCADE); pricing rows block above.
    const r = db.prepare('DELETE FROM customer_types WHERE id = ?').run(id);
    if (r.changes === 0) throw new Error('نوع الزبون غير موجود');
    return { id };
  } catch (e) {
    if (String(e.message).includes('FOREIGN KEY')) throw new Error('لا يمكن حذف نوع مرتبط بأسعار أو سجل أسعار');
    throw e;
  }
}

function getCustomerMarkup(db, customerId) {
  const row = db.prepare(`
    SELECT t.markup_percentage AS m FROM customers c
    LEFT JOIN customer_types t ON t.id = c.customer_type_id
    WHERE c.id = ?
  `).get(customerId);
  if (!row) return 0;
  return Number(row.m) || 0;
}

// ---------------- Persistent pricing layer (product_costs / product_prices / history) ----------------
// Source of truth: shipments.buy_price ledger → weighted-average cost → product_costs.current_cost
//   → product_prices.auto_price = Math.round(current_cost * (1 + markup/100)), manual_price preserved.
// Effective price = COALESCE(manual_price, auto_price). History only when effective changes.

function calcAutoPrice(cost, markup) {
  const c = Number(cost) || 0;
  const mk = Number(markup) || 0;
  if (!(c > 0)) return 0;
  return Math.round(c * (1 + mk / 100));
}

function wavgCostTx(db, itemId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(qty),0) AS stock, COALESCE(SUM(qty * buy_price),0) AS total,
      MAX(created_at) AS last_in,
      (SELECT s2.buy_price FROM shipments s2 WHERE s2.item_id = ? ORDER BY s2.id DESC LIMIT 1) AS last_buy
    FROM shipments WHERE item_id = ?
  `).get(itemId, itemId);
  const stock = Number(row.stock) || 0;
  const total = Number(row.total) || 0;
  const cost = stock > 0 ? total / stock : 0;
  return { cost, stock, last_buy: row.last_buy != null ? Number(row.last_buy) : null };
}

// Internal: recompute one product inside caller's transaction. Never overwrites manual_price.
// Updates product_costs.current_cost from ledger wavg, ensures price rows for cost-bearing
// products, recalculates auto_price, writes history only when effective price changes.
function recomputeItemTx(db, itemId) {
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) return { item_id: id, cost: 0, stock: 0 };
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(id)) return { item_id: id, cost: 0, stock: 0 };
  const { cost: wavg, stock } = wavgCostTx(db, id);
  const valid = stock > 0 && wavg > 0;
  const basis = valid ? wavg : 0;
  db.prepare(`INSERT INTO product_costs (item_id, current_cost, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(item_id) DO UPDATE SET current_cost = excluded.current_cost, updated_at = datetime('now')`
  ).run(id, basis);
  const types = db.prepare('SELECT id, markup_percentage FROM customer_types ORDER BY id').all();
  if (!valid) {
    // No valid cost: keep existing rows (auto becomes 0 only if row exists? leave rows but zero them).
    // To avoid fake prices, do NOT create new rows; zero out auto on existing rows where effective was auto.
    const existing = db.prepare('SELECT id, customer_type_id, auto_price, manual_price FROM product_prices WHERE item_id = ?').all(id);
    const upd = db.prepare('UPDATE product_prices SET auto_price = 0, updated_at = datetime(\'now\') WHERE id = ?');
    const hist = db.prepare(`INSERT INTO product_price_history (item_id, customer_type_id, price_value, change_type)
      VALUES (?, ?, ?, 'automatic')`);
    for (const r of existing) {
      const oldEff = r.manual_price != null ? Number(r.manual_price) : Number(r.auto_price);
      if (Number(r.auto_price) !== 0) upd.run(r.id);
      const newEff = r.manual_price != null ? Number(r.manual_price) : 0;
      if (r.manual_price == null && oldEff > 0 && newEff === 0) {
        // effective dropped to 0 — do not record zero-price history (no valid price)
        void hist;
      }
    }
    return { item_id: id, cost: basis, stock };
  }
  const getRow = db.prepare('SELECT id, auto_price, manual_price FROM product_prices WHERE item_id = ? AND customer_type_id = ?');
  const ins = db.prepare(`INSERT OR IGNORE INTO product_prices
    (item_id, customer_type_id, auto_price, manual_price) VALUES (?, ?, ?, NULL)`);
  const updAuto = db.prepare('UPDATE product_prices SET auto_price = ?, updated_at = datetime(\'now\') WHERE id = ?');
  const hist = db.prepare(`INSERT INTO product_price_history
    (item_id, customer_type_id, price_value, change_type) VALUES (?, ?, ?, 'automatic')`);
  for (const t of types) {
    const auto = calcAutoPrice(basis, t.markup_percentage);
    let row = getRow.get(id, t.id);
    if (!row) {
      if (!(auto > 0)) continue; // do not flood zero-price rows
      ins.run(id, t.id, auto);
      row = getRow.get(id, t.id);
      if (row && auto > 0) hist.run(id, t.id, auto);
      continue;
    }
    const oldEff = row.manual_price != null ? Number(row.manual_price) : Number(row.auto_price);
    if (Number(row.auto_price) !== auto) updAuto.run(auto, row.id);
    const newEff = row.manual_price != null ? Number(row.manual_price) : auto;
    if (row.manual_price == null && oldEff !== newEff && newEff > 0) hist.run(id, t.id, newEff);
    else if (row.manual_price == null && oldEff > 0 && newEff === 0) {
      // auto dropped to zero — no history for invalid price
    }
  }
  return { item_id: id, cost: basis, stock };
}

// Internal: recompute all products for one customer type inside caller's transaction (markup change).
function recomputePricesForTypeTx(db, typeId) {
  const t = db.prepare('SELECT id, markup_percentage FROM customer_types WHERE id = ?').get(typeId);
  if (!t) throw new Error('نوع الزبون غير موجود');
  const markup = Number(t.markup_percentage) || 0;
  const rows = db.prepare(`
    SELECT pp.id, pp.item_id, pp.auto_price, pp.manual_price, COALESCE(pc.current_cost, 0) AS basis
    FROM product_prices pp LEFT JOIN product_costs pc ON pc.item_id = pp.item_id
    WHERE pp.customer_type_id = ?
  `).all(typeId);
  const upd = db.prepare('UPDATE product_prices SET auto_price = ?, updated_at = datetime(\'now\') WHERE id = ?');
  const hist = db.prepare(`INSERT INTO product_price_history
    (item_id, customer_type_id, price_value, change_type) VALUES (?, ?, ?, 'automatic')`);
  for (const r of rows) {
    const basis = Number(r.basis) || 0;
    const auto = calcAutoPrice(basis, markup);
    const oldEff = r.manual_price != null ? Number(r.manual_price) : Number(r.auto_price);
    if (Number(r.auto_price) !== auto) upd.run(auto, r.id);
    const newEff = r.manual_price != null ? Number(r.manual_price) : auto;
    // manual rows keep effective → no history; auto rows record only on real change to valid price
    if (r.manual_price == null && oldEff !== newEff && newEff > 0) hist.run(r.item_id, typeId, newEff);
  }
  return { type_id: typeId, updated: rows.length };
}

// Public wrapper: recompute a single product (own transaction).
function recomputeProductPrices(itemId) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const out = recomputeItemTx(db, itemId);
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function getProductCost(itemId) {
  const db = getDb();
  const id = Number(itemId);
  const live = wavgCostTx(db, id);
  const saved = db.prepare('SELECT item_id, current_cost, updated_at FROM product_costs WHERE item_id = ?').get(id) || null;
  const current = saved ? Number(saved.current_cost) || 0 : 0;
  return {
    item_id: id,
    current_cost: current,
    wavg_cost: Number(live.cost) || 0,
    stock: Number(live.stock) || 0,
    last_buy: live.last_buy,
    updated_at: saved ? saved.updated_at : null
  };
}

function setProductCost(itemId, value) {
  const db = getDb();
  const id = Number(itemId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('رقم المنتج مطلوب');
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(id)) throw new Error('المنتج غير موجود');
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) throw new Error('تكلفة المنتج يجب أن تكون 0 أو أكثر');
  db.exec('BEGIN');
  try {
    // Manual correction of the basis only — shipment rows untouched.
    db.prepare(`INSERT INTO product_costs (item_id, current_cost, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(item_id) DO UPDATE SET current_cost = excluded.current_cost, updated_at = datetime('now')`
    ).run(id, v);
    // Recompute auto prices from the edited basis (preserve manual overrides).
    const types = db.prepare('SELECT id, markup_percentage FROM customer_types ORDER BY id').all();
    const getRow = db.prepare('SELECT id, auto_price, manual_price FROM product_prices WHERE item_id = ? AND customer_type_id = ?');
    const ins = db.prepare('INSERT OR IGNORE INTO product_prices (item_id, customer_type_id, auto_price, manual_price) VALUES (?, ?, ?, NULL)');
    const upd = db.prepare('UPDATE product_prices SET auto_price = ?, updated_at = datetime(\'now\') WHERE id = ?');
    const hist = db.prepare(`INSERT INTO product_price_history
      (item_id, customer_type_id, price_value, change_type) VALUES (?, ?, ?, 'automatic')`);
    const stockRow = db.prepare('SELECT COALESCE(SUM(qty),0) AS s FROM shipments WHERE item_id = ?').get(id);
    const hasStock = (Number(stockRow.s) || 0) > 0;
    for (const t of types) {
      const auto = (v > 0 && (hasStock || v > 0)) ? calcAutoPrice(v, t.markup_percentage) : 0;
      let row = getRow.get(id, t.id);
      if (!row) {
        if (!(auto > 0)) continue;
        ins.run(id, t.id, auto);
        row = getRow.get(id, t.id);
        if (row) hist.run(id, t.id, auto);
        continue;
      }
      const oldEff = row.manual_price != null ? Number(row.manual_price) : Number(row.auto_price);
      if (Number(row.auto_price) !== auto) upd.run(auto, row.id);
      const newEff = row.manual_price != null ? Number(row.manual_price) : auto;
      if (row.manual_price == null && oldEff !== newEff && newEff > 0) hist.run(id, t.id, newEff);
    }
    db.exec('COMMIT');
    return { item_id: id, current_cost: v };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function getProductPrices(itemId) {
  const db = getDb();
  const id = Number(itemId);
  return db.prepare(`
    SELECT pp.id, pp.item_id, pp.customer_type_id,
      t.name AS customer_type_name, t.markup_percentage,
      pp.auto_price, pp.manual_price,
      COALESCE(pp.manual_price, pp.auto_price) AS effective_price,
      CASE WHEN pp.manual_price IS NOT NULL THEN 1 ELSE 0 END AS is_manual,
      pp.updated_at
    FROM product_prices pp
    JOIN customer_types t ON t.id = pp.customer_type_id
    WHERE pp.item_id = ?
    ORDER BY t.name
  `).all(id);
}

function getProductPrice(itemId, customerTypeId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT pp.*, COALESCE(pp.manual_price, pp.auto_price) AS effective_price,
      CASE WHEN pp.manual_price IS NOT NULL THEN 1 ELSE 0 END AS is_manual
    FROM product_prices pp WHERE pp.item_id = ? AND pp.customer_type_id = ?
  `).get(Number(itemId), Number(customerTypeId)) || null;
  return row;
}

function setProductManualPrice(itemId, customerTypeId, value) {
  const db = getDb();
  const iid = Number(itemId), tid = Number(customerTypeId);
  const v = Math.round(Number(value));
  if (!Number.isInteger(iid) || iid <= 0) throw new Error('رقم المنتج مطلوب');
  if (!Number.isInteger(tid) || tid <= 0) throw new Error('رقم نوع الزبون مطلوب');
  if (!Number.isFinite(v) || v <= 0) throw new Error('السعر اليدوي يجب أن يكون أكبر من 0');
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(iid)) throw new Error('المنتج غير موجود');
  if (!db.prepare('SELECT id FROM customer_types WHERE id = ?').get(tid)) throw new Error('نوع الزبون غير موجود');
  db.exec('BEGIN');
  try {
    let row = db.prepare('SELECT id, auto_price, manual_price FROM product_prices WHERE item_id = ? AND customer_type_id = ?').get(iid, tid);
    if (!row) {
      const costRow = db.prepare('SELECT current_cost FROM product_costs WHERE item_id = ?').get(iid);
      const basis = costRow ? Number(costRow.current_cost) || 0 : 0;
      const mk = db.prepare('SELECT markup_percentage FROM customer_types WHERE id = ?').get(tid);
      const auto = calcAutoPrice(basis, mk ? mk.markup_percentage : 0);
      db.prepare('INSERT INTO product_prices (item_id, customer_type_id, auto_price, manual_price) VALUES (?, ?, ?, ?)').run(iid, tid, auto, v);
      row = db.prepare('SELECT id, auto_price, manual_price FROM product_prices WHERE item_id = ? AND customer_type_id = ?').get(iid, tid);
      const oldEff = Number(row.auto_price);
      if (oldEff !== v) db.prepare(`INSERT INTO product_price_history
        (item_id, customer_type_id, price_value, change_type) VALUES (?, ?, ?, 'manual_override')`).run(iid, tid, v);
      db.prepare('UPDATE product_prices SET updated_at = datetime(\'now\') WHERE id = ?').run(row.id);
    } else {
      const oldEff = row.manual_price != null ? Number(row.manual_price) : Number(row.auto_price);
      db.prepare('UPDATE product_prices SET manual_price = ?, updated_at = datetime(\'now\') WHERE id = ?').run(v, row.id);
      if (oldEff !== v) db.prepare(`INSERT INTO product_price_history
        (item_id, customer_type_id, price_value, change_type) VALUES (?, ?, ?, 'manual_override')`).run(iid, tid, v);
    }
    db.exec('COMMIT');
    return { item_id: iid, customer_type_id: tid, manual_price: v };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function clearProductManualPrice(itemId, customerTypeId) {
  const db = getDb();
  const iid = Number(itemId), tid = Number(customerTypeId);
  db.exec('BEGIN');
  try {
    const row = db.prepare('SELECT id, auto_price, manual_price FROM product_prices WHERE item_id = ? AND customer_type_id = ?').get(iid, tid);
    if (!row) throw new Error('لا يوجد سعر لهذا المنتج والنوع');
    if (row.manual_price == null) { db.exec('COMMIT'); return { item_id: iid, customer_type_id: tid, cleared: false }; }
    const oldEff = Number(row.manual_price);
    db.prepare('UPDATE product_prices SET manual_price = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(row.id);
    const newEff = Number(row.auto_price);
    if (oldEff !== newEff && newEff > 0) db.prepare(`INSERT INTO product_price_history
      (item_id, customer_type_id, price_value, change_type) VALUES (?, ?, ?, 'manual_cleared')`).run(iid, tid, newEff);
    db.exec('COMMIT');
    return { item_id: iid, customer_type_id: tid, cleared: true, effective_price: newEff };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function getProductPriceHistory(itemId, customerTypeId = null, limit = 100) {
  const db = getDb();
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  if (customerTypeId != null && customerTypeId !== '') {
    return db.prepare(`
      SELECT h.*, t.name AS customer_type_name, i.name AS item_name
      FROM product_price_history h
      LEFT JOIN customer_types t ON t.id = h.customer_type_id
      LEFT JOIN items i ON i.id = h.item_id
      WHERE h.item_id = ? AND h.customer_type_id = ?
      ORDER BY h.id DESC LIMIT ${lim}
    `).all(Number(itemId), Number(customerTypeId));
  }
  return db.prepare(`
    SELECT h.*, t.name AS customer_type_name, i.name AS item_name
    FROM product_price_history h
    LEFT JOIN customer_types t ON t.id = h.customer_type_id
    LEFT JOIN items i ON i.id = h.item_id
    WHERE h.item_id = ?
    ORDER BY h.id DESC LIMIT ${lim}
  `).all(Number(itemId));
}

// Idempotent backfill for existing databases: costs from ledger, prices for cost-bearing products.
function backfillPricing() {
  const db = getDb();
  const items = db.prepare('SELECT id FROM items ORDER BY id').all();
  const types = db.prepare('SELECT id, markup_percentage FROM customer_types ORDER BY id').all();
  if (!items.length || !types.length) {
    // still ensure product_costs rows exist as zero for items with no shipments? no-op to avoid flooding
    return { items: items.length, types: types.length, filled: 0 };
  }
  let filled = 0;
  const inTx = (() => { try { db.exec('BEGIN'); return true; } catch { return false; } })();
  try {
    for (const it of items) {
      const { cost: wavg, stock } = wavgCostTx(db, it.id);
      const valid = stock > 0 && wavg > 0;
      const basis = valid ? wavg : 0;
      const cur = db.prepare('SELECT current_cost FROM product_costs WHERE item_id = ?').get(it.id);
      if (!cur) {
        db.prepare('INSERT OR IGNORE INTO product_costs (item_id, current_cost) VALUES (?, ?)').run(it.id, basis);
      } else if ((Number(cur.current_cost) || 0) === 0 && valid) {
        // adopt ledger value only when persisted is empty (never overwrite manual corrections here)
        db.prepare('UPDATE product_costs SET current_cost = ?, updated_at = datetime(\'now\') WHERE item_id = ?').run(basis, it.id);
      }
      const effBasis = cur && (Number(cur.current_cost) || 0) > 0 ? Number(cur.current_cost) : basis;
      if (!(effBasis > 0 && valid)) continue;
      for (const t of types) {
        const auto = calcAutoPrice(effBasis, t.markup_percentage);
        if (!(auto > 0)) continue;
        const ex = db.prepare('SELECT id FROM product_prices WHERE item_id = ? AND customer_type_id = ?').get(it.id, t.id);
        if (!ex) {
          db.prepare('INSERT OR IGNORE INTO product_prices (item_id, customer_type_id, auto_price) VALUES (?, ?, ?)').run(it.id, t.id, auto);
          filled += 1;
        }
      }
    }
    if (inTx) db.exec('COMMIT');
    return { items: items.length, types: types.length, filled };
  } catch (e) {
    if (inTx) { try { db.exec('ROLLBACK'); } catch {} }
    throw e;
  }
}

// ---------------- Customers (Phase A + Phase 2 type link) ----------------

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

function updateDistrict({ id, name }) {
  const n = (name || '').trim();
  if (!id) throw new Error('رقم المنطقة مطلوب');
  if (!n) throw new Error('اسم الحي/المنطقة مطلوب');
  try {
    const r = getDb().prepare('UPDATE districts SET name = ? WHERE id = ?').run(n, id);
    if (r.changes === 0) throw new Error('المنطقة غير موجودة');
    return { id };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('هذا الاسم مستخدم لمنطقة أخرى');
    throw e;
  }
}

function deleteDistrict(id) {
  // customers + deliveries reference SET NULL — deleting never deletes business records
  const r = getDb().prepare('DELETE FROM districts WHERE id = ?').run(id);
  if (r.changes === 0) throw new Error('المنطقة غير موجودة');
  return { id };
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

function checkCustomerType(db, customerTypeId) {
  if (customerTypeId === null || customerTypeId === undefined || customerTypeId === '') return null;
  const t = db.prepare('SELECT id FROM customer_types WHERE id = ?').get(Number(customerTypeId));
  if (!t) throw new Error('نوع الزبون غير موجود');
  return Number(customerTypeId);
}

function addCustomer({ name, district_id, customer_type_id, latitude, longitude, notes, phones }) {
  const db = getDb();
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('اسم الزبون مطلوب');
  const lat = cleanGps(latitude, -90, 90, 'خط العرض يجب أن يكون بين -90 و 90');
  const lng = cleanGps(longitude, -180, 180, 'خط الطول يجب أن يكون بين -180 و 180');
  const phoneList = (phones || []).map(p => (p || '').trim()).filter(Boolean);
  const typeId = checkCustomerType(db, customer_type_id);

  db.exec('BEGIN');
  try {
    const r = db.prepare(`
      INSERT INTO customers (name, district_id, customer_type_id, latitude, longitude, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cleanName, district_id || null, typeId, lat, lng, (notes || '').trim());
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
      c.customer_type_id, t.name AS customer_type_name, t.markup_percentage AS customer_markup,
      c.latitude, c.longitude, c.notes, c.deleted_at, c.created_at, c.updated_at,
      (SELECT COUNT(*) FROM customer_phones p WHERE p.customer_id = c.id) AS phone_count
    FROM customers c
    LEFT JOIN districts d ON d.id = c.district_id
    LEFT JOIN customer_types t ON t.id = c.customer_type_id
    WHERE ${delCond} AND ${where}
      AND (? IS NULL OR c.district_id = ?)
    ORDER BY c.id DESC
  `).all(...params, districtId, districtId);
}

function getCustomer(id, includeDeleted = true) {
  const db = getDb();
  const row = db.prepare(`
    SELECT c.*, d.name AS district_name, t.name AS customer_type_name, t.markup_percentage AS customer_markup
    FROM customers c
    LEFT JOIN districts d ON d.id = c.district_id
    LEFT JOIN customer_types t ON t.id = c.customer_type_id
    WHERE c.id = ? ${includeDeleted ? '' : 'AND c.deleted_at IS NULL'}
  `).get(id);
  if (!row) return null;
  row.phones = db.prepare('SELECT * FROM customer_phones WHERE customer_id = ? ORDER BY id').all(id);
  return row;
}

function updateCustomer({ id, name, district_id, customer_type_id, latitude, longitude, notes }) {
  const db = getDb();
  const cleanName = (name || '').trim();
  if (!id) throw new Error('رقم الزبون مطلوب');
  if (!cleanName) throw new Error('اسم الزبون مطلوب');
  const lat = cleanGps(latitude, -90, 90, 'خط العرض يجب أن يكون بين -90 و 90');
  const lng = cleanGps(longitude, -180, 180, 'خط الطول يجب أن يكون بين -180 و 180');
  // allow clearing type by passing null/''; validate when provided
  let typeId = null;
  if (customer_type_id !== undefined) {
    typeId = (customer_type_id === null || customer_type_id === '') ? null : checkCustomerType(db, customer_type_id);
  } else {
    const cur = db.prepare('SELECT customer_type_id FROM customers WHERE id = ?').get(id);
    typeId = cur ? cur.customer_type_id : null;
  }
  const r = db.prepare(`
    UPDATE customers SET name = ?, district_id = ?, customer_type_id = ?, latitude = ?, longitude = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(cleanName, district_id || null, typeId, lat, lng, (notes || '').trim(), id);
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

// Persistent pricing: product_costs.current_cost is the basis (normally wavg from shipments).
// product_prices holds per-(product × type) auto_price + manual_price override.
// Effective price = COALESCE(manual_price, auto_price). Orders snapshot unit_price.
// shipments.sell_price is legacy and ignored.
function productCost(itemId) {
  const db = getDb();
  const stockRow = db.prepare(`
    SELECT COALESCE(SUM(qty),0) AS stock, COALESCE(SUM(qty * buy_price),0) AS total
    FROM shipments WHERE item_id = ?
  `).get(itemId);
  const stock = Number(stockRow.stock) || 0;
  const liveWavg = stock > 0 ? (Number(stockRow.total) || 0) / stock : 0;
  const saved = db.prepare('SELECT current_cost FROM product_costs WHERE item_id = ?').get(itemId);
  // Persisted basis wins when present; live wavg is fallback for pre-backfill safety.
  const cost = saved ? (Number(saved.current_cost) || 0) : liveWavg;
  return { cost, stock };
}

function productPricing(itemId, customerId = null) {
  const db = getDb();
  const iid = Number(itemId);
  const { cost, stock } = productCost(iid);
  let markup = 0;
  let typeId = null;
  if (customerId !== null && customerId !== undefined && customerId !== '') {
    const crow = db.prepare('SELECT customer_type_id FROM customers WHERE id = ?').get(Number(customerId));
    typeId = crow ? crow.customer_type_id : null;
    markup = getCustomerMarkup(db, Number(customerId));
  }
  let price = 0;
  if (typeId != null) {
    const prow = db.prepare('SELECT auto_price, manual_price FROM product_prices WHERE item_id = ? AND customer_type_id = ?').get(iid, typeId);
    if (prow) {
      price = prow.manual_price != null ? Number(prow.manual_price) : Number(prow.auto_price);
    } else {
      price = (stock > 0 && cost > 0) ? calcAutoPrice(cost, markup) : 0;
    }
  } else {
    price = (stock > 0 && cost > 0) ? Math.round(cost) : 0;
  }
  if (!(price > 0)) price = 0;
  return { cost, markup, price, stock, customer_type_id: typeId };
}

// mode: 'name' | 'barcode' — products with persisted effective price + stock for order building
function listProductsForOrder(mode = 'name', query = '', customerId = null) {
  const db = getDb();
  const q = (query || '').trim();
  const cond = q === '' ? '1=1' : (mode === 'barcode' ? `COALESCE(i.barcode,'') LIKE ?` : `i.name LIKE ?`);
  const params = q === '' ? [] : [`%${q}%`];
  let markup = 0;
  let typeId = null;
  if (customerId !== null && customerId !== undefined && customerId !== '') {
    const crow = db.prepare('SELECT customer_type_id FROM customers WHERE id = ?').get(Number(customerId));
    typeId = crow ? crow.customer_type_id : null;
    markup = getCustomerMarkup(db, Number(customerId));
  }
  const rows = db.prepare(`
    SELECT i.id, i.name, i.barcode,
      COALESCE(SUM(s.qty), 0) AS stock,
      COALESCE(pc.current_cost, 0) AS basis,
      COALESCE(SUM(s.qty * s.buy_price), 0) AS total_cost,
      pp.auto_price AS pp_auto, pp.manual_price AS pp_manual
    FROM items i
    LEFT JOIN shipments s ON s.item_id = i.id
    LEFT JOIN product_costs pc ON pc.item_id = i.id
    LEFT JOIN product_prices pp ON pp.item_id = i.id AND pp.customer_type_id ${typeId == null ? 'IS NULL' : '= ?'}
    WHERE ${cond}
    GROUP BY i.id
    ORDER BY i.name
    LIMIT 100
  `).all(...(typeId == null ? params : [...params, typeId]));
  return rows.map(r => {
    const stock = Number(r.stock) || 0;
    let cost = Number(r.basis) || 0;
    if (!(cost > 0) && stock > 0) cost = (Number(r.total_cost) || 0) / stock;
    let price = 0;
    if (typeId != null) {
      if (r.pp_auto != null || r.pp_manual != null) {
        price = r.pp_manual != null ? Number(r.pp_manual) : Number(r.pp_auto || 0);
      } else {
        price = (stock > 0 && cost > 0) ? calcAutoPrice(cost, markup) : 0;
      }
    } else {
      price = (stock > 0 && cost > 0) ? Math.round(cost) : 0;
    }
    if (!(price > 0)) price = 0;
    return { id: r.id, name: r.name, barcode: r.barcode, stock, cost, markup, price };
  });
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

// Resolve order lines: persisted effective price from product_prices, or manual override
// when unit_price (or explicit is_manual/manual flag from builder) is provided.
// Manual override is allowed and stored as-is (rounded to DA integer). Group by item+price,
// preserving is_manual=1 when any combined line was manual.
function priceOrderItems(db, customerId, items) {
  const list = items || [];
  if (!list.length) throw new Error('الطلبية يجب أن تحتوي على منتج واحد على الأقل');
  const resolved = list.map((it) => {
    const itemId = Number(it.item_id);
    const qty = Number(it.qty);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new Error('منتج غير صالح في الطلبية');
    if (!Number.isInteger(qty) || qty <= 0) throw new Error('الكمية يجب أن تكون عدداً صحيحاً أكبر من 0');
    if (!db.prepare('SELECT id FROM items WHERE id = ?').get(itemId)) throw new Error('منتج غير موجود في المخزون');
    const explicitManual = it.is_manual === 1 || it.is_manual === true || it.manual === true;
    const hasPrice = it.unit_price !== undefined && it.unit_price !== null && String(it.unit_price).trim() !== '';
    let unitPrice;
    let manual = false;
    if (explicitManual || hasPrice) {
      if (!hasPrice) throw new Error('سعر يدوي غير صالح — يجب أن يكون أكبر من 0');
      const m = Number(it.unit_price);
      if (!Number.isFinite(m) || m <= 0) throw new Error('سعر يدوي غير صالح — يجب أن يكون أكبر من 0');
      unitPrice = Math.round(m);
      manual = true;
    } else {
      // authoritative persisted effective price (no dynamic bypass)
      const crow = db.prepare('SELECT customer_type_id FROM customers WHERE id = ?').get(Number(customerId));
      const typeId = crow ? crow.customer_type_id : null;
      let price = 0;
      if (typeId != null) {
        const prow = db.prepare('SELECT auto_price, manual_price FROM product_prices WHERE item_id = ? AND customer_type_id = ?').get(itemId, typeId);
        if (prow) price = prow.manual_price != null ? Number(prow.manual_price) : Number(prow.auto_price);
        else {
          const crow2 = productPricing(itemId, customerId);
          price = crow2.price;
        }
      } else {
        const crow2 = productPricing(itemId, customerId);
        price = crow2.price;
      }
      if (!(price > 0)) throw new Error('لا يوجد سعر صالح لهذا المنتج (بدون مخزون أو بدون تكلفة) — أدخل سعراً يدوياً أو أضف شحنة شراء');
      unitPrice = price;
    }
    return { item_id: itemId, qty, unit_price: unitPrice, manual };
  });
  // combine duplicate (item_id + unit_price) lines
  const map = new Map();
  for (const r of resolved) {
    const k = r.item_id + '|' + r.unit_price;
    if (map.has(k)) {
      const ex = map.get(k);
      ex.qty += r.qty;
      ex.manual = ex.manual || r.manual;
    }
    else map.set(k, { ...r });
  }
  return [...map.values()];
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
  const priced = priceOrderItems(db, cid, items);
  db.exec('BEGIN');
  try {
    let subtotal = 0;
    for (const p of priced) subtotal += p.qty * p.unit_price;
    const discount = checkDiscount(discount_amount, subtotal);
    // orders.delivery_date = actual delivery date only — stays NULL until delivered
    const r = db.prepare(`
      INSERT INTO orders (customer_id, delivery_date, status, discount_amount, notes)
      VALUES (?, NULL, 'draft', ?, ?)
    `).run(cid, discount, (notes || '').trim());
    const orderId = Number(r.lastInsertRowid);
    const ins = db.prepare('INSERT INTO order_items (order_id, item_id, qty, unit_price, is_manual) VALUES (?, ?, ?, ?, ?)');
    for (const p of priced) ins.run(orderId, p.item_id, p.qty, p.unit_price, p.manual ? 1 : 0);
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
// auto lines re-resolved from persisted product_prices for the (possibly new) customer type;
// order-line manual prices (is_manual=1) preserved as-is.
function updateDraftOrder({ id, customer_id, notes, discount_amount, items }) {
  const db = getDb();
  const o = getDraftOrder(db, id);
  void o;
  const cid = Number(customer_id);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error('اختر الزبون');
  getActiveCustomer(db, cid);
  const priced = priceOrderItems(db, cid, items);
  db.exec('BEGIN');
  try {
    let subtotal = 0;
    for (const p of priced) subtotal += p.qty * p.unit_price;
    const discount = checkDiscount(discount_amount, subtotal);
    db.prepare(`UPDATE orders SET customer_id = ?, discount_amount = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(cid, discount, (notes || '').trim(), id);
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
    const ins = db.prepare('INSERT INTO order_items (order_id, item_id, qty, unit_price, is_manual) VALUES (?, ?, ?, ?, ?)');
    for (const p of priced) ins.run(id, p.item_id, p.qty, p.unit_price, p.manual ? 1 : 0);
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
  return items.map(i => {
    const { stock } = productCost(i.item_id);
    return { item_id: i.item_id, qty: i.qty, stock, short: Number(i.qty) > Number(stock) };
  }).filter(w => w.short);
}

function getOrder(id) {
  const db = getDb();
  const o = db.prepare(`
    SELECT o.*, c.name AS customer_name, c.deleted_at AS customer_deleted,
      c.customer_type_id, t.name AS customer_type_name, t.markup_percentage AS customer_markup,
      d.name AS district_name
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN districts d ON d.id = c.district_id
    LEFT JOIN customer_types t ON t.id = c.customer_type_id
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

// ---------------- Warnings (Phase W — read-only, no writes) ----------------
// All checks are computable from current schema. Thresholds are hardcoded
// (no settings screen per brief); working-days calendar uses calendar days for now.
// Root cause of the old ~150 cap: WARN_LIMIT=50 per query × 3 overlapping product
// queries (zero_stock/no_cost/no_price) + global 500. Fixed by raising both so a
// realistic catalog (hundreds of products) is fully reported; UI paginates.
const WARN_LIMIT = 2000;
const WARN_TOTAL_MAX = 5000;

function getWarnings({ inactiveCustomerDays = 30, staleDraftDays = 7, waitingDays = 7, idleDriverDays = 3, stuckDeliveryDays = 2, quietDays = 7 } = {}) {
  const db = getDb();
  const out = [];
  const push = (category, code, severity, message, ref) => {
    if (out.length < WARN_TOTAL_MAX) out.push({ category, code, severity, message, ref: ref || null });
  };

  // 1. Inventory
  for (const r of db.prepare(`SELECT i.id, i.name, COALESCE(SUM(s.qty),0) AS stock FROM items i LEFT JOIN shipments s ON s.item_id=i.id GROUP BY i.id HAVING stock <= 0 LIMIT ${WARN_LIMIT}`).all())
    push('inventory', 'zero_stock', 'warn', `منتج بدون مخزون: «${r.name}» (#${r.id})`, { item_id: r.id });
  for (const r of db.prepare(`SELECT DISTINCT i.id, i.name FROM shipments s JOIN items i ON i.id=s.item_id WHERE s.expiry_date IS NOT NULL AND s.expiry_date != '' AND date(s.expiry_date) < date('now') LIMIT ${WARN_LIMIT}`).all())
    push('inventory', 'expired_stock', 'danger', `مخزون منتهي: «${r.name}» (#${r.id})`, { item_id: r.id });
  for (const r of db.prepare(`SELECT DISTINCT i.id, i.name FROM shipments s JOIN items i ON i.id=s.item_id WHERE s.expiry_date IS NOT NULL AND s.expiry_date != '' AND date(s.expiry_date) >= date('now') AND date(s.expiry_date) <= date('now','+90 days') LIMIT ${WARN_LIMIT}`).all())
    push('inventory', 'near_expiry', 'warn', `مخزون قريب الانتهاء (90 يوم): «${r.name}» (#${r.id})`, { item_id: r.id });
  for (const r of db.prepare(`SELECT i.id, i.name FROM items i LEFT JOIN shipments s ON s.item_id=i.id GROUP BY i.id HAVING COALESCE(SUM(s.qty * s.buy_price),0) <= 0 OR COALESCE(SUM(s.qty),0) <= 0 LIMIT ${WARN_LIMIT}`).all())
    push('inventory', 'no_cost', 'warn', `منتج بدون تكلفة شراء: «${r.name}» (#${r.id}) — أضف شحنة شراء`, { item_id: r.id });
  for (const r of db.prepare(`SELECT i.id, i.name, COALESCE(SUM(s.qty),0) AS stock, COALESCE(SUM(s.qty*s.buy_price),0) AS total FROM items i LEFT JOIN shipments s ON s.item_id=i.id GROUP BY i.id HAVING stock <= 0 OR total <= 0 LIMIT ${WARN_LIMIT}`).all())
    push('pricing', 'no_price', 'warn', `لا يمكن حساب سعر: «${r.name}» (#${r.id}) — بدون مخزون/تكلفة`, { item_id: r.id });
  for (const r of db.prepare(`SELECT s.id, i.name FROM shipments s JOIN items i ON i.id=s.item_id WHERE COALESCE(s.buy_price,0) <= 0 OR s.expiry_date IS NULL OR s.expiry_date = '' LIMIT ${WARN_LIMIT}`).all())
    push('inventory', 'incomplete_shipment', 'info', `شحنة ببيانات ناقصة (#${r.id} — «${r.name}»): سعر شراء صفر أو بدون تاريخ انتهاء`, { shipment_id: r.id });
  // insufficient for committed active orders
  try {
    const demand = committedDemand(db);
    const stock = physicalStock(db);
    for (const [itemId, need] of Object.entries(demand)) {
      if (Number(need) > (stock[itemId] || 0)) {
        const nm = db.prepare('SELECT name FROM items WHERE id=?').get(itemId);
        push('inventory', 'short_for_orders', 'danger', `مخزون غير كافٍ للطلبيات المؤكدة: «${nm ? nm.name : itemId}» (مطلوب ${need}، متوفر ${stock[itemId] || 0})`, { item_id: Number(itemId) });
      }
    }
  } catch {}
  for (const r of db.prepare(`SELECT i.id, i.name FROM items i LEFT JOIN shipments s ON s.item_id=i.id GROUP BY i.id HAVING COALESCE(SUM(s.qty),0) < 0 LIMIT ${WARN_LIMIT}`).all())
    push('inventory', 'negative_stock', 'danger', `مخزون سالب (يفترض ألا يحدث قبل خصم التوصيل): «${r.name}» (#${r.id})`, { item_id: r.id });

  // 2. Pricing
  for (const r of db.prepare(`SELECT id, name FROM customers WHERE customer_type_id IS NULL AND deleted_at IS NULL LIMIT ${WARN_LIMIT}`).all())
    push('pricing', 'customer_no_type', 'warn', `زبون بدون نوع (يُحسب بسعر التكلفة): «${r.name}» (#${r.id})`, { customer_id: r.id });
  for (const r of db.prepare(`SELECT id, name FROM customer_types WHERE COALESCE(markup_percentage,0) = 0 LIMIT ${WARN_LIMIT}`).all())
    push('pricing', 'type_no_markup', 'info', `نوع بنسبة 0% (سعر = التكلفة): «${r.name}» (#${r.id})`, { type_id: r.id });
  // draft price outdated vs persisted effective price — intentional manual order lines (is_manual=1)
  // are never flagged; only stale automatic lines are reported.
  for (const o of db.prepare(`SELECT id, customer_id FROM orders WHERE status='draft' LIMIT ${WARN_LIMIT}`).all()) {
    const lines = db.prepare('SELECT item_id, unit_price, COALESCE(is_manual, 0) AS is_manual FROM order_items WHERE order_id=?').all(o.id);
    for (const ln of lines) {
      if (Number(ln.is_manual) === 1) continue;
      const cur = productPricing(ln.item_id, o.customer_id).price;
      if (cur > 0 && Number(ln.unit_price) !== cur) {
        push('pricing', 'draft_outdated', 'info', `مسودة #${o.id} قد يكون سعرها قديماً: منتج #${ln.item_id} محفوظ ${ln.unit_price} والحالي ${cur}`, { order_id: o.id });
        break;
      }
    }
  }

  // 3. Customers
  for (const r of db.prepare(`SELECT c.id, c.name FROM customers c LEFT JOIN customer_phones p ON p.customer_id=c.id WHERE c.deleted_at IS NULL GROUP BY c.id HAVING COUNT(p.id)=0 LIMIT ${WARN_LIMIT}`).all())
    push('customers', 'no_phone', 'info', `زبون بدون هاتف: «${r.name}» (#${r.id})`, { customer_id: r.id });
  for (const r of db.prepare(`SELECT id, name FROM customers WHERE district_id IS NULL AND deleted_at IS NULL LIMIT ${WARN_LIMIT}`).all())
    push('customers', 'no_district', 'info', `زبون بدون منطقة: «${r.name}» (#${r.id})`, { customer_id: r.id });
  for (const r of db.prepare(`SELECT id, name FROM customers WHERE (latitude IS NULL OR longitude IS NULL) AND deleted_at IS NULL LIMIT ${WARN_LIMIT}`).all())
    push('customers', 'no_gps', 'info', `زبون بدون إحداثيات GPS: «${r.name}» (#${r.id})`, { customer_id: r.id });
  for (const r of db.prepare(`SELECT p.phone_number AS ph, COUNT(DISTINCT p.customer_id) AS c FROM customer_phones p JOIN customers c ON c.id=p.customer_id WHERE c.deleted_at IS NULL GROUP BY p.phone_number HAVING c > 1 LIMIT ${WARN_LIMIT}`).all())
    push('customers', 'dup_phone', 'warn', `رقم هاتف مكرر لدى ${r.c} زبائن: ${r.ph}`, null);
  for (const r of db.prepare(`SELECT c.id, c.name FROM customers c WHERE c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id AND datetime(o.created_at) >= datetime('now', ?)) LIMIT ${WARN_LIMIT}`, [`-${Math.trunc(Number(inactiveCustomerDays) || 30)} days`]).all())
    push('customers', 'inactive_customer', 'info', `زبون بدون طلبيات منذ ${inactiveCustomerDays} يوم: «${r.name}» (#${r.id})`, { customer_id: r.id });

  // 4. Orders
  for (const r of db.prepare(`SELECT id, customer_id FROM orders WHERE status='draft' AND datetime(updated_at) < datetime('now', ?) LIMIT ${WARN_LIMIT}`, [`-${Math.trunc(Number(staleDraftDays) || 7)} days`]).all())
    push('orders', 'stale_draft', 'warn', `مسودة لم تُلمس منذ ${staleDraftDays} أيام: #${r.id} (زبون #${r.customer_id})`, { order_id: r.id });
  for (const r of db.prepare(`SELECT o.id FROM orders o WHERE o.status IN ('confirmed','waiting') AND NOT EXISTS (SELECT 1 FROM delivery_orders m WHERE m.order_id=o.id AND m.removed_at IS NULL AND m.delivered_at IS NULL) LIMIT ${WARN_LIMIT}`).all())
    push('orders', 'unassigned', 'warn', `طلبية مؤكدة غير مرفقة بتوصيل: #${r.id}`, { order_id: r.id });
  for (const r of db.prepare(`SELECT id FROM orders WHERE status IN ('waiting','out_for_delivery') AND datetime(created_at) < datetime('now', ?) LIMIT ${WARN_LIMIT}`, [`-${Math.trunc(Number(waitingDays) || 7)} days`]).all())
    push('orders', 'waiting_long', 'warn', `طلبية تنتظر منذ ${waitingDays} أيام: #${r.id}`, { order_id: r.id });
  for (const o of db.prepare(`SELECT id FROM orders WHERE status IN ('draft','confirmed','waiting','out_for_delivery') LIMIT ${WARN_LIMIT}`).all()) {
    const lines = db.prepare('SELECT item_id, qty FROM order_items WHERE order_id=?').all(o.id);
    const shorts = stockWarnings(lines);
    if (shorts.length) { push('orders', 'insufficient_stock', 'danger', `طلبية #${o.id} تتجاوز المخزون (${shorts.length} منتجات)`, { order_id: o.id }); }
  }

  // 5. Deliveries
  for (const r of db.prepare(`SELECT id, delivery_date FROM deliveries WHERE status='planned' AND hidden_at IS NULL AND date(delivery_date) < date('now') LIMIT ${WARN_LIMIT}`).all())
    push('deliveries', 'overdue_planned', 'danger', `شحنة مخططة متأخرة: #${r.id} (كانت ${r.delivery_date})`, { delivery_id: r.id });
  for (const r of db.prepare(`SELECT id, started_at FROM deliveries WHERE status='in_progress' AND hidden_at IS NULL AND datetime(started_at) < datetime('now', ?) LIMIT ${WARN_LIMIT}`, [`-${Math.trunc(Number(stuckDeliveryDays) || 2)} days`]).all())
    push('deliveries', 'stuck', 'warn', `شحنة بدأت ولم تنته منذ ${stuckDeliveryDays} أيام: #${r.id}`, { delivery_id: r.id });
  for (const r of db.prepare(`SELECT d.id FROM deliveries d WHERE d.status='completed' AND EXISTS (SELECT 1 FROM delivery_orders m JOIN orders o ON o.id=m.order_id WHERE m.delivery_id=d.id AND m.removed_at IS NULL AND m.delivered_at IS NULL AND o.status != 'delivered') LIMIT ${WARN_LIMIT}`).all())
    push('deliveries', 'completed_undelivered', 'warn', `شحنة مكتملة وبها طلبيات غير مُسلّمة: #${r.id}`, { delivery_id: r.id });
  for (const r of db.prepare(`SELECT d.id FROM deliveries d WHERE d.hidden_at IS NULL AND NOT EXISTS (SELECT 1 FROM delivery_orders m WHERE m.delivery_id=d.id AND m.removed_at IS NULL) LIMIT ${WARN_LIMIT}`).all())
    push('deliveries', 'empty', 'warn', `شحنة بدون طلبيات نشطة: #${r.id}`, { delivery_id: r.id });
  for (const r of db.prepare(`SELECT DISTINCT delivery_id AS id FROM delivery_orders WHERE removed_at IS NOT NULL LIMIT ${WARN_LIMIT}`).all())
    push('deliveries', 'has_removed', 'info', `شحنة بها طلبيات أُزيلت من مسارها: #${r.id}`, { delivery_id: r.id });

  // 6. Employees
  for (const r of db.prepare(`SELECT e.id, e.name FROM employees e WHERE e.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM employee_roles r WHERE r.employee_id=e.id) LIMIT ${WARN_LIMIT}`).all())
    push('employees', 'no_role', 'warn', `موظف بدون دور: «${r.name}» (#${r.id})`, { employee_id: r.id });
  for (const r of db.prepare(`SELECT e.id, e.name FROM employees e JOIN employee_roles r ON r.employee_id=e.id WHERE e.deleted_at IS NULL AND r.role='driver' AND EXISTS (SELECT 1 FROM deliveries d WHERE d.driver_id=e.id AND d.status IN ('planned','in_progress') AND d.hidden_at IS NULL) AND NOT EXISTS (SELECT 1 FROM delivery_orders m JOIN deliveries d ON d.id=m.delivery_id WHERE d.driver_id=e.id AND m.delivered_at IS NOT NULL) LIMIT ${WARN_LIMIT}`).all())
    push('employees', 'driver_no_activity', 'warn', `سائق لديه عمل مسند بدون أي تسليم منجز: «${r.name}» (#${r.id})`, { employee_id: r.id });
  for (const r of db.prepare(`SELECT e.id, e.name FROM employees e WHERE e.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.driver_id=e.id AND datetime(d.created_at) >= datetime('now', ?)) LIMIT ${WARN_LIMIT}`, [`-${Math.trunc(Number(idleDriverDays) || 3)} days`]).all())
    push('employees', 'idle', 'info', `موظف/سائق بدون نشاط منذ ${idleDriverDays} أيام (تقويمية — أيام العمل لاحقاً): «${r.name}» (#${r.id})`, { employee_id: r.id });
  for (const r of db.prepare(`SELECT driver_id AS id, COUNT(*) AS c FROM deliveries WHERE status IN ('planned','in_progress') AND hidden_at IS NULL GROUP BY driver_id HAVING c > 1 LIMIT ${WARN_LIMIT}`).all()) {
    const nm = db.prepare('SELECT name FROM employees WHERE id=?').get(r.id);
    push('employees', 'driver_multi', 'warn', `سائق لديه ${r.c} شحنات نشطة: «${nm ? nm.name : r.id}» (#${r.id})`, { employee_id: r.id });
  }

  // 7. Vehicles
  for (const r of db.prepare(`SELECT v.id, v.name FROM vehicles v WHERE v.is_available=0 AND v.deleted_at IS NULL AND EXISTS (SELECT 1 FROM deliveries d WHERE d.vehicle_id=v.id AND d.status IN ('planned','in_progress') AND d.hidden_at IS NULL) LIMIT ${WARN_LIMIT}`).all())
    push('vehicles', 'unavailable_assigned', 'danger', `مركبة غير متوفرة لكنها مسندة لشحنة نشطة: «${r.name}» (#${r.id})`, { vehicle_id: r.id });
  for (const r of db.prepare(`SELECT vehicle_id AS id, COUNT(*) AS c FROM deliveries WHERE status IN ('planned','in_progress') AND hidden_at IS NULL GROUP BY vehicle_id HAVING c > 1 LIMIT ${WARN_LIMIT}`).all()) {
    const nm = db.prepare('SELECT name FROM vehicles WHERE id=?').get(r.id);
    push('vehicles', 'multi_assigned', 'warn', `مركبة مسندة لـ ${r.c} شحنات نشطة: «${nm ? nm.name : r.id}» (#${r.id})`, { vehicle_id: r.id });
  }
  for (const r of db.prepare(`SELECT id, name FROM vehicles WHERE (plate_number IS NULL OR plate_number='') AND deleted_at IS NULL LIMIT ${WARN_LIMIT}`).all())
    push('vehicles', 'no_plate', 'info', `مركبة بدون لوحة: «${r.name}» (#${r.id})`, { vehicle_id: r.id });

  // 8. Data consistency
  for (const r of db.prepare(`SELECT o.id FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE c.id IS NULL LIMIT ${WARN_LIMIT}`).all())
    push('consistency', 'order_bad_customer', 'danger', `طلبية تشير لزبون غير موجود: #${r.id}`, { order_id: r.id });
  for (const r of db.prepare(`SELECT oi.order_id AS oid FROM order_items oi LEFT JOIN items i ON i.id=oi.item_id WHERE i.id IS NULL LIMIT ${WARN_LIMIT}`).all())
    push('consistency', 'order_bad_product', 'danger', `سطر طلبية يشير لمنتج غير موجود (طلبية #${r.oid})`, { order_id: r.oid });
  for (const r of db.prepare(`SELECT d.id FROM deliveries d LEFT JOIN employees e ON e.id=d.driver_id WHERE e.id IS NULL OR e.deleted_at IS NOT NULL LIMIT ${WARN_LIMIT}`).all())
    push('consistency', 'delivery_bad_driver', 'danger', `شحنة بسائق غير صالح/محذوف: #${r.id}`, { delivery_id: r.id });
  for (const r of db.prepare(`SELECT d.id FROM deliveries d LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE v.id IS NULL OR v.deleted_at IS NOT NULL LIMIT ${WARN_LIMIT}`).all())
    push('consistency', 'delivery_bad_vehicle', 'danger', `شحنة بمركبة غير صالحة/محذوفة: #${r.id}`, { delivery_id: r.id });
  for (const r of db.prepare(`SELECT DISTINCT o.customer_id AS id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.deleted_at IS NOT NULL AND o.status IN ('draft','confirmed','waiting','out_for_delivery') LIMIT ${WARN_LIMIT}`).all())
    push('consistency', 'deleted_active', 'warn', `زبون محذوف لديه طلبيات نشطة: زبون #${r.id}`, { customer_id: r.id });
  for (const r of db.prepare(`SELECT id, name FROM customers WHERE ((latitude IS NOT NULL AND (latitude < -90 OR latitude > 90)) OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))) AND deleted_at IS NULL LIMIT ${WARN_LIMIT}`).all())
    push('consistency', 'bad_coords', 'danger', `إحداثيات غير صالحة: «${r.name}» (#${r.id})`, { customer_id: r.id });
  for (const r of db.prepare(`SELECT barcode AS b, COUNT(*) AS c FROM items WHERE barcode IS NOT NULL AND barcode != '' GROUP BY barcode HAVING c > 1 LIMIT ${WARN_LIMIT}`).all())
    push('consistency', 'dup_barcode', 'danger', `باركود مكرر ${r.c} مرات: ${r.b}`, null);

  // 9. System activity
  const lastOrder = db.prepare(`SELECT MAX(datetime(created_at)) AS m FROM orders`).get().m;
  const lastDel = db.prepare(`SELECT MAX(datetime(created_at)) AS m FROM deliveries`).get().m;
  const lastInv = db.prepare(`SELECT MAX(datetime(created_at)) AS m FROM (SELECT created_at FROM shipments UNION ALL SELECT created_at FROM items)`).get().m;
  const qd = `-${Math.trunc(Number(quietDays) || 7)} days`;
  if (!lastOrder || new Date(lastOrder) < new Date(Date.now() - (Number(quietDays) || 7) * 864e5))
    push('activity', 'no_orders', 'info', `لا طلبيات منذ ${quietDays} أيام${lastOrder ? ` (آخرها ${String(lastOrder).slice(0, 10)})` : ' (لا طلبيات أبداً)'}`, null);
  if (!lastDel || new Date(lastDel) < new Date(Date.now() - (Number(quietDays) || 7) * 864e5))
    push('activity', 'no_deliveries', 'info', `لا شحنات توصيل منذ ${quietDays} أيام`, null);
  if (!lastInv || new Date(lastInv) < new Date(Date.now() - (Number(quietDays) || 7) * 864e5))
    push('activity', 'no_inventory', 'info', `لا نشاط مخزون (منتج/شحنة) منذ ${quietDays} أيام`, null);
  if ((!lastOrder || new Date(lastOrder) < new Date(Date.now() - (Number(quietDays) || 7) * 864e5)) && (!lastDel || new Date(lastDel) < new Date(Date.now() - (Number(quietDays) || 7) * 864e5)) && (!lastInv || new Date(lastInv) < new Date(Date.now() - (Number(quietDays) || 7) * 864e5)))
    push('activity', 'no_business', 'warn', `لا نشاط تجاري إطلاقاً منذ ${quietDays} أيام`, null);
  void qd;

  const byCat = {};
  for (const w of out) byCat[w.category] = (byCat[w.category] || 0) + 1;
  // Group overlapping product warnings by product WITHOUT deleting diagnostics:
  // zero_stock/no_cost/no_price for the same item collapse into one product group
  // entry carrying its individual codes. Counts distinguish total warning events
  // from affected products. Individual `warnings` array is preserved untouched.
  const byCode = {};
  for (const w of out) byCode[w.code] = (byCode[w.code] || 0) + 1;
  const groups = new Map();
  for (const w of out) {
    const iid = w.ref && w.ref.item_id != null ? Number(w.ref.item_id) : null;
    if (iid == null || !['zero_stock', 'no_cost', 'no_price'].includes(w.code)) continue;
    if (!groups.has(iid)) groups.set(iid, { item_id: iid, codes: [], severities: [] });
    const gr = groups.get(iid);
    if (!gr.codes.includes(w.code)) gr.codes.push(w.code);
    gr.severities.push(w.severity);
  }
  const productGroups = [...groups.values()].map(gr => {
    const nm = db.prepare('SELECT name FROM items WHERE id = ?').get(gr.item_id);
    const sev = gr.severities.includes('danger') ? 'danger' : gr.severities.includes('warn') ? 'warn' : 'info';
    return { item_id: gr.item_id, item_name: nm ? nm.name : ('#' + gr.item_id), codes: gr.codes, count: gr.codes.length, severity: sev };
  }).sort((a, b) => a.item_id - b.item_id);
  return { generated_at: new Date().toISOString(), total: out.length, by_category: byCat, by_code: byCode, affected_products: productGroups.length, product_groups: productGroups, warnings: out, truncated: out.length >= WARN_TOTAL_MAX, limit: WARN_TOTAL_MAX };
}

module.exports = { init, getDb, exportBackup, listCategories, addCategory, updateCategory, deleteCategory, listCompanies, addCompany, updateCompany, deleteCompany, addItem, getItem, updateItem, deleteItem, listItems, addShipment, getShipment, updateShipment, deleteShipment, importReceipt, listShipments, listShipmentsDetailed, getOverview, listCustomerTypes, addCustomerType, updateCustomerType, deleteCustomerType, listDistricts, addDistrict, updateDistrict, deleteDistrict, findPhoneOwners, addCustomer, listCustomers, getCustomer, updateCustomer, deleteCustomer, restoreCustomer, addCustomerPhone, deleteCustomerPhone, ORDER_STATUSES, ORDER_TRANSITIONS, orderRef, productCost, productPricing, listProductsForOrder, combineItems, createOrder, updateDraftOrder, getOrder, confirmOrder, setOrderStatus, setDeliveryDate, deleteOrder, listOrders, listCustomerOrders, calcAutoPrice, wavgCostTx, recomputeProductPrices, getProductCost, setProductCost, getProductPrices, getProductPrice, setProductManualPrice, clearProductManualPrice, getProductPriceHistory, backfillPricing, EMPLOYEE_ROLES, listEmployees, getEmployee, addEmployee, updateEmployee, deleteEmployee, restoreEmployee, addEmployeePhone, deleteEmployeePhone, setEmployeeRoles, listEmployeesByRole, listVehicles, getVehicle, addVehicle, updateVehicle, deleteVehicle, restoreVehicle, setVehicleAvailability, DELIVERY_STATUSES, createDelivery, updatePlannedDelivery, addOrderToDelivery, removeOrderFromDelivery, reorderStops, startDelivery, deliverOrder, completeDelivery, hideDelivery, deleteDelivery, detachOrderFromDeliveries, getDelivery, listDeliveries, eligibleOrders, deliveryStockCheck, getWarnings };
