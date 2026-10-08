# Phase 01 — Baseline: freeze and understand (post-reset)

Date: 2026-10-08. Plan ref: `Dolisoft_PRO_12_3_Phased_Implementation_Plan.md` §5.
P01 adapted: the reset directive already replaced the prototype, so the
"existing application" baselined here is the **v0.2 clean foundation** plus the
**preserved source artifacts**. No Dolisoft features implemented in this phase.

## 1. Runtime
- Node v26.8.2, npm 12.1.0. Engines floor: `node >= 22.5` (needs `node:sqlite`).
- Electron v44.7.0 (devDependency). Entry: `src/infrastructure/electron/main.js`.
- Zero runtime dependencies (stdlib only: `node:sqlite`, `node:test`, `fs`, `path`).

## 2. Data-access layer
- Driver isolated in `src/db/index.js` (`openDatabase`, `withTransaction`, `integrityCheck`).
- Raw SQL lives ONLY in `src/data/*Repository.js` + `src/db/migrations/*.sql`.
- Domain (`src/domain/`) and application (`src/application/`) take a db handle;
  no Electron, no filesystem paths, no printer APIs, no DB-location assumptions.

## 3. Databases (P01 snapshot: source archive + authoritative DB, strictly separated)
| DB | Path | State at freeze | Role |
|---|---|---|---|
| New | `data/app.sqlite` (gitignored) | 8 tables, 3 demo products, 1 warehouse `MAIN`, 0 receipts | authoritative for new build |
| Source | `db/database.sqlite` (gitignored) | 21 tables, **305 items**, 0 shipments, 1 customer | archived original data: read-only one-shot import input, NEVER migrated in place |

New schema: `schema_migrations`, `warehouses`, `products`, `purchase_receipts`,
`purchase_receipt_lines`, `stock_movements`, `audit_log` — defined by
`src/db/migrations/001_core.sql` + `002_stock.sql` (migrations ARE the schema dump).
Source prototype schema: `categories, companies, items, shipments, districts,
customer_types, customers, customer_phones, orders, order_items, product_costs,
product_prices, product_price_history, employees, employee_phones, employee_roles,
vehicles, deliveries, delivery_orders, delivery_stops` — recoverable via tag
`pre-reset-prototype` (`git show pre-reset-prototype:db/database.js`).

## 4. Seed data
- New DB: `scripts/seed.js` inserts `MAIN` warehouse + 3 `DEMO-*` products. Idempotent by SKU. Dev only.
- Source catalog (305 rows) NOT imported at P01 — imported by Phase 22 via
  `node scripts/import-source.js --apply` (see §13).

## 5. IPC boundary (13 channels, verified 1:1 main ↔ preload)
`products:create/list/get/set-active/delete`, `stock:receive`, `stock:cancel-receipt`,
`stock:list`, `stock:movements`, `receipts:list/get`, `audit:recent`, `warehouse:main`.
Envelope: `{ok:true,data}` / `{ok:false,code,message}` with codes
`VALIDATION|NOT_FOUND|CONFLICT|INVALID_STATE|INTERNAL` — same contract a future
HTTP API must speak. Renderer (`src/frontend/app.js`) has no Electron/SQL imports.

## 6. Module boundaries (enforced by construction)
`frontend → application/api → domain + data/repositories → db`. Business rules in
`src/domain/` + `src/application/`; UI holds no business state; SQL authoritative.

## 7. Migration mechanism
Numbered `src/db/migrations/*.sql` + runner `src/db/migrate.js`: per-file atomic
apply, `schema_migrations` ledger, idempotent re-run, FK `PRAGMA` checks, backup
before UPGRADES only (fresh builds have nothing to protect). CLI: `npm run migrate`.

## 8. Test framework
Built-in `node:test` + `assert/strict`, no test deps. 18 tests across
`tests/migrations|products|stock|integrity.test.js`; temp file-backed DBs in
`tests/helpers.js`. Run: `npm test`.

## 9. Packaging / build
No packaging script post-reset (old `build-depot-management-windows-exe.sh` removed
with prototype; preserved in tag). Desktop runs via `npm start` / `npm run dev`.
Windows installer to be re-added when a release is cut (Phase 28).

## 10. Backup / export behavior
- Automatic file backup before migration UPGRADES (`<db>.pre-migrate-<ts>.bak`).
- Manual backup = file copy of `data/app.sqlite` (SQLite single-file); restore =
  copy back + `npm run db:integrity`. Proven in §12 below.
- No user-facing export yet (deferred to Phase 22/23).

## 11. "Do not" compliance
Source DB untouched (305 items before and after). No renames, no UI rewrite beyond
the reset mandate, no schema replacement outside migrations, no Dolisoft features.

## 12. Exit-gate evidence (2026-10-08)
- `npm test`: 18/18 pass.
- `npm run db:integrity`: `integrity: ok`, 0 FK violations.
- Backup/restore: `cp data/app.sqlite /tmp/p01-restore-check.sqlite` →
  integrity ok + product/stock queries identical (see P01 gate log in commit).
- Schema dump reproducible: fresh `rm data/app.sqlite && npm run migrate` rebuilds
  latest schema from `src/db/migrations/` (proven twice during foundation build).
- Launch: Electron binary present (v44.7.0); full GUI launch requires a display and
  is verified by running `npm start` on a desktop machine (headless CI cannot open
  a window; IPC/preload/frontend static cross-check passed instead).

## 13. Phase 22 update (2026-10-08) — migration complete, one authoritative schema

- One-shot import: `npm run import:source` (`scripts/import-source.js`) reads the
  source DB read-only + fingerprinted, stages raw rows, writes `source_links`,
  reconciles counts and prints the migration report. `--apply` to write,
  dry-run by default; re-runs are idempotent (linked/adopt/create).
- Export: `npm run export:data` writes a canonical JSON snapshot (reports/backup).
- ONE SCHEMA: `src/db/migrate.js` refuses any database containing tables the
  migrations never produced (code `FOREIGN_SCHEMA`) before any write — a second
  database can never carry a second schema. Source data goes through
  the staged import, never through in-place migration.
- Single layer: import/export tooling lives under scripts/ + one infrastructure
  reader, is never loaded by the runtime (`api.js` does not import it), and the
  renderer/IPC expose no import paths. Terminology is "source" (one-shot input).
