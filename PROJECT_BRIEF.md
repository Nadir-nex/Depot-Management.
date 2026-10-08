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
- **Styling:** hardcoded scaled px, shrunk ~12% from the ×1.35 baseline but still full-window 1080p 16:9, no zoom variable (sidebar 298px, base fonts 17–18px, table 17px, modal 500px / wide 600px, radius 17–19px), `.pill` colored badges, `.badge` expiry states, `.card.clickable` hover/active.

### 16.4 Deliberately NOT in v0.1 (PARTIALLY SUPERSEDED — CRUD edit/delete added later)

~~Edit/delete product~~ — now implemented (products prefill-modal edit; delete blocked with Arabic error if shipments/order history exist). Categories/companies/districts: full edit/delete (refs `SET NULL`, never delete business records). Shipments: edit (product fixed, qty/price/expiry/supplier) + delete; both recalculate wavg + stock, old order snapshots untouched. Still NOT: stock-out/deduction engine (Phase 3), lot splitting, FIFO/valuation, barcode printing, supplier table, transfers. Prices preserved per shipment so Orders snapshot `unit_price` safely.

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

---

## 18. Phase B — Orders (implemented)

Sidebar `🧾 الطلبيات` is live. Self-contained `modules/orders/` (html/css/js, IIFE + `mount`, `window.OrdersModule.openDetail`). Reuses global classes; `.ord .cards` scoped to 4 columns so Inventory's grid is untouched.

### Schema
- `orders(id AUTOINCREMENT, customer_id→customers, delivery_date TEXT YYYY-MM-DD NULL, status DEFAULT 'draft', discount_amount REAL DEFAULT 0, notes, created_at, updated_at)` — no `delivery_shipment_id`, no payment/scout/tax fields. Customer FK is non-cascading: deleting a customer never deletes orders.
- `order_items(id AUTOINCREMENT, order_id CASCADE, item_id→items, qty INT>0, unit_price REAL>0, is_manual INT DEFAULT 0, created_at)` — `unit_price` is the historical snapshot, `is_manual=1` marks order-line manual prices.
- Statuses: draft→confirmed→waiting→out_for_delivery→delivered, plus cancelled from any pre-delivery state. Terminal states never reopen. `AUTOINCREMENT` keeps deleted IDs consumed forever.

### Business rules
- One order = one customer (never merged). Reference `C{id}-{oid}` computed, never stored.
- No editable order date; `created_at` only. Delivery date independently changeable until delivered/cancelled.
- Empty orders rejected; duplicate product lines auto-combined (UI + API); integer qty only.
- Price = persisted `product_prices` effective price (`COALESCE(manual_price, auto_price)`) snapshotted into `order_items.unit_price`; zero-price products blocked with warning. `shipments.sell_price` exists only in the source prototype and is never used. Old orders keep their snapshot; `is_manual` distinguishes intentional order-line overrides from stale auto prices.
- No stock reservation/deduction on create/confirm — only yellow warnings. `discount 0<=d<=subtotal`, hidden in receipt when 0. All DA, no tax.
- Delete = physical (IDs stay consumed); cancel = status. Delivered/cancelled read-only.
- Search modes: id / reference (`C17-1042` parsed) / customer id / customer name / phone; filters: exact status + `active` group, date, district (via customer), newest/oldest sort. All server-side with joins.
- Builder reuses `CustomersModule.openCreate(cb)` (customer modals moved to `document.body` so the popup works from Orders); detail links to customer card; customer card shows live order history (replaces old placeholder box).
- IPC: `orders:list/get/create/update-draft/confirm/set-status/set-delivery-date/delete/customer-list`, `inventory:product-pricing/products-search`, `pricing:cost:get/set`, `pricing:get`, `pricing:manual:set/clear`, `pricing:history`.

### Persistent pricing layer
- `product_costs(item_id PK → items CASCADE, current_cost REAL, updated_at)` — product-level basis, normally the quantity-weighted average `SUM(qty*buy_price)/SUM(qty)` from `shipments`; manually editable as a correction (shipment rows untouched; next receipt recomputes from ledger).
- `product_prices(item_id CASCADE, customer_type_id RESTRICT, auto_price INT, manual_price INT NULL, UNIQUE(item_id, customer_type_id))` — effective price `COALESCE(manual_price, auto_price)`; `auto_price = Math.round(current_cost*(1+markup/100))`; markup stays in `customer_types` only.
- `product_price_history(item_id CASCADE, customer_type_id CASCADE, price_value INT, change_type automatic|manual_override|manual_cleared, changed_at)` — one row per effective-price change only.
- Central recompute: `recomputeItemTx()` on `add/update/deleteShipment` + `importReceipt` (affected products only, same transaction); `recomputePricesForTypeTx()` on customer-type markup change; `addCustomerType` backfills cost-bearing products; `deleteCustomerType` blocked while pricing rows exist. Unified product editor (fullscreen sheet, pricing panel RIGHT + info/cost panel LEFT) hosts metadata + inline current-cost edit (auto-saves on change, enlarged entry, no save button) + dynamic customer-type pricing rows (one div row per type, inline edit/clear, no HTML table); price history removed from the editor but still recorded in `product_price_history` for future dashboard use; no standalone pricing modal. Warnings group overlapping product codes per product with affected-products vs details counts.

---

## 19. Phase C — Staff & Vehicles (implemented)

Sidebar `👷 الموظفون والمركبات` is live: one module, two tabs `[ الموظفون ] [ المركبات ]`. Self-contained `modules/staff/` (html/css/js, IIFE + `mount`, `window.StaffModule`). Reuses global classes; new scoped styles only (`.tabs`, `.tab-btn`, `.check`, availability pills).

### Schema
- `employees(id AUTOINCREMENT, name, notes, deleted_at, created_at, updated_at)` — no HR fields.
- `employee_phones(id, employee_id CASCADE, phone_number, created_at)` — unlimited, not globally unique.
- `employee_roles(employee_id CASCADE, role, PK(employee_id, role))` — values hard-coded: `collector` (جمع الطلبات) / `driver` (سائق). No permissions framework.
- `vehicles(id AUTOINCREMENT, name, plate_number '' default, notes, is_available 1 default, deleted_at, created_at, updated_at)` — no type column by explicit requirement.
- No `employee.truck_id` / `vehicle.driver_id` — driver↔vehicle pairing is per-Delivery (Phase D), never permanent.
- Soft delete + restore for both; history preserved by ID; transactions on multi-row writes.

### APIs
- Employees: `list/get/add/update/delete/restore`, `phones:add/delete`, `roles:set` (replace set), `by-role` (driver/collector lookup for future Delivery selection).
- Vehicles: `list/get/add/update/delete/restore`, `set-availability`.
- Search modes mirror prior modules (employees: id/name/phone; vehicles: id/name/plate); deleted toggle per tab; role pills show Arabic labels, never raw codes.

---

## 20. Phase D — Delivery / شحنة التوصيل (implemented)

Sidebar `🚚 شحنة التوصيل` is live; `💰 الدفعات` button removed (no payments module/tables). Self-contained `modules/deliveries/` (html/css/js, IIFE + `mount`, `window.DeliveryModule.openDetail`). Scoped CSS only (`.dlv-*`, `.stop`, `.dorder-row`); status pills reuse orders `.st-*` classes.

### Schema
- `deliveries(id AUTOINCREMENT, district_id NULL (planning hint), driver_id→employees RESTRICT, vehicle_id→vehicles RESTRICT, delivery_date NOT NULL, status planned/in_progress/completed, started_at, completed_at, hidden_at, timestamps)`.
- `delivery_stops(id AUTOINCREMENT, delivery_id CASCADE, customer_id RESTRICT, sequence>0, UNIQUE(delivery_id, customer_id))` — customer-level stops, sequence = physical order + future route data.
- `delivery_orders(id AUTOINCREMENT, delivery_id CASCADE, stop_id CASCADE, order_id RESTRICT, delivered_at NULL, removed_at NULL, UNIQUE(delivery_id, order_id))`.
- `PRAGMA foreign_keys = ON` enabled in `init()` (previously unenforced); deleting an order linked to delivery history now fails with an Arabic error instead of silently breaking history.

### Orders compatibility (§2 correction)
- `orders.delivery_date` = actual date only, NULL until delivered. Builder date input removed, detail change-date button removed, list/detail now label it التوصيل الفعلي. `createOrder` forces NULL; `updateDraftOrder` no longer touches it; direct `delivered` transition stamps `COALESCE(delivery_date, date('now'))`; cancelling auto-detaches active delivery memberships (history rows kept).

### Behaviors
- Create: date + optional district + driver (driver-role only) + available vehicle + eligible orders (confirmed/waiting, unassigned; same-customer suggestions); same-customer orders auto-group into one stop; empty/draft/cancelled/delivered/duplicate rejected transactionally.
- Lifecycle planned→in_progress (started_at + non-blocking stock preflight)→completed (completed_at); planning editable only before start (incl. ↑↓ reorder); per-order تسليم sets `delivered_at` + order delivered + actual date; post-launch removal preserves row with `removed_at`; planned deletes physically, started hides via `hidden_at`.
- Stock-aware only: preflight compares need + other committed demand vs physical SUM; no allocation/deduction (deferred engine).
- IPC: `deliveries:list/get/create/update/start/complete/hide/delete/add-order/remove-order/deliver-order/reorder-stops/eligible-orders/stock-check`.

---

## 21. Phase W — Warning system / التنبيهات (sidebar box, clickable)

`📊 اللوحة` button removed (full dashboard remake deferred; `modules/dashboard/` files kept on disk, unwired). Warnings now live in the sidebar bottom: red-framed `التنبيهات` box (`#side-warnings`) with 3 clickable severity rows — 🔴 مشاكل حرجة (`danger`), 🟠 تحتاج مراجعة (`warn`), 🔵 معلومات (`info`) — implemented in `modules/warnings/` (`window.WarningsWidget`). Clicking a row opens a paginated modal (100/page with total/shown counts); clicking a warning routes by domain: zero_stock→Inventory highlight only (NO edit popup), no_cost/no_price→unified product editor, shipment→receipt editor, customer→card, order→receipt, delivery→detail, staff→module. Backend `getWarnings(opts)` in `db/database.js` — read-only, no writes, 2000 rows/check max, 5000 total max with `truncated` flag. IPC: `warnings:get`, `window.api.getWarnings`.

### Thresholds (hardcoded, no settings screen)
- `inactiveCustomerDays=30`, `staleDraftDays=7`, `waitingDays=7`, `idleDriverDays=3` (calendar days), `stuckDeliveryDays=2`, `quietDays=7`.

### Implemented now (all 9 categories, ~40 checks)
1. Inventory: zero_stock, expired_stock, near_expiry(90d), no_cost, no_price, incomplete_shipment (buy_price 0 or missing expiry), short_for_orders (committed demand vs SUM), negative_stock (always empty until Phase-3 deduction — future-proof).
2. Pricing: customer_no_type, type_no_markup (0% = cost price, info), no_price, draft_outdated (draft auto line unit_price ≠ persisted effective price — order-line manual prices with is_manual=1 never flagged).
3. Customers: no_phone, no_district, no_gps, dup_phone, inactive_customer (no orders in X days, incl. never-ordered).
4. Orders: stale_draft, unassigned (confirmed/waiting with no active delivery), waiting_long, insufficient_stock.
5. Deliveries: overdue_planned, stuck (in_progress too long), completed_undelivered, empty, has_removed (info).
6. Employees: no_role, driver_no_activity (assigned but zero delivered), idle (any employee, calendar days), driver_multi.
7. Vehicles: unavailable_assigned, multi_assigned, no_plate.
8. Consistency: order_bad_customer/product, delivery_bad_driver/vehicle (incl. soft-deleted), deleted_active, bad_coords, dup_barcode (UNIQUE normally prevents).
9. Activity: no_orders/no_deliveries/no_inventory/no_business in X days.

### Deferred / limitations (to add later)
- Working-days calendar (currently calendar days for idle/stuck).
- Shipment-policy split for wavg after consumption (Phase 3); negative_stock check stays until then.
- Per-warning mute/acknowledge, clickable jump-to-record links, push notifications.

---

## 22. Receipt CSV import (implemented)

Locked 3-column format `product,purchase_price,quantity` (comma, dot decimals, UTF-8); root `items.csv` (306 names, price/qty empty) is the reference + alert-testing seed. Inventory header has `＋ استيراد CSV` (hidden file input, CSV parsed in renderer with quote support, `confirm()` preview, result line under toolbar). Backend `importReceipt(rows)` in `db/database.js` — transactional (all-or-nothing on unexpected error), exact-name match else create (no category/company touched), rows without usable price+qty create the product only (no-price/no-stock warnings), invalid qty (non-integer/≤0) or price recorded in per-row `skipped` report. No expiry/supplier on imported shipments (`sell_price` 0 in the source prototype). IPC: `receipts:import`. Future OCR step outputs rows in this same shape for human confirm before save.
