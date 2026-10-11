# UI Reconstruction — Reference Analysis, Inventory & Plan
Date: 2026-10-09
Sources: `docs/reference/dinatek-ui/app.bundle.js` (972 kB), `app.bundle.css` (180 kB), `Dinatek_Web_UI_Recovery_and_Blueprint.md`, existing Depot app (`src/`, `tests/`, `db/`), Dolisoft reverse-requirements report.

> Rule followed: no vendor bundle imported into production. All findings below are
> observations used to inform an original reimplementation. No private APIs used.

## 0. Method

Local inspection only:

```sh
grep -oE route / path:"..." extraction
python text searches for i18n `"prefix.key":"value"`, `\.from("table")`, chunks `./X-*.js`
CSS `:root` token + media-query + rtl counts
```

No browser session, no auth, no HAR. Screenshots described in the Blueprint report
were treated as secondary (medium confidence).

## 1. What the reference is (confirmed)

- Client-rendered React SPA. HTML is a loader (`<div id="root">`), real UI lives in
  `/assets/index-*.js` + `/assets/index-*.css` + 131 lazy chunks.
- No `sourceMappingURL` in the downloaded bundle tail. No original TS source recoverable.
- Backend is Supabase (`supabase` x66, `Authorization`/`Bearer`, `.from("table")`,
  `fetch https://...supabase.co/functions/v1/customer-login`). Only 2x `/api/` hits.
  Depot keeps its own SQLite + IPC/HTTP application layer; Supabase is not reused.
- CSS is Tailwind + shadcn-style vars. `font-family:Inter,Cairo,sans-serif`.
  59x `rtl` rules, `[dir=rtl]` overrides, `sidebar` x200, breakpoints
  640/768/1024/1280/1536 + print + landscape-height + reduced-motion.
- i18n: `ar-*.js` + `en-*.js` chunks, `dzcommerce-lang` key, FR default strings in bundle,
  `Français / العربية / English` selector. French-first terminology.

## 2. Routes — confirmed (163 unique `path:"..."`)

Core commercial (top-level):

```
/, /login, /register, /reset, /install, /landing, /no-company, /plan-expired
/dashboard, /pos, /sales, /articles, /stock, /customers, /suppliers,
/purchases, /purchases/returns, /cash, /cash-journal, /documents,
/charges, /debts, /returns, /settings, /statistics, /support, /documentation
```

Distribution group (confirmed):

```
distribution, distribution/bls, distribution/cash, distribution/debts,
distribution/drivers, distribution/map, distribution/performance,
distribution/performance/:driverId, distribution/reports, distribution/returns,
distribution/routes, distribution/transfers, distribution/warehouses
```

Production / Services / Atelier / HR / Imports (confirmed):

```
production, production/orders, production/recipes, production/losses,
production/reports, production/execute/:orderId?
services, services/sales, services/documents, services/pos, services/cash,
services/schedules, services/reports
atelier, atelier/catalog, atelier/catalog/:id, atelier/materials, atelier/offcuts,
atelier/quotes, atelier/work-orders, atelier/reports, atelier/settings
hr, hr/employees, hr/attendance, hr/payroll, hr/leaves, hr/advances,
hr/documents, hr/kiosk, hr/settings
imports, imports/new, imports/dashboard, imports/:id, imports/:id/edit,
imports/currencies
```

Customer portal / Driver mobile / Market / Public catalog / Super-admin (confirmed):

```
customer, customer/cart, customer/catalog, customer/orders, customer/quotes,
customer/deliveries, customer/invoices, customer/payments, customer/statement,
customer/profile, customer-login
driver, driver/route, driver/stock, driver/debts, driver/bls, driver/catalog,
driver/customers, driver/history, driver/map, driver/new-order, driver/new-sale,
driver/returns, driver/cash-transfer, driver/printer-settings, driver-login
market, market/feed, market/store/:slug, market/boutique, market/lives,
market/videos, market/favoris, market/points, market/compte, market/auth,
market/membre/:userId
catalog/:slug, catalog/:slug/cart, catalog/:slug/order/:orderId
super-admin, super-admin/licenses, super-admin/support, super-admin/errors,
super-admin/integrity, super-admin/announcements, super-admin/dolimarket,
super-admin/ai-usage, super-admin/landing-pages, ...
```

Guessed (not in bundle, do not implement on this basis alone):
exact sidebar order, exact dashboard card order, responsive collapse behavior
beyond breakpoints, map/GPS live behavior, POS barcode-scanner UX details.

## 3. Navigation hierarchy — confirmed via `nav.*` + `title:"..."`

`nav.dashboard Tableau de bord`, `nav.pos Point de vente`, `nav.sales Ventes`,
`nav.purchases Achats`, `nav.articles Articles`, `nav.stock Stock`,
`nav.customers Clients`, `nav.suppliers Fournisseurs`, `nav.documents Documents`,
`nav.returns Retours`, `nav.cash Caisse`, `nav.debts Dettes`, `nav.charges Charges`,
`nav.transfers Transferts de stock`, `nav.distribution Distribution`,
`nav.performance Performances`, `nav.production Production`,
`nav.services Services`, `nav.reports Rapports`, `nav.settings Paramètres`,
`nav.users Utilisateurs`, `nav.logout Déconnexion`.

Group titles (2x each, i.e. section headers): `Distribution, Services, Production,
Finances, Ressources Humaines, Atelier, Gestion, Statistiques`.
Sub-items e.g. `Livreurs, Entrepôts, Transferts, Tournées, Carte GPS`,
`Recettes, Ordres, Pertes`, `Employés, Paie, Congés, Pointage, Avances`,
`Matières premières, Chutes, Devis atelier, Ordres de fabrication`.

## 4. Page layouts & reusable components — confirmed

Pattern repeated across modules (from `common.*`, `placeholder.*`, `filter.*`,
`table.*`, `pos.*`, `dashboard.*` keys + chunk split):

- Shell: dark sidebar + topbar (global search `Rechercher...`, language, user,
  notifications) + main content. `sidebar-background 222 47% 11%`.
- Page header: title + subtitle/description + top-right primary action
  (`Nouvel article`, `Nouveau BL`, `Nouveau client`, `Nouvelle vente`...).
- Summary/KPI cards grid: icon + title + value + secondary line.
  Dashboard: `Solde caisse, Créances clients, Dettes fournisseurs, Ventes totales,
  Achats totaux, Chiffre d'affaires, Stock faible, Top produits, Ventes récentes,
  Activité récente, Ventes vs Achats`.
- Filter row: search input + type/status tabs (`Tous, Tous les statuts,
  Toutes catégories`) + date/period (`Aujourd'hui, 7 derniers jours...`) + Export.
- Data table columns: `Référence, Désignation, Client, Téléphone, Date, Quantité,
  Prix, Total, Statut, Actions`. Row actions: `Voir, Modifier, Supprimer,
  Convertir, Imprimer, Assigner`.
- Forms in modal/drawer: required validation (`Ce champ est obligatoire`),
  phone/email validation, `Créer/Enregistrer/Annuler/Fermer`, confirm-delete
  (`Êtes-vous sûr de vouloir supprimer ?`, `Cette action est irréversible`).
- Status badges: `Brouillon, Confirmé, En attente, En cours, Livré, Payé,
  Partiellement payé/livré, Annulé, Échoué, Reporté, Actif/Inactif`.
- Payment methods: `Espèces, Carte, Chèque, Virement, Mobile`.
- Units/packaging: `Unité, Carton, Palette`.
- States: `Chargement...`, `Aucune donnée / Aucun X trouvé`, `Données actualisées`,
  `Opération réussie`, error toasts.
- POS: categories + article grid/list toggle + cart + client + discount + payment
  (`Encaisser, Montant reçu, Rendu, Ticket`), fullscreen/compact modes, barcode.
- Documents: types `Devis, Bon de commande, Bon de livraison, Facture,
  Facture d'avoir, Facture de Route`; lifecycle `draft→confirmed→posted`,
  conversions (order→delivery→invoice), totals `Sous-total HT, TVA, Sous-total`.
- Stock: `Bon d'entrée/sortie`, reasons, `Stock actuel, Coût moyen`,
  cancel restores stock, low-stock alerts.
- Distribution: routes (`Nouvelle tournée, Assigner, Démarrer, Clôturer`),
  stops, driver performance (`Encaissé, Taux de réussite, Temps moyen`),
  GPS map (Mapbox token reference only).

## 5. Typography / colors / spacing / icons / responsive — confirmed

```css
:root{
 --background:210 20% 98%; --foreground:222 47% 11%;
 --card:0 0% 100%; --primary:217 91% 60%; --secondary:210 40% 96%;
 --accent:25 95% 53%; --destructive:0 84% 60%;
 --border:214 32% 91%; --radius:.75rem;
 --success:142 76% 36%; --warning:38 92% 50%; --info:199 89% 48%;
 --doc-quote:217 91% 60%; --doc-order:263 70% 50%;
 --doc-delivery:142 76% 36%; --doc-invoice:25 95% 53%;
 --sidebar-background:222 47% 11%; --sidebar-foreground:210 40% 98%;
 --chart-1..5: blue/orange/green/violet/sky;
}
font-family:Inter,Cairo,sans-serif; radius .75rem; backdrop-filter/shadow cards.
```

Icons: Lucide (`LayoutDashboard, ShoppingCart, Package, Users, Truck, Wallet,
Settings, FileText, Warehouse, Receipt, MapPin, Printer, Search, Plus...`).
Responsive: Tailwind `sm/md/lg/xl/2xl` + `@media print` (tickets/invoices).
RTL: `[dir=rtl]` overrides, Cairo font for Arabic. Dark/light tokens present
(`dark x28/light x32`) but sidebar stays dark.

## 6. Labels & terminology (FR reference → Depot mapping)

| Reference (FR) | Depot backend concept | Depot UI (ar/fr) |
|---|---|---|
| Articles / Désignation / Référence | `products` (sku unique, name, barcode) | المنتجات / Articles |
| Stock / Entrepôts / Transferts | `warehouses` + `stock_movements` (derived) | المخزون / Stock |
| Clients / Fournisseurs / Dettes | `parties` + roles + balances | المتعاملون / Tiers |
| Ventes / Achats / Documents (devis, BC, BL, facture) | `documents` header/lines, `sales_*`, `purchase_order` | الوثائق / Documents |
| Caisse / Paiements (Espèces/Carte/Chèque/Virement) | `payments` + `cash_accounts/sessions` | الصندوق / Caisse |
| Charges | `expenses` + categories | المصاريف / Charges |
| Retours | `returns` (customer + supplier) | المرتجعات / Retours |
| Tournées / Livreurs / Arrêts | `routes/stops`, `drivers/vehicles`, `loading`, `settlements` | التوصيل / Distribution |
| Inventaire (comptes) | `counts` draft→submitted→approved→posted | الجرد / Inventaire |
| Rapports / Statistiques | `reporting/*` (30+ queries) | التقارير / Rapports |
| Lots / Code-barres / Unités / Tarifs | `lots/serials`, `catalog(barcodes,packs,units)`, `pricing` | Lots / Unités / Tarifs |

## 7. Assets & chunks — confirmed

131 lazy chunks: `Dashboard, POS, Sales, Articles, Stock, Customers, Suppliers,
Purchases, Cash, CashJournal, Documents, LoadingSlips, Charges, Debts, Returns,
PurchaseReturns, Settings, Statistics, Distribution*, Driver*, Customer*,
Production*, Service*, Hr*, Atelier*, Imports*, Market*, PublicCatalog*,
SuperAdmin*` + `ar-*.js, en-*.js`. Fonts via Google Fonts. No images needed for
rebuild; use inline SVG/emoji icons (original).

## 8. Existing Depot app — what is preserved

- DB authoritative (`data/app.sqlite`, 24 migrations 001–024). No rewrite.
- `src/domain/` pure rules, `src/data/` only SQL, `src/application/api.js`
  single entry (commands+queries), `src/infrastructure/electron/` thin IPC
  (`main.js` + `preload.js` exposes `window.depotApi`). Frontend talks only via
  `window.depotApi` or `fetch('/api')`. Never touches SQL.
- Money integer minor units, UTC ISO timestamps, `stock=SUM(movements)`,
  receipts `posted→cancelled` via reversals, unique `sku/barcode/receipt_no`.
- Tests: 206 pass / 33 suites. Architecture invariants pin:
  `node:sqlite` only in `src/db/index.js`, no JSON persistence, renderer
  display-only (no `require`, no `node:`, no storage), electron only in
  infrastructure, IPC routes only into `appApi.commands/queries`.
- Current frontend (`index.html` 211 lines, `app.js` 794 lines, `styles.css` 26 lines):
  Arabic RTL stacked cards covering products, receipts, stock ops, POs, sales,
  payments, expenses, counts, routes/stops, parties, stock list, receipts list.
  Functional but no shell, no routing, no dashboard, no tables with search/filter,
  no dialogs, no FR, no responsive shell, no empty/loading states consistency.

Gap log (no silent faking):
- Reporting (30+ queries in preload) has no UI yet → Batch 4 read-only reports page.
- Fiscal years/events, lots/serials, pricing lists, catalog units/packs/barcodes
  have APIs but minimal UI → Batch 3–4 dialogs/tables.
- POS barcode flow, GPS map, printing, market, HR, production, atelier, imports
  are out of scope for Depot core (Dolisoft benchmark only). Not faked.

## 9. Proposed component structure (original, maintainable)

```
src/frontend/
  index.html      # shell: sidebar/nav, topbar (search, lang, transport), #view, #dialog, #toast
  styles.css      # original tokens: :root vars, dark sidebar, cards, kpi grid,
                  # table, tabs, badges, dialog, forms, responsive, print, [dir] rules
  app.js          # browser-only, no require/storage:
                  #  api client (depotApi||fetch), i18n(ar/fr in-memory),
                  #  router (hash), ui helpers (el, table, badges, modal, toast,
                  #  loading/empty/error), pages (dashboard, articles, stock,
                  #  sales, purchases, parties, cash, counts, routes, reports,
                  #  settings), forms call real APIs + unwrap({ok,data})
```

Conventions: hash routes (`#/dashboard`...), `data-action` delegation, per-page
`load()` with loading → empty → error states, dialogs for create/confirm,
status badges color-coded by doc type, French LTR + Arabic RTL via `dir`.

## 10. Implementation sequence (small verifiable batches)

- Batch 1 (this change): shell + router + tokens + i18n ar/fr + shared
  table/dialog/toast + Dashboard + Articles + Stock + migrated Sales/Purchases/
  Parties/Cash/Counts/Routes (all on real APIs). Run `npm test`.
- Batch 2: pricing/catalog (units, packs, barcodes, price lists), lots/serials,
  product edit/activate, warehouse CRUD.
- Batch 3: document detail (lines add/update/remove), delivery→invoice convert,
  returns (customer + supplier), payments allocations + reversals, expenses reverse.
- Batch 4: reports read-only (sales/stock/purchases/routes/cash), counts post flow,
  route loading/reservations + settlements reconciliation, fiscal read-only.
- Each batch: `npm test`, no backend rewrite unless gap doc'd, no hardcoded data.

## 11. Completion check for Batch 1

- [x] No vendor code copied, no private APIs.
- [x] Backend untouched (only `src/frontend/*` changed).
- [x] All screens call `window.depotApi` (or HTTP fallback), unwrap `ok/data`,
  show real errors, no fake saves.
- [x] `npm test` 206 pass incl. `architecture.test.js` (renderer still
  display-only, no storage).
