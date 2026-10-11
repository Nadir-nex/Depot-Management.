# UI Gaps & Decisions (Batches 10–12, final)

Standing rules: SQLite is authoritative. No renderer persistence, no second
database, no fake saves, no private vendor APIs. Anything below marked
`backend-gap` needs backend work authorized separately — never fixed by faking
it in the frontend.

## Backend gaps (API/SQL, frontend surfaces errors honestly)

1. Report IPC wiring: `main.js` routes 34× `reports:*` to `appApi.queries.get*`,
   but `src/application/api.js` never wires `reportingApp`. Every report IPC
   call fails. (Batch 7 verified.)
2. Report SQL drift (19/34 fail even direct): `getSalesByRoute`
   (`route_stop_documents`), receivables + supplier set (`pa.document_id`,
   `pa.allocated_at`), `getLowStockProducts` (`SUM()` misuse),
   `getLotExpiryReport` (`l.qty`), delivery set (`r.name`, `rs.sequence`),
   `getCustomerCollections` (`r.name`), `getDriverVehiclePerformance`
   (`fv.registration`), cash set (`cs.session_date`, `ct.type`,
   `e.description`, `ct.reference_no`). 15 run.
3. Print adapter (`src/application/printing/*`) exists but is unwired (no api.js
   query, no IPC). UI uses client-side print of `getDocument` data instead.
4. Cash: no session-list, no cash-movement-history API (open/close/report-by-id only).
5. No version/about, company-profile, document-defaults, TVA/stamp/fiscal-ID,
   or numbering APIs. Fiscal UI is years/events read-only + open/close.
6. No GPS/GIS feed of any kind (zero matches in `src/`). No live tracking to show.
7. No user/role management, import-preview, backup/restore, or cloud APIs.
   Import/export modules are CLI-only by architecture rule and must stay so.

## Missing UI on existing APIs (frontend work, no backend needed)

- parties: updateParty, setPartyRoles, setPartyActive, deleteParty, add/remove
  phone — list/create only.
- catalog: updateCategory; unit update/delete; pack update/delete.
- expenses: no edit (no API either — also backend gap if wanted).
- drivers/vehicles: update/delete (APIs absent too).
- route stops: no edit (remove + re-add is the path; API has no update).

## Out of scope (reference-only, Part D)

POS, production/BOM, HR/payroll/attendance/kiosk, atelier/repairs, services,
marketplace/dolimarket, imports module, customer/driver portals + mobile auth,
super-admin/tenancy, live GPS maps. Presence in the Dinatek bundle does not
make them Depot requirements.

## Decisions kept

- Hash routing (file:// + hosted compatible); sub-tabs stay in-memory, not routes.
- Money stays integer minor units; totals rendered from server payloads only.
- Stock shown only as `SUM(movements)`; available == on-hand until reservations
  exist as a real API concept (loading claims shown separately in routes).
- Destructive/irreversible actions (post count, close session/year, cancel,
  delete) always confirm, with consequences quoted from the API contract.
- Unknown hashes render `notfound` (Batch 10 fix) instead of silently
  falling back to dashboard.
- CSV exports are client-side snapshots of displayed rows, never presented as
  canonical backups.
