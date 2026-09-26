# Distributor Management Software — Project Brief (updated v0.1)

> Updated after prototype build. Original strategy kept; Section 15+ describe what is actually built.

## 1. Project context

Custom software for a grocery/food distributor (warehouse + distribution to grocery stores / mini-markets).

Owner currently uses **Loyverse POS** and has **GPS trackers on delivery trucks**. He wants a system tailored to his workflow. Primarily a **learning opportunity / first commissioned project**; earning money is secondary to learning requirements, architecture, deployment, integrations.

First meeting postponed; project is in discovery/prototyping. Loyverse is a **reference only** — no integration, no dependency.

## 2. Core strategy (unchanged)

Build a small working CRUD core first, keep it modular, expand one system at a time. Not a Loyverse clone: smaller, distributor-specific (stock → order → truck/load → delivery → payment).

## 3. High-level architecture — AS BUILT v0.1

Desktop-first, not cloud yet:

- **Shell:** Electron (devDependency `electron@^44`), `main.js` opens **1920×1080, maximized on ready** (`min 1280×720`). Run: `npm start`, dev: `npm run dev` (`--dev` opens DevTools).
- **DB:** single local SQLite file `db/database.sqlite` (gitignored) via Node built-in **`node:sqlite` (`DatabaseSync`)** — no native modules (better-sqlite3 was removed: no prebuild for Node 26). All SQL lives in `db/database.js`.
- **IPC:** `main.js` exposes handlers; `preload.js` exposes `window.api` via `contextBridge` (no `nodeIntegration`). UI never touches SQLite directly: `module.js → window.api → database.js → SQLite`.
- **UI:** plain HTML/CSS/JS, **Arabic RTL** (`<html lang="ar" dir="rtl">`), white + light-blue/cyan theme. No framework. Global styles in `style.css`, per-module CSS alongside.
- **Scaling decision:** user explicitly rejected a `--ui-scale`/`zoom` variable. All sizes are **hardcoded px already multiplied by ~1.35** (1280×800 → 1920×1080 scale). No zoom property anywhere.

```
Depot-Management./
├── package.json
├── main.js
├── preload.js
├── index.html
├── style.css
├── .gitignore        # ignores node_modules, dist/out, db/*.sqlite*
├── modules/
│   └── inventory/
│       ├── inventory.html
│       ├── inventory.css
│       └── inventory.js
└── db/
    ├── database.js
    └── database.sqlite   # local only, gitignored
```

## 4. Sidebar — AS BUILT (7 items, only Inventory live)

| key | label | state |
|---|---|---|
| inventory | 📋 المخزون | live |
| customers | 👥 الزبائن | coming-soon placeholder |
| orders | 🧾 الطلبيات | coming-soon (kept separate from customers — merge discussed, rejected) |
| payments | 💰 الدفعات | coming-soon |
| staff | 👷 الموظفون والمركبات | renamed from Fleet/الأسطول; covers employees + drivers + trucks + motorcycle |
| deliveries | 🛣️ التوصيل | coming-soon |
| dashboard | 📊 اللوحة | coming-soon (read-only aggregates later) |

Other modules (GPS, Bluetooth printer, reports, notifications, permissions, audit, mobile driver app) are future extensions, no placeholders in code.

## 5. Terminology decisions (locked)

- **صنف → منتج / منتجات** everywhere (صنف reads as "category" in Arabic). Buttons: `＋ منتج جديد`, `＋ شحنة`, `＋ فئة`, `＋ شركة`.
- **No units table** — unit stays inside the name (e.g. `حليب المراعي 1ل`).
- **No `active`, no `min_stock`, no multi-location** (single depot).
- **No Settings screen** — hardcoded logic (e.g. 90-day expiry window). Customer requests become code, not settings.
- **Supplier = free text** on shipment for now. No suppliers/purchasing module yet.
- Placeholders must show they are examples: prefix **`مثلا:`** (e.g. `مثلا: حليب المراعي 1ل`). Search bar is bare `ابحث…`.

## 6–14. (Original sections: distribution vision, Loyverse notes, NOT-building list, philosophy, phases, communication, scope, success criteria — unchanged.)

Key non-goals for this prototype still hold: no GPS, no route optimization, no maps, no driver app, no printer, no accounting, no cloud sync. Extension points (`gps_device_id`-style fields, clean order/delivery data) come later.

---

## 15. What is actually implemented in v0.1 (Inventory only)

- Electron shell + RTL sidebar + module loader (`InventoryModule.mount(root)`; others render a "later" notice).
- Full Inventory CRUD: products, categories, companies, shipments; stock derived; expiry alerts computed.
- Smoke-tested via `node`: add category/company/product/shipment, list, overview. Test rows removed afterwards; real user data preserved.

## 16. Inventory module — detail

### 16.1 Concepts

- **Product (`items`)**: catalog only — `name` + `barcode` (QR/SKU, optional, UNIQUE) + optional category + company. **No price, no qty, no expiry on the product.**
- **Shipment**: the only stock-in event — `qty` (QTY = how many pieces arrived), `buy_price` (what depot paid/unit), `sell_price` (what depot will sell/unit from this batch), `expiry_date` (per shipment), `supplier` text. Different shipments of the same product can have different prices/expiries.
- **Stock**: `stock(item) = SUM(shipments.qty WHERE item_id)` (sales deductions plug in later from Orders).
- **Category / Company**: managed inside Inventory (`＋ فئة` / `＋ شركة` in the header next to product/shipment buttons). Each has `name UNIQUE + color` (color picker, default blue `#0288d1` / purple `#6a1b9a`), shown as colored pills, usable as filters.
- **Spoilage/expiry = logic, no table**: `expiry ≤ today+90d` → "قريب" (warn), `< today` → "منتهي" (danger).

### 16.2 Database schema (`db/database.js`, `node:sqlite`)

```sql
CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#0288d1');
CREATE TABLE companies  (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#6a1b9a');
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  company_id  INTEGER REFERENCES companies(id)  ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL CHECK (qty > 0),
  buy_price REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  expiry_date TEXT,            -- per-shipment, 'YYYY-MM-DD' or NULL
  supplier TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
-- indexes: shipments(item_id), shipments(expiry_date), items(name)
-- migration: ALTER TABLE items ADD COLUMN category_id/company_id (try/catch for old DBs)
```

Key queries: `listItems` (grouped with `SUM(qty)`, last buy/sell subqueries, `MIN(expiry)`), `listShipmentsDetailed` (one row per shipment joined to item/category/company, sort `expiry_asc | qty_desc | newest`), `getOverview` (counts). All exposed via IPC: `items:list/add`, `shipments:add/list/detailed`, `categories:list/add`, `companies:list/add`, `inventory:overview`.

### 16.3 UI (`modules/inventory/`)

- **Header:** title `المخزون — المنتجات`, 4 buttons: `＋ منتج جديد` (primary) `＋ شحنة` (cyan) `＋ فئة` `＋ شركة` (ghost).
- **Cards (all clickable):** `عدد المنتجات` + `إجمالي الكمية` → products view; `قريب الانتهاء (3 أشهر)` → expiry view. **Stats follow current search/filters**, not global totals. Active card outlined.
- **Toolbar:** search (`ابحث…`) + فئة filter + شركة filter + `تحديث`.
- **Viewbar:** `قائمة المنتجات` vs `الشحنات — كل شحنة على حدة` + sort select (visible in expiry view): `الأقرب انتهاءً / الأكبر كمية / الأحدث`.
- **Products view:** grouped table (المنتج/باركود/الفئة/الشركة/الكمية/أقرب انتهاء/آخر شراء/آخر بيع/+شحنة).
- **Expiry view:** one row per shipment with expiry (المنتج/الفئة/الشركة/كمية الشحنة/الانتهاء/شراء/بيع/المورّد) — same product with 2 batches shows as 2 rows.
- **Modals:** منتج جديد (name + barcode + category/company selects), فئة جديدة (name + color), شركة جديدة (name + color), شحنة جديدة (product select, QTY, supplier, buy/sell, expiry). All example placeholders prefixed `مثلا:`.
- **Styling:** hardcoded scaled px (sidebar 338px, base fonts 19–20px, table 19px, modal 567px, radius 19–22px), `.pill` colored badges, `.badge` expiry states, `.card.clickable` hover/active.

### 16.4 Deliberately NOT in v0.1

Edit/delete product, stock-out/spoilage deduction, lot splitting, FIFO/valuation, average cost, barcode printing, supplier table, transfers, notifications. Prices preserved per shipment so future Orders can snapshot `unit_price` safely.

---

## 17. Phase A — Customers (implemented)

Sidebar `👥 الزبائن` is live. Self-contained `modules/customers/` (html/css/js, IIFE + `mount(root)`, `window.CustomersModule.openCreate(onCreated)` reusable popup for future Orders). Reuses global `.btn/.card/.tbl/.modal` classes from inventory.css.

### Schema
- `districts(id, name UNIQUE, created_at)` — user-defined, no hardcoded hierarchy.
- `customers(id, name, district_id→districts NULL, latitude REAL NULL, longitude REAL NULL, notes, deleted_at NULL, created_at, updated_at)` — identity = numeric ID shown as رقم الزبون. No type/status/credit fields.
- `customer_phones(id, customer_id CASCADE, phone_number TEXT, created_at)` — unlimited per customer, phone NOT globally unique.
- Indexes: customers(name, district_id, deleted_at), phones(customer_id, phone_number). `CREATE TABLE IF NOT EXISTS` in `db/database.js init()` — existing Inventory data untouched.

### Behaviors
- Search modes (segmented buttons change placeholder): رقم الزبون (exact ID) / الاسم (LIKE) / رقم الهاتف (LIKE via phone relation). District filter by relation. List shows رقم/اسم/الحي only.
- Soft delete: `deleted_at`, UI says حذف الزبون (never "archive"/active toggle); deleted hidden from lists/searches; المحذوفون card → restore view; phones preserved through delete/restore (CASCADE only on physical delete, which UI never does).
- Duplicate phone = yellow inline warning (غير مانع), never blocks; no audit table.
- GPS optional manual entry, validated lat ±90 / lng ±180; no map.
- Create/update wrapped in `BEGIN/COMMIT/ROLLBACK` so customer+phones stay consistent.
- Detail modal reserves a `futurebox` slot for order/payment history (not implemented).
- IPC: `districts:list/add`, `customers:list/get/add/update/delete/restore`, `customers:phones:add/delete/check`.
