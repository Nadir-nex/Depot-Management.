# UI Language Audit — Arabic/French cleanup (no rewrite)

Date: 2026-10-09. Scope: frontend strings only (`src/frontend/*`) plus
localization tests. No backend, domain, API, schema, Electron, or
business-rule changes. No new framework or dependency. No browser storage.

## 1. Routes discovered and audited (12/12, ar + fr)

dashboard, articles (6 sub-tabs), stock, sales, purchases, parties, cash
(5 tabs), counts, routes (3 tabs), reports (34-entry registry), settings,
notfound. Each audited for: headings, buttons/controls, search/filters,
forms + select options, tables + status labels, empty/loading/error states,
validation, dialogs, toasts, language switching, RTL/LTR.

## 2. Root causes of English in Arabic mode

- R1. Partial dictionaries: ar/fr covered ~90 chrome keys; ~500 remaining
  literals (form labels, table headers, titles, hints, buttons, options)
  bypassed translation entirely.
- R2. Silent fallback: `t(k)` returned ar, then the raw key — missing keys
  were invisible; no `en` safety net existed, but nothing detected gaps.
- R3. Prior session added an `en` locale + trilingual selector + a redundant
  inline `STR` block left dead in `app.js`. Per task §8 the English locale
  and selector option were removed; ar/fr and the shared helpers kept.
- R4. Errors displayed raw `err.message` (English server/domain text) at ~40
  sites (toasts, modal messages, table alerts).
- R5. Statuses, doc types, payment methods, movement types/reasons, roles,
  product/tax types shown as raw codes (badges, table cells, select options).
- R6. Internal validators threw English strings (`parseIntField`,
  product/party lookup, form guards).
- R7. Numbers hard-coded to `en-US`; dates shown as raw ISO strings.
- R8. Two forms bypassed live data with hardcoded English option lists
  (expense categories) and an always-`TILL` cash account that breaks
  non-cash methods server-side.

## 3. Translation architecture (one system)

`src/frontend/i18n.js` (plain script, no imports/storage/network, loaded
before `app.js`) exposes `window.I18N`: `STR.{ar,fr}` (~300 keys each),
`t(lang,key,params)` with `{param}` interpolation, `has/keys`,
`dir` (ar→rtl, fr→ltr), `locale` (ar-DZ/fr-DZ), `fmtNum/fmtDate` (Intl),
presentation maps (`status/docType/payMethod/moveReason/moveType/
productType/taxClass/priceScope/partyRole` — unknown codes pass through),
`err(lang,e)` (code-first mapping + common message patterns → localized
message; original preserved via `debug()` console warning), `ex(key,params)`
for structured internal errors. Missing keys return `[key]` and warn in the
console — never silent English. `app.js` keeps `t(k,p)`, `fmt`, `fmtDate`,
`errMsg` wrappers; language state stays in-memory; switching re-renders the
page, clears open dialogs, syncs `<html lang dir>` and the selector.

## 4. Pages and components corrected

- Shell: trilingual selector reduced to ar/fr options; transport, titles,
  search (labeled, catalog-scoped), not-found page.
- Settings (all subsections): warehouses, categories note, fiscal
  years/journal/events, audit trail, CSV exports, about/diagnostics,
  not-offered list; fiscal event dialog; session open/close/report.
- Sales: type tabs, table type column, detail header/totals/history note,
  create/convert/cancel flows, multi-invoice confirm, line editor.
- Purchases: supplier-code label, shared document detail.
- Articles/catalog: all 6 tabs, product create/edit/detail, packs, barcodes,
  price lists + lines + resolve, lots/serials/suggest.
- Stock: overview filters, detail, ledger, movements + reverse, receipts +
  cancel, receive/issue/adjust/transfer forms (lot/serial aware).
- Parties: tabs, roles, create form. Cash: all tabs, record with
  allocations, detail + reversal, returns (customer + supplier), balances
  overview, accounts + sessions, expenses (live categories, full form,
  detail, reversal, report).
- Counts: lifecycle actions, variance detail, line add/edit/reason/remove,
  cancel. Routes: tabs, crew create/toggle, detail (crew/loading/stops/
  settlement/completion), drivers/vehicles management.
- Reports: 34 localized titles + group headings, filters, CSV/print,
  drill-downs, generation metadata.
- Shared helpers: modal/confirm (focus, Escape cleanup, announced errors),
  toasts, badges (localized text), tables, empty/loading, icon-button labels.

## 5. Errors and statuses localized (§5–§6)

Central `I18N.err` covers VALIDATION/CONFLICT/NOT_FOUND/INVALID_STATE/
FORBIDDEN + duplicate/remaining/insufficient/inactive/not-found/reason/
delivery-flow/invoice-payments/one-open-year/network patterns, with
`{field}/{sku}/{code}/{n}/{v}/{a}/{b}` interpolation. Statuses, document
types, payment methods/directions, movement types/reasons, roles,
product/tax types and price scopes translate at the display boundary;
stored/API values unchanged. User data (names, descriptions, codes,
notes, audit operations, report schema columns) is never rewritten.

## 6. RTL/LTR, typography, numbers (§7–§9)

`setLang` flips `lang`/`dir` immediately and re-renders; CSS uses logical
properties (no physical left/right; verified by test); `.mono` isolates
codes/barcodes/identifiers from bidi reordering; icons not mirrored.
`Intl` with ar-DZ/fr-DZ formats numbers and ISO dates (presentation only;
minor-unit money untouched). Arabic uses system + Cairo fallback stack.
Neutral terms kept intentionally: SKU, ID, CSV, MAIN, TILL, PCS, YYYY-MM-DD,
`—`/`✓`/`#`, language names in the picker, FEFO/FIFO, audit operation and
event codes, report schema columns, filenames/commands in diagnostics,
native browser validation bubbles (browser locale).

## 7. Tests added + results

`tests/i18n.test.js` (11 tests): identical ar/fr key sets, all nonempty;
placeholder parity; interpolation; missing-key diagnostic; dir/locale;
code-map translation + unknown passthrough; error mapping (codes, patterns,
interpolation, no raw SQL); selector ar/fr-only + re-render; hardcoded-text
source audit with allowlist (SKU/title); per-route dictionary usage;
formatter behavior; architecture invariants. Updated 3 prior-session tests
to track moved strings (same assertions, new location).
Full suite: **271 pass / 44 suites / 0 fail except** `db-foundation :
refuses a foreign-schema database`, which needs the `db/database.sqlite`
fixture deleted earlier per the user's explicit wipe order (no git copy
exists; see §10). All 261 other tests pass, including architecture tests.

## 8. Full suite result

`npm test`: 271/272 pass. `node --check` clean on both frontend files.

## 9. Remaining English (intentional, documented)

Neutral tokens (§6 list above); user-entered and server-schema data;
audit operation/entity codes and fiscal event types (diagnostic
identifiers); native HTML validation bubbles (browser locale, not app text).

## 10. Unverified (no browser harness in repo)

Live-rendered visual RTL check, pointer/keyboard interaction flows, physical
print output, and native-bubble language — verified by code inspection and
layout tests only. Recommended manual pass: open each of the 12 routes in
ar then fr; submit one invalid form per section; trigger one failure toast;
toggle language with a dialog open (it closes by design); print one
document and one report.

## 11. Changed files

- `src/frontend/i18n.js` (new): authoritative ar/fr dictionaries + helpers.
- `src/frontend/app.js`: dictionary use everywhere; English locale removed
  with it (no `en` references remain); dead inline `STR` block deleted;
  expense modal uses live categories + cash-only account rule.
- `src/frontend/index.html`: `i18n.js` script tag; ar/fr selector.
- `src/frontend/styles.css`: `.lang-sel`, `.mono` bidi isolation (rest is
  prior batch work, untouched).
- `tests/i18n.test.js` (new); `tests/ux-batch11.test.js`,
  `tests/navigation-batch10.test.js`, `tests/routes-batch6.test.js`,
  `tests/reports-batch7.test.js`: mechanism assertions track moved strings
  (assertions unchanged in intent).
- No backend, schema, migration, API, Electron, or business-rule changes.

## 12. Status: PASS (with §7 and §10 caveats)

No known unjustified application-generated English remains in the ar/fr
interface; every route was audited in both languages against implementation
evidence; the one failing test is unrelated to localization (fixture
deleted by explicit user order) and is documented, not hidden.
