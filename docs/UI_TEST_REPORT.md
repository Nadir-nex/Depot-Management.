# UI Test Report — frontend rewrite (Batch 12, final)

Date: 2026-10-09. Node v26.10.0, npm 12.2.0. Commands from `package.json`
(plus `node --check`; no lint/type scripts exist in this project — not invented).

## Exact results

| command | result |
|---|---|
| `npm test` (`node --test tests/`) | **261 pass / 43 suites / 0 fail** (0 cancelled/skipped/todo) |
| `node --check src/frontend/app.js` | clean |
| `node --check tests/ux-batch11.test.js` (sample) | clean |
| `npm run db:integrity` (read-only: PRAGMA + FK + stock summary) | `integrity: ok`, `fk violations: 0` (prod `data/app.sqlite` untouched; 308 products, 0 receipts) |
| renderer rule (`require(`, `node:`, SQL, storage, fs/Electron in `app.js`) | holds |
| `api.*` (126 refs) vs preload facade | all resolve, none missing |
| vendor/secrets/mock-data sweep of `src/` | no bundle, no Supabase/private APIs, no tokens/HAR, no hardcoded business rows |

## Suite composition (43 suites, 261 tests)

Backend suites (pre-existing, untouched): acceptance, architecture,
auth, catalog, concurrency, counts, db-foundation, documents, expenses,
fiscal, idempotency, import, integrity, loading, lots, migrations, money,
parties, payments, performance, pricing, printing, products, purchases,
returns, routes, sales, security, settlements, stock-engine, stock,
vocabulary, warehouses (33 suites / 206 tests baseline).

Frontend-contract suites added per batch (9 suites, 55 tests):
`catalog-ui-batch2` (6), `documents-ui-batch3` (4),
`returns-payments-batch4` (5), `inventory-batch5` (5), `routes-batch6` (5),
`reports-batch7` (5), `cash-fiscal-batch8` (5), `settings-batch9` (5),
`navigation-batch10` (6), `ux-batch11` (9). Each asserts real API payloads
via isolated temp DBs (`tests/helpers.js`), frontend wiring strings, failure
states, and the renderer rule — no browser harness (none exists; none
installed without authorization).

## What was verified per screen

All 12 routes render from live APIs with loading → data/empty → error states;
mutations refresh authoritative data and surface server errors; no fake saves;
double-submit guards on modals + row buttons; confirmations on destructive
actions; bilingual ar/fr with RTL/LTR switch; capped tables (60–500 rows);
CSV exports equal displayed rows; print paths read-only.

## Known non-passing / hidden: none

Zero failures, zero skips. In-scope partial/backend-gap items are NOT counted
as complete — see `UI_COVERAGE_MATRIX.md` (`partial`: parties edit UI,
reports data) and `UI_GAPS.md` (report wiring + 19 SQL statements, missing
CRUD/sessions/history/version/GPS/print-adapter).

## Manual smoke tests still requiring the user to run the app

1. `npm start` → all 11 sections load with data/empty (not blank).
2. Unknown hash (`#​/nope`) → not-found page with valid links.
3. Articles: create → edit → deactivate → delete-blocked product.
4. Sales: order → confirm → post → deliver → invoice → print.
5. Cash: record with allocation → reverse with reason; return create → post.
6. Stock: receive → issue/adjust/transfer → ledger + receipt cancel.
7. Counts: create → lines → submit → reason → approve → post.
8. Routes: crew → stops → load → dispatch → deliver/fail → settle → complete.
9. Reports: run one per group; failing ones show backend errors, none show fake rows.
10. Settings: warehouse CRUD guards, fiscal open/close, audit filter, CSV export.
11. Lang toggle ar/fr on 3 pages; 360px width pass; keyboard-only dialog run.
12. Physical printout of one document + one report.
