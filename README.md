# Depot Management — clean rebuild (v0.2)

Clean foundation, rebuilt per the Project Reset and Architecture Directive.
Prototype source was removed; its history is preserved in git tag `pre-reset-prototype`.
Legacy prototype database `db/database.sqlite` is untouched (migration source only).

## Architecture (one codebase, two delivery modes)

- `src/frontend/` — browser-compatible UI. No Electron/Node imports. Talks only via
  `window.depotApi` (Electron preload) or future HTTP `fetch('/api')`. Never touches SQL.
- `src/application/` — commands/use-cases (`createProduct`, `receiveStock`, `cancelReceipt`)
  and queries. Transactional. No Electron, no filesystem paths, no printer APIs,
  no assumption about where the database lives.
- `src/domain/` — pure validation + business rules (no DB, no Electron, no fs).
- `src/data/` — repository layer. The ONLY place with raw SQL. Takes a db handle,
  so SQLite can later be swapped for PostgreSQL without touching business logic.
- `src/db/` — connection (`node:sqlite`), numbered migration runner, `migrations/*.sql`.
  Fresh DB is built by running migrations from empty state. Portable SQL, FK enforced.
- `src/infrastructure/electron/` — thin desktop adapters (main + preload). Only place
  that imports `electron`.
- `src/config.js` — resolves the DB path (`data/app.sqlite`, override `DEPOT_DB_PATH`).

Desktop now: Electron shell → frontend → local application/API → SQLite (`data/app.sqlite`).
Future web: browser → frontend → hosted Node application/API → server SQL (same
`src/application/` + `src/domain/` + `src/frontend/`, new HTTP transport + PG adapter).

## Rules enforced

- SQL is authoritative. No JSON business database. `details` in `audit_log` is an
  audit summary, never business state.
- Money is integer minor units (e.g. centimes). No float arithmetic for money.
- Timestamps are TEXT ISO-8601 UTC (`2026-10-08T12:00:00.000Z`).
- Multi-record operations run in a DB transaction (`receiveStock`, `cancelReceipt`).
  A failed operation leaves no partial state.
- Stock is derived: `stock = SUM(stock_movements.qty)`. No editable quantity on products.
- Receipts have explicit states (`posted` → `cancelled`) via compensating reversal
  movements. Posted history is never edited or deleted.
- Business keys are unique: `products.sku`, `products.barcode`, `purchase_receipts.receipt_no`.

## Quick start

```bash
npm install
npm run migrate   # create/migrate data/app.sqlite from empty state
npm run seed      # bootstrap MAIN warehouse + demo catalog (dev only)
npm start         # Electron desktop (or npm run dev for DevTools)
npm test          # automated suite (migrations, products, stock, integrity)
npm run db:integrity  # PRAGMA integrity_check + foreign_key_check + stock summary
```

Recover the prototype for reference without touching the rebuild:

```bash
git show pre-reset-prototype:main.js | head
git show pre-reset-prototype:db/database.js | head
# legacy data (read-only source):
# db/database.sqlite  (305 catalog rows at reset time, gitignored, never migrated in place)
```

## Vertical slice (v0.2)

`createProduct` → `receiveStock` (purchase receipt + lines + movements, one transaction)
→ `getStock` (derived) → `cancelReceipt` (reversal). Proves the full path
frontend → application/API → domain → repositories → SQLite + migrations + tests.
Sales orders, invoices, payments, deliveries, and full migration of legacy data arrive
in later phases per the phased implementation plan.
