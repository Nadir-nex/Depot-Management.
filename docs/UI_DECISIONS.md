# UI Decisions (persistent)

Only decisions that must survive beyond the rewrite batches.

1. Hash routing (`#/route`) keeps `file://` (Electron `loadFile`) and future
   hosted builds working. Sub-tabs stay in-memory state, not routes.
2. Renderer talks only via `window.depotApi` (preload IPC → application layer)
   with a same-shaped `fetch('/api')` fallback. No SQL, Node, Electron, or
   browser storage in `src/frontend/*` — pinned by `architecture.test.js`.
3. Money is integer minor units end-to-end; the UI never computes totals.
   Stock is `SUM(stock_movements)`; available == on-hand until reservations
   exist (loading claims surface separately in routes).
4. Every mutation waits for `{ok:true}` before claiming success; server error
   codes/messages render verbatim. Destructive/irreversible actions confirm
   first, with consequences quoted from the API contract.
5. Bilingual ar (RTL default) + fr (LTR); `t()` keys must exist in both
   languages (tested). No `zoom` property (project decision); responsive via
   wrapping grids, scrolling tables, capped lists.
6. CSV is a client-side snapshot of displayed rows, never a canonical backup.
   Import/export/backup stay CLI/operator-level by architecture rule.
7. Print is client-side (`window.print()` + print CSS); the print adapter in
   `src/application/printing/*` stays unwired until backend work authorizes it.
8. Out of scope unless requirements + APIs + integrity model all exist: POS,
   production, HR, atelier, services, marketplace, portals/mobile auth,
   super-admin, live GPS.
9. Backend gaps (report wiring + SQL drift, missing CRUD/sessions/history/
   version/tax-config) are documented in `UI_GAPS.md`, never papered over in
   the UI. Frontend shows their errors honestly.
