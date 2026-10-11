# UI Coverage Matrix — Depot Management frontend (Batches 10–12, final)

Date: 2026-10-09. Scope: the 11 product routes + `notfound`, against the real
`window.depotApi` facade (Electron preload) and the existing application layer.
Reference: Dinatek bundle (163 route strings) + `docs/UI_INVENTORY.md`.

Conventions: money = integer minor units (display only). Stock = `SUM(movements)`.
Totals shown are server values, never recomputed. “Checked” below means verified
by code inspection + `npm test`; a human browser pass at desktop + narrow widths
is still recommended (no screenshot harness in repo).

Batch 11 sweep (code-level, no semantics changed): global search labeled +
routes to the catalog it filters; cash/route tabs localized (ar/fr) with tab
roles; dialogs trap-free focus + announced errors + Escape cleanup; icon-only
buttons labeled; print shows the document dialog (shell hidden) and never
mutates state; topbar/dialogs wrap at ≤760px; no `zoom`; tables capped with
double-submit guards kept. Remaining manual checks: real browser pass per
route at desktop + 360px, ar RTL + fr LTR visual read, keyboard-only run,
physical printout of one document + one report.

Batch 12 final verification (no functional change): `npm test` 261 pass /
43 suites / 0 fail; `node --check` clean; `npm run db:integrity` ok, 0 FK
violations (read-only check, prod DB untouched); renderer rule holds (no
`require(`, `node:`, SQL, storage, fs/Electron in `app.js`); all 126
`api.*` references resolve in the preload facade; no vendor bundle/code/API,
no secrets, no mock business data in `src/`; changed files limited to
`src/frontend/*` + `docs/*` + `tests/*` (zero backend changes).

## Product routes

| route | relevant API methods | read support | write support | status / validation states | empty / error state | RTL check | responsive check | test coverage | completion status |
|---|---|---|---|---|---|---|---|---|---|
| dashboard `#/dashboard` | listStock, listDocuments, listPayments, listCounts, listRoutes, listParties, listCashAccounts, listWarehouses | KPIs + recent lists | refresh only | loading → error per source | empty per panel + next-action links | ar RTL / fr LTR via shell | KPI grid 4→2→1, grid-2→1 | full suite | implemented |
| articles `#/articles` | listProducts/getProduct/createProduct/updateProduct/setProductActive/deleteProduct, listCategories/getCategoryTree/createCategory/deleteCategory, listUnits/createUnit, listPacks/createPack, listBarcodes/addBarcode/removeBarcode/resolveBarcode, listPriceLists/getPriceList/createPriceList/updatePriceList/deletePriceList/setPriceLine/removePriceLine/resolveSalePrice, listLots/createLot/deleteLot/suggestLots/listSerials | 6 sub-tabs, detail panel | create/edit/toggle/delete + lines | draft-style validation, server CONFLICT/NOT_FOUND surfaced, SKU immutable | empty per tab, load errors | shell | tables scroll, f-grid→1 | tests/catalog-ui-batch2 (6) | implemented |
| stock `#/stock` | listStock, listProducts (join min/cat), getProduct, listLots, getStockLedger, getAvailableStock, listMovements, receiveStock, issueStock, adjustStock, transferStock, reverseStockMovement, listReceipts/getReceipt/cancelReceipt, listWarehouses | overview + detail + ledger + receipts | receive/issue/adjust/transfer/reverse/cancel | pool/expiry/serial guards, duplicate transfer_no, receipt-cancel only posted | empty + caps noted | shell | tables scroll | tests/inventory-batch5 (5) | implemented |
| sales `#/sales` | listDocuments/getDocument/createDocument/updateDocument/addDocumentLine/updateDocumentLine/removeDocumentLine/confirmDocument/postDocument/cancelDocument/convertDocument/convertDeliveriesToInvoice/postDeliveryNote/postInvoice/resolveSalePrice | list + shared detail (header/lines/server totals) | full draft lifecycle, conversions create drafts | draft/confirmed/posted/cancelled + delivery-fulfillment guard, cancel-reason, no fake timeline | empty + per-action errors | shell | tables scroll, dialog | tests/documents-ui-batch3 (4) | implemented |
| purchases `#/purchases` | same document methods (purchase_order scope) | list + shared detail | same as sales | same | same | shell | same | documents-ui-batch3 | implemented |
| parties `#/parties` | listParties/createParty (+ findPartyByCode join) | tabs all/customer/supplier + search | create only | roles validated server-side | empty + errors | shell | tables scroll | full suite (parties.test) | partial — updateParty/setPartyRoles/setPartyActive/deleteParty/phones exist but have no UI |
| cash `#/cash` | listPayments/getPayment/recordPayment/reversePayment/partyBalance, createCustomerReturn/postCustomerReturn/returnToSupplier, listDocuments, listCashAccounts/createCashAccount/openCashSession/closeCashSession/sessionReport, listExpenseCategories/createExpenseCategory/deleteExpenseCategory/listExpenses/getExpense/createExpense/reverseExpense/expenseReport | 5 tabs: payments/returns/balances/accounts/expenses | record(+allocations)/reverse/settle/returns/expenses/sessions | allocation≤amount + same-party, reversal-reason, return-remaining, session open-once | empty per tab + errors | shell | tables scroll, grid-2→1 | tests/returns-payments-batch4 (5), tests/cash-fiscal-batch8 (5) | implemented (gaps: no session list / movement-history API) |
| counts `#/counts` | listCounts/getCount/createCount/addCountLine/updateCountLine/removeCountLine/submitCount/approveCount/postCount/cancelCount | list + variance detail (counted/expected/variance/reason) | full lifecycle incl. lot-aware lines | draft/submitted/approved/posted/cancelled, reason-required, post-irreversible | empty + errors | shell | tables scroll | inventory-batch5 | implemented |
| routes `#/routes` | listRoutes/getRoute/createRoute/assignRoute/addStop/removeStop/loadRoute/dispatchRoute/completeStop/failStop/completeRoute/cancelRoute, listDrivers/createDriver/setDriverActive, listVehicles/createVehicle/setVehicleActive, reserveStock/releaseReservations/listReservations/availableStock, settleStop/getStopSettlement/routeReconciliation | 3 tabs + detail (crew/loading/stops/settlement/completion) | all transitions above | planned/loaded/out_for_delivery/delivered/partial/failed/cancelled + crew/stop/coverage guards | empty stops/reservations, locked-state hints | shell | tables scroll | tests/routes-batch6 (5) | implemented (no GPS — no backend feed) |
| reports `#/reports` | 34 × get* report methods (facade present) | registry + filters + table + CSV + print + 3 drill-downs | run only (read-only) | loading/error/empty per report, generation clock labeled | empty + per-report errors | shell | tables scroll | tests/reports-batch7 (5) | partial — UI complete, backend wiring missing (api.js) + 19/34 SQL broken (see gaps) |
| settings `#/settings` | listWarehouses/getWarehouse/createWarehouse/setWarehouseActive/deleteWarehouse, listCategories, openFiscalYear/closeFiscalYear/listFiscalYears/listAccountingEvents/getAccountingEvent/getJournalLines, recentAudit, live-list exports | warehouses/fiscal/audit/exports/about | warehouse + fiscal open/close | MAIN/referenced guards, one-open-year, destructive confirms | empty + errors | shell | grid-2→1 | tests/settings-batch9 (5) | implemented (gaps listed in-page: users/import/backup/cloud/tax-config) |
| `#/unknown` | none | not-found page + valid-route links | — | — | always renders (never blank) | shell | simple card | tests/navigation-batch10 | implemented |

## Navigation audit

- 11 nav entries, each maps 1:1 to an implemented renderer. No dead entries.
- Sub-tabs (articles 6, cash 5, routes 3) are in-memory filters, not routes — no unreachable screens.
- Every row button was traced to a handler: detail/edit/toggle/delete, confirm/post/cancel/convert/print, reserve/release/settle, open/close session, drill-downs. Disabled states only for status-locked actions with explanatory hints.
- Fixed in this batch: unknown hashes previously fell back to dashboard silently; now render `notfound` with valid links.

## Reference comparison (labels per Part D)

- implemented: dashboard, articles, stock, customers/suppliers (parties), purchases, sales, documents, cash, debts (balances), charges (expenses), returns, routes/drivers/vehicles/transfers/warehouses, counts, settings, reports-registry.
- partial: parties (no edit UI), reports (UI done, backend gaps block data).
- backend-gap: report IPC wiring (34), 19 report SQL statements, category update, unit/pack update/delete, party edit/roles/phones UI needs (APIs exist, UI absent), cash session list + movement history, expense edit, driver/vehicle update/delete, stop edit, print adapter unwired (client print used instead), version/about API, GPS coordinates feed.
- out-of-scope (no Depot domain/API, per Part D): POS checkout, production/BOM, HR/payroll, atelier/repairs, services/scheduling, marketplace/dolimarket, imports module, customer/driver portals + auth, super-admin/tenancy, HR kiosk/attendance.
- reference-only: vendor Supabase schema, bundle chunk names, marketing screenshots, exact sidebar order/colors.

## Checks run

- `node --check src/frontend/app.js` — OK.
- `npm test` — 246+ new tests green (see Batch 10 report for final count).
- Renderer rule: no `require(`, `node:`, SQL, storage, fs/Electron in `app.js`.
- Manual browser pass still needed: desktop + 360px widths, ar RTL + fr LTR per route, dialogs focus/escape, print of a document + a report.
