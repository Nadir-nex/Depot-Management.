# Depot Management UI Rewrite — Complete Remaining Batch Plan

**Status:** Planning document. **Do not execute any batch merely because this file was attached.**

**Starting point:** UI Batch 1 is already implemented in `src/frontend/index.html`, `src/frontend/styles.css`, and `src/frontend/app.js`. The user reports that the existing backend/business logic is complete after 28 implementation phases, the SQLite database is authoritative, and the current test baseline is **206 passing tests across 33 suites**. Verify the current checkout before relying on these counts.

**Goal:** Complete and polish the frontend in bounded patches, preserve the business logic and data layer, and connect all UI controls to the existing real APIs. This is not a backend rewrite and not a pixel-perfect cloning project.

---

# PART A — Execution contract for OpenCode

## 1. Mandatory initial response: plan only, then wait

When first given this file, do **not** edit application files, generate a large patch, or start Batch 2.

First:

1. Read `AGENTS.md`, the Dinatek UI blueprint, `docs/UI_INVENTORY.md`, this plan, the current frontend files, relevant API definitions, architecture tests, and the current Git status.
2. Verify that Batch 1 is present and the test baseline still holds. Run read-only inspection and tests only; do not alter files.
3. Produce a short execution map showing the exact frontend files/API methods/tests likely to be touched in each batch, plus any mismatches between this plan and the actual checkout.
4. Identify any existing uncommitted changes. Do not discard them, reset Git, or overwrite unrelated work.
5. **Stop and wait for the user to explicitly say `START BATCH 2`.**

The user intends to review/authorize batches one at a time. This file is the full roadmap, not blanket permission to execute every batch autonomously.

## 2. One batch per explicit command

After the user says `START BATCH N`, execute **only Batch N**. Do not start subsequent batches in the same session or response.

At the beginning of each batch:

- Inspect current code and tests; do not assume prior context or memory is correct.
- Check the actual API surface before designing the UI.
- Re-read the batch acceptance criteria.
- Avoid changing backend, domain, database, migrations, persistence architecture, or business rules.

At the end of each batch:

1. Run the relevant tests, then the full `npm test` suite.
2. Run `node --check` on changed JavaScript and the project's available lint/type checks.
3. Run architecture/invariant tests, including the rule that browser-renderer code contains no Node/Electron/SQL/storage access.
4. Report exact files changed, APIs used, features completed, commands/tests and their results, known gaps, and anything blocked by missing APIs.
5. If a test fails, fix it within the current batch if the failure is caused by that batch. If it cannot be fixed safely, stop and report the blocker. Never claim green tests when they failed or were not run.
6. Stop. Do not proceed until the user explicitly authorizes the next batch.

## 3. Non-negotiable architecture rules

- **No backend rewrite.** Do not change `src/domain`, `src/data`, database schema/migrations, `src/application/api.js`, Electron main/preload/IPC code, or business rules for the purpose of UI work.
- The SQLite database remains authoritative. No fake data persistence in renderer state, `localStorage`, `sessionStorage`, JSON files, or a second UI-side database.
- Use the existing `window.depotApi` facade and existing application APIs. Use its existing HTTP fallback only where already designed.
- Do not add raw SQL, `node:` imports, Node `require`, Electron APIs, direct filesystem use, or browser storage to renderer files.
- Do not fake saves or mutate the UI to imply success before the API confirms success. Loading, success, empty, validation, and failure states must be honest.
- Do not make new business rules up to make a form convenient. Display server/domain validation failures clearly.
- Do not import the downloaded vendor bundle into production. The Dinatek bundle/CSS are reference artifacts only. Reimplement with maintainable project-owned code; do not copy the vendor source/bundle wholesale or call its private Supabase APIs.
- Preserve money-as-minor-units behavior and existing stock/document invariants. Never calculate authoritative stock in the frontend.
- Respect the project's browser-compatible frontend architecture and Electron-as-shell design.
- Keep FR/French LTR and Arabic RTL working. Do not use layout hacks that break one direction.
- Never remove a feature or old working workflow just because its screen has not yet been ported.
- Do not expand scope into Dinatek modules such as production, HR, atelier, services, or marketplace unless those capabilities exist in this application and the user has authorized them.

## 4. UI integration standards

Use the current shared shell and existing helpers where practical: hash router, shared tables, status badges, modal/dialog root, toast root, loading/empty/error helpers, `unwrap({ok,data})`, and language direction handling.

Every interactive control must have a defined outcome. Avoid decorative buttons with no action. If an action is unsupported by the API, disable/hide it appropriately and explain why; do not create a fake implementation.

All major pages should support:

- Loading and request failure states.
- Empty states with a useful next action where applicable.
- Form validation and server error display.
- Search/filter controls only when they truly filter the displayed data.
- Clear primary action and safe destructive-action confirmation.
- Keyboard operation, visible focus, accessible names, dialog focus behavior, and escape/close behavior consistent with the existing project.
- Useful layouts at desktop widths and narrow/mobile widths.
- Correct LTR/RTL layout and readable numbers/dates/money.

## 5. Shared test gate after every batch

At minimum, run:

```sh
npm test
```

Also run the exact project commands that exist for JavaScript syntax, lint, and architecture checks. Do not invent package scripts: inspect `package.json` first.

For each new/changed screen, add or update tests using the project's established test framework. Prefer meaningful tests for API-to-UI behavior over brittle exact markup snapshots. Test success, empty data, API failure, form validation, and duplicate submission where relevant.

If a browser/Electron UI smoke test harness already exists, use it. If none exists, do not install a large new test stack without authorization. Add a lightweight test using the current conventions and report which visual checks still need a human browser pass.

---

# PART B — Current-state interpretation and scope

Batch 1 reportedly established:

- App shell: dark collapsible sidebar, top bar/global search, FR/Arabic switch, main view, dialog/toast roots, skip link, hash-based routing.
- Shared styling and primitives: design tokens, cards/KPI grid, tabs, tables, badges, dialogs, responsive breakpoints, printing rules, RTL/LTR, reduced-motion handling.
- Routes: `dashboard`, `articles`, `stock`, `sales`, `purchases`, `parties`, `cash`, `counts`, `routes`, `reports`, and `settings`.
- Existing screens call real APIs, not fake save handlers.
- Existing backend and architecture tests were preserved; reported baseline is 206 passing tests.
- Known missing/incomplete UI includes pricing/lots/serials/units/packs/barcodes, document line editing, returns posting, payment allocations/reversals, settlement/reservation details, expanded reports, and fiscal UI.

Verify these facts from the actual checkout before continuing. Treat this section as a user-provided implementation summary, not proof that the files are currently in this state.

## UI coverage: what percentage is realistic?

No precise percentage is defensible without a route-by-route comparison and actual browser screenshots. Use the following as planning estimates, not measurements:

- **Shared UI foundation/patterns:** approximately **55–70% of the reusable shell and common visual patterns** may already exist after Batch 1. This does not mean the app is 55–70% visually identical to Dinatek.
- **Core day-to-day distributor UI:** approximately **45–60% of the required screen/workflow surface** appears represented by the initial route set, because product, stock, sales, purchasing, parties, cash, counts, routes, reports, and settings exist, but multiple detailed workflows are still missing or shallow. This estimate must be revised after inventorying the actual code.
- **Full Dinatek reference UI breadth:** currently likely only around **7–15% of the raw route-level surface** is represented. The reference bundle had 163 unique route-path strings while Batch 1 lists 11 routes; the crude ratio 11/163 is about 6.7%, but it is **not** a true coverage score because route strings can represent child routes, variants, or unrelated modules. Dinatek also includes modules outside this distributor app's intended scope.
- **Exact visual fidelity:** unknown and not yet measured. The bundle analysis reveals patterns/tokens, but without screenshots of each reference page and a local screenshot comparison, no credible pixel-fidelity percentage can be given.

These three scopes must not be conflated. The objective is a complete, coherent Depot Management frontend that borrows useful design patterns—not a blind reproduction of all 163 Dinatek paths. The final batch must create a route/API/UI coverage matrix and explicitly list out-of-scope reference-only screens.

---

# PART C — Remaining implementation batches

## Batch 2 — Product catalog, category, and pricing UI

### Objective
Make the catalog usable for real distributor work: product details, product classification, pricing options, barcodes, units/packs, and any lot/serial data already supported by the current API.

### Inspect first
- Current `articles`/catalog screen and the existing create/activate form.
- Available methods in `window.depotApi` for products, categories, pricing, units, packages, barcodes, lots, serials, and stock lookups.
- Existing validation and test fixtures.
- `docs/UI_INVENTORY.md` and the reference bundle findings for product/catalog screen patterns.

### Implement
1. Improve the product list: usable search, genuinely working filters/tabs, category/status filters only if supported, clear columns, and useful row actions.
2. Create/edit product forms using the API's exact accepted input shape. Include required fields, numeric validation, and clear server-side errors.
3. Product detail view/panel if it can be supported by existing APIs without changing backend code.
4. Category selection and category management only if the APIs support the required operations.
5. Price-level/wholesale-retail pricing UI using existing pricing APIs. Keep prices consistent with the system's money representation; avoid floating-point monetary arithmetic in business calculations.
6. Units and package/box quantities and pricing only where the API has complete read/write support.
7. Barcode list/edit/assignment UI only where supported. Never claim that hardware scanning is live unless the current application has a working scan integration; manual barcode entry is acceptable.
8. Lot/serial tracking details only where the data/API supports listing and editing. Do not invent lot lifecycle rules.
9. Clear distinctions between unavailable capability and empty data.

### Tests
- List renders real API records and handles empty/error states.
- Create/edit/activate paths submit the correct payload and display API outcomes.
- Invalid values are rejected before submission where deterministic and are also handled when rejected by the API.
- Pricing/units/packs/barcodes/lots/serials never silently save only in renderer memory.
- No unsupported methods/actions appear as working controls.
- Architecture tests still pass.

### Acceptance gate
Catalog tasks in scope are reachable, functional against current APIs, and tested. Report each unsupported catalog capability explicitly. Stop after Batch 2.

---

## Batch 3 — Commercial documents and line-item editor

### Objective
Make sales/purchase documents usable beyond a list-and-create flow. A user must be able to inspect document details, understand status, review lines/totals, and execute only the transitions supported by the existing business API.

### Inspect first
- Existing sales and purchases pages.
- Existing document APIs and supported document statuses/transitions.
- How line items are represented and whether line update/remove methods exist.
- Existing conversion, posting, delivery, invoice, cancellation, and print APIs.

### Implement
1. A reusable document detail view/modal/page, shared by sales and purchases where semantics match.
2. Document header details: reference, party, date, status, totals, relevant notes/metadata, and payment/delivery indicators when returned by the API.
3. Line-item editor: product lookup, quantity, supported unit/price/discount/tax fields, add/remove/edit line operations only where API methods support them.
4. Totals must be displayed from trusted API/domain results whenever available. Do not recreate authoritative accounting or tax calculations in frontend code.
5. Clear document status timeline/history only if the API returns that history. Do not fabricate an event log.
6. Explicit available actions per status: draft, confirm, deliver, invoice, cancel, or other real transitions. Do not show impossible transitions.
7. Prevent double submission at the UI level for user experience, while still relying on backend integrity.
8. Add print-friendly document view or use the project's existing print adapter/API; do not directly invoke Electron from browser renderer code.
9. Present validation failures (e.g. no lines, invalid quantities, inactive product, insufficient stock) using the actual API error contract.

### Tests
- Document detail loads the correct record and reports missing/error states.
- Line add/edit/remove actions call the correct API and refresh authoritative data.
- Status actions appear only when allowed and refresh after success.
- Totals are not incorrectly recomputed or rounded by frontend code.
- Duplicate clicks do not submit multiple requests from one active form.
- Print view does not alter business state.

### Acceptance gate
Sales and purchase document flows are understandable and operable with real data. Unsupported editing/conversion capabilities are clearly recorded rather than simulated. Stop after Batch 3.

---

## Batch 4 — Returns, payment allocations, receivables/payables, and reversals

### Objective
Complete the UI for returns and payment flows while preserving data-integrity guarantees. This is a high-risk area; no speculative accounting behavior.

### Inspect first
- Existing returns screen/API.
- Payment registration, allocation, reversal, settlement, and customer/supplier balance APIs.
- Current document/payment relationship model and the existing tests for reversals/allocations.
- Whether APIs expose partial-payment status, outstanding balances, allocation lists, and reversal reasons.

### Implement
1. Returns list and detail view with type/party/date/status/related document and lines where provided.
2. Return creation and posting only with the existing API's documented payload and transition methods.
3. Clearly separate draft returns from posted/completed returns.
4. Payment detail showing amount, date, method, party, reference, and allocations when exposed by the API.
5. Allocation UI for applying a payment to one or more eligible documents only if the API supports it.
6. Reversal UI requiring clear confirmation and a reason where the API requires one. Show the original payment and resulting state after success.
7. Customer/supplier balances and outstanding documents using authoritative API results.
8. Reservation/settlement detail only for existing API features; don't invent “reservation” functionality if the word referred to something else in the inventory.
9. Guard against double submit and stale balance presentation; refresh after mutations.
10. Use precise language distinguishing payment recording, allocation, settlement, and reversal.

### Tests
- Return creation/posting calls actual methods and handles rejected operations.
- Payment allocation display matches API data.
- Reversal confirmation and server result are handled correctly.
- Failure to allocate/reverse does not show success or optimistic balance changes.
- Partial payments and multiple allocations render correctly when fixtures/API support them.
- Existing backend/data-integrity tests remain unchanged and green.

### Acceptance gate
No fake financial states, no frontend-only account balance mutations, and no false success notifications. Stop after Batch 4.

---

## Batch 5 — Inventory operations, stock counts, movements, and warehouse/transfer detail

### Objective
Make inventory explainable and auditable through the UI. Stock must always come from the existing source of truth, which is reported to be the sum of stock movements.

### Inspect first
- Stock screen, stock count flow, warehouse/transfer UI, and existing stock movement APIs.
- How the API represents receiving, issuing, adjusting, transferring, counting, and movement reversal.
- Existing safeguards and stock-related tests.

### Implement
1. Stock overview with search, category/warehouse filters where supported, and low-stock indication based on the API's data/rules.
2. Product stock detail showing warehouse/location and movement history when API methods exist.
3. Receiving/issuing/adjustment forms with required reason/reference fields as dictated by the current API.
4. Transfer workflow with source and destination warehouse, item quantities, status, and validation from the existing API.
5. Stock-count list/detail, count entry, variance display, and finalization/posting using existing APIs only.
6. Separate counted quantity, expected quantity, and variance; do not silently overwrite the database quantity from the browser.
7. Lots/serials within stock detail only if Batch 2 identifies complete API support and existing methods are available.
8. Safe destructive-action confirmations and clear irreversible/posting labels.
9. Inventory filters and tables should handle large lists without blocking the UI; use server/API pagination if present rather than inventing incompatible pagination.

### Tests
- Stock quantities shown are API-derived and not calculated from cached UI state.
- Receiving/issuing/adjusting/transferring submits exact supported fields.
- Failed movement/finalization does not show changed stock.
- Count variance and finalization outcomes render correctly.
- Empty warehouse/category lists and API errors are handled.
- Existing stock movement/reversal tests remain green.

### Acceptance gate
Users can inspect stock and execute supported inventory tasks without ambiguous quantities or fake movements. Stop after Batch 5.

---

## Batch 6 — Distributor operations: routes, stops, drivers, vehicles, delivery progress

### Objective
Turn the current `routes` page into a useful distribution workspace without pretending unavailable GPS/driver capabilities exist.

### Inspect first
- `listRoutes`, route/stop, driver, vehicle, delivery, and dispatch/loading APIs.
- Current schema/domain methods for route stops, delivery document association, loading, delivery status, collections, and proof of delivery.
- Whether any real GPS tracking or map data integration exists.

### Implement
1. Route list with real route status, scheduled date, assigned driver/vehicle, and completion metrics if returned by APIs.
2. Route detail with ordered stops, customer data, associated orders/delivery notes, status, and notes supported by APIs.
3. Stop status actions using actual allowed transitions; prevent out-of-order operations only when the backend/domain rules require it.
4. Driver and vehicle selectors, profiles, or subviews only if corresponding data and APIs exist. Do not add fake records.
5. Delivery progress and loading/dispatch views only for operations already supported by the backend.
6. Collection-on-delivery/payment capture UI only if the existing API explicitly supports it; otherwise link to the normal payment flow.
7. GPS/map link: if real coordinates exist, a simple “open in map” action may be used. Do not display fake live vehicle positions, fake tracking states, or a map of invented coordinates.
8. Route-completion panel driven by real stops/status responses.
9. Empty states for routes with no stops, missing driver/vehicle assignments, and completed routes.

### Tests
- Route/stop data and statuses come from actual APIs.
- Supported status updates refresh the view and display errors correctly.
- No live-GPS claim without a real integration.
- Missing optional driver/vehicle data does not crash the page.
- Completion metrics agree with the API's definitions.

### Acceptance gate
The UI accurately reflects current distribution capabilities and clearly names absent GPS/driver/mobile features as gaps. Stop after Batch 6.

---

## Batch 7 — Reports: complete inventory, filters, drill-downs, exports

### Objective
Replace the current partial reporting experience with a truthful registry of all reports that the existing APIs can actually produce.

### Inspect first
- Current `reports` page and `UI_INVENTORY.md`.
- All report/list/statistics methods exposed by `window.depotApi` and the application API.
- The six reported wired reports: `current-stock`, `low-stock`, `sales-by-date`, `purchases-by-supplier`, `route-completion`, `daily-cash-position`.
- Existing export/download/print helpers.

### Implement
1. Build an explicit report registry from supported methods, grouped by Stock, Sales, Purchases, Customers/Suppliers, Cash/Payments, Routes/Deliveries, and other categories only where supported.
2. Make every visible report item either truly wired or clearly marked unavailable/under development with no fake output.
3. Add date range, party, product, warehouse, status, or other filters only when the report API accepts them or can safely filter complete returned data.
4. Display report title, active filters, generation state, totals, empty states, and failure messages.
5. Make table columns and summary figures consistent with the returned schema; do not invent metrics.
6. Use existing export/print APIs if available. If CSV generation is built client-side from returned data, ensure it exports the actual displayed result without leaking unrelated fields.
7. Add drill-down links to relevant records only when a stable ID and matching detail route/API exist.
8. Mark the last-refresh/generation time only if it can be accurately determined.

### Tests
- Every wired report calls a real method and handles empty/error responses.
- Filters are passed or applied correctly and visibly.
- Exported values match displayed data; no synthetic rows.
- Every registry entry is classified as wired or unavailable; no silent placeholders presented as completed reports.
- Existing report-related tests remain green.

### Acceptance gate
A user can identify which reports are ready and rely on the displayed data. Missing APIs become a written backend gap list, not an excuse to modify backend code in this batch. Stop after Batch 7.

---

## Batch 8 — Debts/charges, cash detail, and fiscal-facing UI

### Objective
Make operational financial screens more complete while keeping legal/fiscal behavior strictly aligned with existing business rules and APIs.

### Inspect first
- Existing cash, parties, charges/expenses, debts, document total/tax fields, and settings screens.
- APIs for cash accounts, cash movements, expense creation, receivables/payables, tax settings, stamp duty, fiscal identifiers, numbering, and statements.
- Current backend validation for fiscal values.

### Implement
1. Cash-account detail and cash movement/history tables, including cash position only as returned by the API.
2. Expense/charge list, creation, category/party association, edit/cancel actions only if supported.
3. Debts/receivables/payables pages based on real outstanding documents and payment data, including party-level drill-down when available.
4. Payment methods and collection summaries consistent with actual supported methods.
5. Fiscal configuration UI only where configuration APIs and backend validation exist: TVA/tax rates, stamp duty, fiscal IDs, document numbering, or similar settings.
6. Do not decide tax law, eligibility, rounding, invoice legality, or fiscal formulas in the UI. Display values calculated/validated by domain/API.
7. State clearly whether a configuration applies immediately or requires reload only if the backend provides that behavior.
8. Require confirmation for financially consequential cancellations/reversals and explain the consequences using factual information from the API/business contract.

### Tests
- Cash and charge mutations use real APIs and display returned state.
- Outstanding balances match API values; no duplicate frontend accounting calculations.
- Fiscal values are validated by or consistent with the backend; UI does not become the authority.
- Unsupported fiscal features are recorded, not represented as complete.
- Errors, empty results, and permission denial are visible.

### Acceptance gate
No invented accounting/fiscal semantics. Any feature without an API or an unambiguous existing rule is listed in `docs/UI_GAPS.md` rather than implemented speculatively. Stop after Batch 8.

---

## Batch 9 — Settings, import/export, users/permissions, and operational utilities

### Objective
Complete practical administration only for capabilities already present in the application/backend.

### Inspect first
- Settings UI and available APIs for users, roles, permissions, company profile, warehouses, categories, backup/restore, product/customer imports, import validation, exports, and audit history.
- Existing Electron adapters for desktop-only operations such as local backup or file dialogs. Remember that browser renderer code must not call Electron directly.

### Implement
1. Organize settings into clear sections and hide sections that have no implementation/API rather than showing inert controls.
2. Company/business profile and document defaults only where API support exists.
3. User/role/permission screens only where the current backend has secure APIs; do not build client-only authorization. UI-level hiding is convenience, not a security boundary.
4. Import preview flow only if an import API exists: validate file/rows, show errors before commit, summarize accepted/rejected rows, and avoid partial-import claims unless supported.
5. Export actions using existing API or approved client-side export from returned records.
6. Backup/restore only through existing infrastructure adapters and with clear destructive-operation warnings. Do not implement restore as a casual button or directly access filesystem from browser code.
7. Add application/version/about/diagnostic information if it is exposed by the current app and useful to operators.
8. Do not create a cloud account/server-hosting UI in this phase; future hosting is an architectural deployment task, not part of this frontend pass.

### Tests
- Only supported settings actions are displayed.
- Import/export uses actual data and shows validation failures.
- No UI-only role security is represented as sufficient security.
- No renderer filesystem/Electron access is introduced.
- Destructive restore/backup failure states do not claim success.

### Acceptance gate
Administration UI is accurate, safe, and limited to actual capabilities. Stop after Batch 9.

---

## Batch 10 — Navigation and screen inventory gap closure

### Objective
Perform the route-by-route reconciliation that determines what “complete” means for this application's actual intended scope.

### Inspect first
- `docs/UI_INVENTORY.md`.
- All routes in `src/frontend/app.js`.
- All methods exposed by the actual API facade.
- All implemented pages/components and tests.
- The Dinatek reference module/route inventory.

### Implement
1. Create/update `docs/UI_COVERAGE_MATRIX.md` with rows for each Depot Management screen/workflow, columns for: route, relevant API methods, read support, write support, status/validation states, empty/error state, RTL check, responsive check, test coverage, and completion status.
2. Compare original reference areas with Depot scope and assign each one one label:
   - `implemented` — relevant to Depot and covered by a working frontend/API.
   - `partial` — screen exists, but an action/state is missing.
   - `backend-gap` — required operation has no API/domain support; report it only, do not fix backend in this batch.
   - `out-of-scope` — Dinatek capability is not part of the agreed Depot app (for example, full HR, production, atelier, or marketplace if absent from the project scope).
   - `reference-only` — visual clue from the vendor but no requirement to implement it.
3. Verify that there are no dead-end navigation entries or unreachable implemented screens.
4. Ensure every actionable button/row action has a real outcome or is clearly unavailable.
5. Fix frontend-only omissions discovered in the audit, prioritizing core distributor workflows. Do not expand the batch into implementing entire unrelated modules.
6. Record unresolved issues and decisions in `docs/UI_GAPS.md`.

### Tests
- Route smoke tests cover every active route.
- Unknown routes produce a useful not-found state rather than a blank screen.
- Navigation entries match supported/implemented pages.
- Every API gap is documented with method name/operation needed, if known.
- No fake UI capability is counted as complete.

### Acceptance gate
A reviewer can see exactly what is done, partially done, unsupported, and intentionally excluded. Stop after Batch 10.

---

## Batch 11 — UX/accessibility/localization/responsive and print polish

### Objective
Bring all previously implemented screens to a consistent, professional standard without altering business semantics.

### Inspect first
- All screens from Batches 1–10.
- Shared styles and components.
- Supported languages/direction behavior.
- Existing print paths and accessibility checks/tests.

### Implement
1. Sweep every route at desktop and narrow viewport sizes. Fix overflow, clipped modals, unreachable actions, cramped tables, sidebar/topbar collisions, and unusable forms.
2. Verify Arabic RTL and French LTR for navigation, forms, tables, dialogs, dropdowns, dates, money, and action icons. Use direction-aware layout, not per-page hacks.
3. Make translation coverage explicit. No broken untranslated keys or placeholder strings in the common workflows. Do not invent Arabic/French business terminology where a glossary exists.
4. Verify global search behavior. If it only searches the current page or a subset, label it accurately; do not pretend it is universal.
5. Ensure focus visibility, keyboard navigation, skip link, semantic labels, accessible validation summaries, dialog focus management, and reduced-motion preferences.
6. Check status badges and destructive actions for consistent meaning, not just visual color.
7. Make printing usable for supported document/report views and ensure printing does not expose app navigation or change business state.
8. Remove accidental duplicate styles/dead helpers only when safe and directly related to frontend quality; avoid opportunistic refactoring of domain code.
9. Keep the UI efficient on modest PCs: avoid unnecessary re-render loops, oversized DOM tables, repeated network calls, or loading the entire data set if APIs support pagination.

### Tests
- Full test suite and architecture invariants pass.
- Add RTL/LTR tests for shared layout primitives where project conventions support them.
- Test keyboard/escape dialog behavior where testable.
- Test print CSS/route behavior through available test mechanisms and clearly list manual checks.
- Re-run the route/API coverage matrix and update it honestly.

### Acceptance gate
All in-scope screens have had an explicit UX sweep, and any remaining manual visual checks are listed. Stop after Batch 11.

---

## Batch 12 — Final verification, regression, and UI handoff

### Objective
Deliver a clean, auditable handoff of the frontend rewrite and establish the next work list without changing backend logic.

### Implement
1. Re-run the full test suite from a cleanly reproducible state using documented project commands.
2. Re-run syntax, lint/type, and architecture checks that are configured in the project.
3. Run database integrity checks if included in the existing test/verification workflow, but do not change database contents during a UI test unless using an isolated test database.
4. Verify all frontend routes, their API calls, and the required loading/empty/error/success states.
5. Confirm only intended files changed. Summarize any non-frontend change separately and explain why it was unavoidable; revert unapproved unrelated changes.
6. Verify no vendor JS/CSS bundle was copied into production source, no vendor private API is called, no secrets/tokens/HAR credentials were committed, and no mock business data can be mistaken for persisted data.
7. Produce/update:
   - `docs/UI_COVERAGE_MATRIX.md`
   - `docs/UI_GAPS.md`
   - `docs/UI_TEST_REPORT.md`
   - `docs/UI_DECISIONS.md` (only decisions that need to persist)
8. Provide a compact summary of final routes, supported workflows, known limitations, exact test results, and a list of manual smoke tests that still require the user to run the app.

### Acceptance gate
UI status is measurable and no known failed test is hidden. Do not declare all features “complete” if `UI_COVERAGE_MATRIX.md` still has in-scope partial or backend-gap items.

---

# PART D — Optional module decision; do not silently add scope

The Dinatek reference includes areas such as POS, distribution/driver/mobile, production, services, HR, atelier/repairs, imports, marketplace, customer portal, driver portal, and super-admin tools. Some of those are enterprise/product variants, and their presence in the bundle does not prove they belong in this Depot Management product.

During Batch 10, inventory these areas and classify them as `implemented`, `partial`, `backend-gap`, `out-of-scope`, or `reference-only`. Do not automatically create dozens of new screens just because route strings were present in the reference bundle.

Only add a new module after verifying all three:

1. The Depot customer's requirements include it.
2. The application has adequate domain/API support, or the user separately authorizes backend work.
3. Its data-integrity and permissions model is understood.

Examples:

- POS: add only if the current product scope requires in-person checkout and the existing business APIs support it.
- GPS live map: do not fake live tracking. Existing coordinates can support external map links; live tracking needs an actual feed/integration.
- HR/payroll, production/BOM, atelier/repair management, marketplace and super-admin tenancy: do not implement from reference text alone.
- Driver/customer portals: do not expose private operations without a real authentication/authorization design.

---

# PART E — Ready-to-use control prompts

Use these after the plan is in the repository/context. They are deliberately short to preserve context and reduce oversized agent edits.

## Initial message (planning only)

> Read `AGENTS.md`, `docs/UI_INVENTORY.md`, the Dinatek UI blueprint, and `Depot_Management_UI_Rewrite_All_Remaining_Batches.md`. Inspect the current Git status, Batch 1 files, API facade, and tests. Do not edit files or begin Batch 2. Return a concise verification of the current state, a per-batch dependency map, any discrepancies you found, and then wait for my exact instruction `START BATCH 2`.

## Start a batch

> START BATCH N. Execute only Batch N from `Depot_Management_UI_Rewrite_All_Remaining_Batches.md`. Reinspect the current checkout and API methods first. Preserve all architecture invariants. Do not touch backend/domain/data/database/migrations/Electron code for UI convenience. Implement the smallest complete patch for this batch, add/update tests, run the relevant checks and the full `npm test`, report exact files and results, and stop. Do not begin the next batch.

Replace `N` with the batch number the user explicitly authorizes.

## If OpenCode begins too much work

> Stop before expanding scope. Show the current diff and tests. Keep only changes required by the currently authorized batch. Do not proceed to any later batch. If a missing API blocks a UI workflow, document it in the report instead of modifying backend code or faking the feature.

## After a batch passes

> Review the current batch against its acceptance criteria and the final diff. Check for fake saves, stale optimistic UI, duplicate submissions, hidden API errors, inaccessible controls, broken RTL/LTR, and architecture violations. Fix only defects within this batch, rerun tests, summarize remaining gaps, and stop. Do not start the next batch until I authorize it.

---

# Final operating rule

This file describes the complete remaining roadmap, but it is **not authorization for an autonomous multi-batch run**. The intended workflow is:

1. OpenCode audits and waits.
2. User authorizes Batch 2.
3. OpenCode implements and tests Batch 2, reports, and stops.
4. User reviews the result and explicitly authorizes Batch 3.
5. Repeat until the user chooses to stop or revise scope.

The frontend can be completed in several deliberate sessions. Do not trade correctness for one giant patch.
