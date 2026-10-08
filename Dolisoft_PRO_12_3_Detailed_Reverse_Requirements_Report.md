# Dolisoft PRO 12.3 — Detailed Product Reconstruction & Depot Integration Report

**Prepared:** 2026-10-08  
**Target:** Distributor / depot-management application  
**Reference:** `DOLISOFTPROdemo.zip` containing `DEMO Dolisoft PRO 12.3 Install.exe`  
**Purpose:** Turn the Dolisoft PRO demo into an implementation-ready functional specification for rebuilding/expanding the Depot Management application.

---

## 0. Executive decision

Do **not** delete the current Depot project and immediately start copying Dolisoft screen-for-screen.

The better engineering decision is:

1. Freeze the current prototype as a tagged baseline/backup.
2. Treat Dolisoft PRO 12.3 as the **functional benchmark**.
3. Rebuild the internal model around a proper commercial/warehouse document engine.
4. Keep the distributor-specific features that Dolisoft does not emphasize enough: delivery planning, truck/driver workflow, route stops, delivery proof, route history, and high-volume warehouse operations.
5. Do not reproduce a hidden second accounting system for undeclared sales. Use explicit legitimate document statuses, tax modes, internal movements, samples/free goods, exemptions, proformas, returns, and reversals instead.

The key finding from the supplied installer is that Dolisoft is structurally much larger than a simple stock-and-sales program. The demo package contains **87 installed files**, including **38 `.FIC` data files, 38 `.NDX` index files, 7 `.MMO` memo files, a `.REP` file, an `.INI`, and an ~84 MB executable**. The file names expose a broad functional model covering products, categories, barcodes, lots, units, documents, invoice lines, customers/third parties, payments, accounting periods, journals, expenses, HR/payroll/attendance, production/BOMs, repairs/workshop, users, and zakat.

The public Dolisoft feature set also advertises product management, multi-price sales, customers/suppliers, purchases, sales documents, stock, lots, barcode handling, cash/payment tracking, expenses, production, employee functions, statistics, printing, backup/import/export, user permissions, VAT/stamp/fiscal features, and multi-depot operation.

This is enough to define a serious **Dolisoft-compatible functional architecture** without pretending we have the vendor's source code.

---

# 1. Evidence and confidence model

This report deliberately separates facts from inference.

### A — Directly observed from the supplied installer

These are hard findings extracted from the installer metadata/embedded manifest:

- Product name: `Dolisoft PRO12.3 DEMO`
- Version: `12.3`
- Publisher embedded in installer: `Dolisoft, Inc.`
- Product website embedded in installer: `https://www.dolisoft.com/`
- Installer engine: Inno Setup **6.4.0.1**
- Default installation directory: `C:\Dolisoft PRO12.3 DEMO`
- One French language entry: Windows language ID **1036**
- 87 file entries
- 86 embedded file-location entries
- 2 shortcut entries
- 4 registry entries
- 1 post-install run entry
- Embedded file names and original sizes
- Embedded hashes for file-location entries

### B — Publicly advertised / externally documented

The vendor's public material describes commercial management functions such as products, stock, pricing, sales/purchases, customers/suppliers, payments, printing, reporting, backup/import/export, production, employees, user rights, VAT/stamp/fiscal functions, and multi-depot operation.

### C — Engineering inference

Some conclusions are based on the combination of file names, extensions, sizes, and workflow naming. Examples:

- `.FIC/.NDX/.MMO` strongly indicates a file-based indexed database structure rather than SQLite.
- `Produit`, `FamilleProduit`, `SOUS_FAMILLE`, `Unité`, `Lot`, `CodeBarre`, `Liste_code_barre`, and multiple `TypeTarif` tables imply a normalized product/pricing subsystem.
- `Document` + `LigneDocument` + `Facture` + `LigneFacture` strongly implies a header/line document architecture.
- `Tiers` + `VersementTiers` implies a generic third-party account/balance/payment model.
- `MotifEntreeSortieStock` implies explicit stock-movement reason codes.
- `Exercice` + journals + charges + zakat imply an accounting/fiscal layer.
- `Nomenclature` + production header/lines imply BOM/production functionality.
- `Appareil` + `Atelier` + repair header/lines imply a repair/workshop module.

These are high-value implementation signals, but they are not claims about the vendor's private source code.

---

# 2. Supplied package forensic summary

## 2.1 Package fingerprints

| Artifact | Size | SHA-256 |
|---|---:|---|
| `DOLISOFTPROdemo.zip` | 49,877,856 bytes | `175fabb82488079bd4060ffc1c5f73f079d5c8428db152d2be98b8a4b6f62da7` |
| `DEMO Dolisoft PRO 12.3 Install.exe` | 50,359,061 bytes | `adf1af13bf0b56ffd4b34cda55368675b31ff21019d15611627ce8918c282152` |

The ZIP contains exactly one file: the Windows installer.

## 2.2 Installer structure

The installer is a standard Windows PE32 GUI executable built with Inno Setup 6.4.0.1.

The internal Inno manifest identifies:

- Application: `Dolisoft PRO12.3 DEMO`
- Version: `12.3`
- Publisher: `Dolisoft, Inc.`
- Support/updates URL: `https://www.dolisoft.com/`
- Default path: `C:\Dolisoft PRO12.3 DEMO`
- Uninstaller: `{app}\dolisoft PRO12-3-demo.EXE`
- One task: `desktopicon`
- File association for `.myp`
- Two shortcuts:
  - Start-menu/programs shortcut
  - Desktop shortcut when selected
- Automatic launch after install

The installer metadata is consistent with Inno Setup's documented 6.4 data structures. Inno's own source defines the 6.4 setup header, language/task/file/location/icon/registry/run records used by the parser. citehttps://github.com/jrsoftware/issrc/blob/is-6_4_0/Projects/Src/Shared.Struct.pas

---

# 3. Embedded application inventory

The most useful discovery is the embedded file list.

## 3.1 Counts

| Extension/type | Count | Total original size |
|---|---:|---:|
| `.EXE` | 1 | 84,038,144 bytes |
| `.FIC` | 38 | 140,946 bytes |
| `.NDX` | 38 | 786,692 bytes |
| `.MMO` | 7 | 1,470 bytes |
| `.REP` | 1 | 3,879 bytes |
| `.INI` | 1 | 718 bytes |
| Other | 1 | negligible / installer-managed |
| **Total** | **87** | **84,971,849 bytes** |

The executable dominates package size. The data layer is comparatively small in the demo, which is normal for a demo database.

## 3.2 Complete application data-file inventory

### Product/catalog subsystem

- `Produit.fic`
- `Produit.ndx`
- `PRODUIT_sof.FIC`
- `PRODUIT_sof.ndx`
- `FamilleProduit.fic`
- `FamilleProduit.mmo`
- `FamilleProduit.ndx`
- `SOUS_FAMILLE.FIC`
- `SOUS_FAMILLE.ndx`
- `Unité.fic`
- `Unité.ndx`
- `CodeBarre.fic`
- `CodeBarre.ndx`
- `Liste_code_barre.FIC`
- `Liste_code_barre.ndx`

### Pricing / tariffs

- `TypeTarif_Lot.fic`
- `TypeTarif_Lot.ndx`
- `TypeTarif_Produit.fic`
- `TypeTarif_Produit.ndx`
- `TypeTarifs.fic`
- `TypeTarifs.ndx`

### Lots / stock

- `Lot.fic`
- `Lot.mmo`
- `Lot.ndx`
- `MotifEntreeSortieStock.fic`
- `MotifEntreeSortieStock.ndx`

### Commercial documents / invoicing

- `Document.fic`
- `Document.mmo`
- `Document.ndx`
- `LigneDocument.fic`
- `LigneDocument.mmo`
- `LigneDocument.ndx`
- `Facture.fic`
- `Facture.ndx`
- `LigneFacture.fic`
- `LigneFacture.ndx`

### Third parties / customer-supplier accounts / payments

- `Tiers.fic`
- `Tiers.mmo`
- `Tiers.ndx`
- `VersementTiers.fic`
- `VersementTiers.ndx`

### Accounting / fiscal

- `Exercice.fic`
- `Exercice.ndx`
- `JournalIdentification.FIC`
- `JournalIdentification.ndx`
- `JournalOperation.FIC`
- `JournalOperation.ndx`
- `Charge.fic`
- `Charge.ndx`
- `TypeCharge.fic`
- `TypeCharge.ndx`
- `zakat.fic`
- `zakat.ndx`

### HR / payroll / attendance

- `Employe.fic`
- `Employe.ndx`
- `POINTAGE.fic`
- `POINTAGE.ndx`
- `Congés_et_absences.fic`
- `Congés_et_absences.ndx`
- `Fiches_de_paie.fic`
- `Fiches_de_paie.ndx`

### Production / BOM

- `Nomenclature.fic`
- `Nomenclature.ndx`
- `Production.FIC`
- `Production.ndx`
- `LigneProduction.FIC`
- `LigneProduction.ndx`
- `LigneProductionJNL.FIC`
- `LigneProductionJNL.ndx`

### Repairs / workshop

- `Appareil.fic`
- `Appareil.ndx`
- `Atelier.FIC`
- `Atelier.ndx`
- `Reparation.fic`
- `Reparation.ndx`
- `LigneReparation.fic`
- `LigneReparation.ndx`
- `ActiviteClient.fic`
- `ActiviteClient.ndx`

### User/config/support

- `Utilisateur.fic`
- `Utilisateur.mmo`
- `Utilisateur.ndx`
- `Paramètre.ini`
- `.REP`

---

# 4. What this file inventory tells us about Dolisoft

This is the strongest architecture signal from the supplied artifact.

Dolisoft is not merely:

> products + customers + invoices

It is closer to a **small modular ERP / commercial-management suite** with a common transaction model underneath.

The probable dependency stack is:

```text
                         SYSTEM / SETTINGS
                               |
                    USERS / PERMISSIONS
                               |
        +----------------------+----------------------+
        |                      |                      |
     MASTER DATA           FISCAL PERIODS         PRICING
        |                      |                      |
  +-----+------+               |               +------+------+
  |            |               |               |             |
Products     Tiers          Journals       Price Types      Lots
  |            |                                  |          |
  |            +----------------+----------------+----------+
  |                             |
  +------------------------> DOCUMENTS <--------------------+
                               |
                 +-------------+-------------+
                 |                           |
          Document headers              Document lines
                 |                           |
          Sales/purchases            Products/quantities
                 |                           |
                 +-------------+-------------+
                               |
                         STOCK MOVEMENTS
                               |
                           LOT / WAREHOUSE
                               |
                          CASH / PAYMENTS
```

Production, repair, HR, payroll, journals, and zakat appear to sit around the same base system rather than being a completely separate application.

That is exactly the architectural direction the Depot application should move toward.

---

# 5. Public feature reconstruction

The vendor's public material describes a broad commercial-management feature set. For the Depot rebuild, the following capabilities should be treated as the benchmark.

## 5.1 Products

Expected product capabilities:

- product reference/code
- designation/name
- category/family
- subfamily
- unit
- one or more barcodes
- purchase price
- selling price
- multiple sale-price levels
- stock quantity
- minimum/reorder threshold
- product image
- VAT/tax information
- margin
- pack/carton information
- package/box quantity
- package pricing
- expiry information
- lot support
- product variants where necessary
- warehouse/storage-location information
- BOM/recipe where production is enabled

### Depot implementation decision

Do not store only `current_stock` on the product.

Use a ledger/balance architecture:

```text
product
  -> stock_ledger
  -> stock_balance by warehouse
  -> stock_balance by lot when lot tracking is active
```

The current balance can be cached, but the ledger is the authoritative history.

---

# 6. Product master-data architecture

Recommended entities:

### `products`

Core fields:

- `id`
- `sku`
- `name`
- `short_name`
- `description`
- `category_id`
- `subcategory_id`
- `unit_id`
- `purchase_price`
- `default_sale_price`
- `default_cost`
- `vat_rate`
- `margin_percent`
- `reorder_level`
- `reorder_quantity`
- `track_lot`
- `track_expiry`
- `track_serial`
- `is_active`
- `image_path`
- `created_at`
- `updated_at`

### `product_barcodes`

- `id`
- `product_id`
- `barcode`
- `unit_type`
- `quantity_per_barcode_unit`
- `is_primary`

### `product_units`

Useful when a distributor sells:

- piece
- pack
- carton
- case
- pallet

A conversion model is safer than hard-coding `12 pieces = 1 box` into UI code.

### `categories`

- id
- name
- code
- parent_id if hierarchical categories are desired

### `units`

- id
- code
- name
- precision
- base_unit_id
- conversion_factor

---

# 7. Pricing engine

Dolisoft's separate tariff entities are an important signal: pricing should not be a single `product.sale_price` field.

## Recommended pricing model

```text
price_lists
   |
   +---- price_list_items ---- product
   |
   +---- customer assignment
```

Example price lists:

- Retail
- Grossiste
- Semi-gros
- Client A negotiated
- Client B negotiated
- Promotion

Potential resolution order:

```text
customer-specific override
        ↓
assigned customer price list
        ↓
customer type price list
        ↓
product default selling price
```

Each posted document line should snapshot the actual selected price. Future price changes must not rewrite history.

---

# 8. Lots and expiry

The presence of a dedicated `Lot` entity is a strong indication that lot tracking is first-class in Dolisoft.

For the distributor app, model:

### `lots`

- id
- product_id
- lot_number
- production_date
- expiry_date
- supplier_id
- purchase_document_id
- status

### `stock_lots`

- warehouse_id
- product_id
- lot_id
- quantity

### Required operational functions

- receiving a lot
- selling by lot
- selecting FEFO/FIFO when needed
- expiry warnings
- near-expiry report
- expired stock report
- lot traceability
- lot-specific pricing if required

Do not force lot support onto every product; make it a product configuration.

---

# 9. Stock engine

The `MotifEntreeSortieStock` file is particularly important.

It suggests that stock corrections are not simply arbitrary quantity edits. There are reasons attached to movements.

Recommended stock model:

```text
stock_ledger
-------------
id
product_id
warehouse_id
lot_id nullable
movement_type
reason_id nullable
reference_type
reference_id
quantity_in
quantity_out
unit_cost
created_at
created_by
```

Examples of movement types:

- purchase receipt
- sales delivery
- sales return
- purchase return
- warehouse transfer out
- warehouse transfer in
- manual increase
- manual decrease
- damaged
- expired
- lost
- found
- inventory count adjustment
- production consumption
- production output
- internal use
- sample/free goods

### Critical invariant

No posted business document should directly mutate a product's stock field without creating a stock movement.

That rule will prevent a large class of inventory integrity bugs.

---

# 10. Warehouses / depots

The public product description advertises multi-depot operation.

For a distributor, this becomes a P0 feature, not an optional feature.

### `warehouses`

- id
- code
- name
- address
- active
- default_warehouse

### `warehouse_bins` (optional)

- id
- warehouse_id
- code
- description

Use this only when the customer actually needs shelf/bin location control. Do not over-engineer a simple depot.

### Transfers

```text
TRANSFER
  ├─ source warehouse
  ├─ destination warehouse
  ├─ status
  └─ lines
        ├─ product
        ├─ lot
        └─ quantity
```

A confirmed transfer should create two ledger events:

```text
source:      -Q
destination: +Q
```

Prefer one database transaction for both.

---

# 11. Customers and suppliers: the `Tiers` concept

The `Tiers` file is one of the strongest signals that Dolisoft treats customers and suppliers as variations of a generic third-party entity.

Recommended architecture:

### `parties`

Common information:

- id
- type: customer / supplier / both
- name
- legal_name
- phone
- mobile
- email
- address
- city
- wilaya
- NIF where applicable
- RC where applicable
- NIS where applicable
- AI where applicable
- notes
- active

Then:

```text
parties
   |
   +---- customer_profile
   |
   +---- supplier_profile
```

This prevents duplicated identity records.

---

# 12. Customer credit model

A distributor application needs a real account statement, not just `customer.balance` floating in the database.

Authoritative balance should be derivable from posted transactions:

```text
opening balance
+ posted invoices
+ debit adjustments
- payments
- credit notes / returns
= current balance
```

Use a transaction ledger or allocation system so a payment can be applied to one or multiple invoices.

### Recommended entities

- `receivables`
- `payments`
- `payment_allocations`
- `credit_notes`
- `debit_notes`

A payment can exist before allocation, then be allocated to invoices.

---

# 13. Sales document engine

This is the part of Dolisoft that most directly affects the Depot project.

The target model should support a document family rather than a single `orders` table.

Recommended documents:

```text
DEVIS / QUOTE
     ↓
COMMANDE / SALES ORDER
     ↓
BL / DELIVERY NOTE
     ↓
FACTURE / INVOICE
     ↓
PAIEMENT / PAYMENT
```

Also support:

- proforma invoice
- sales return
- credit note
- cancelled document
- internal/non-sale documents where legitimate

The public Dolisoft material describes conversion between commercial documents and combining multiple delivery notes into an invoice. That should be considered a benchmark behavior.

---

# 14. Document state machine

Never model document state as a free-text label.

Use explicit states.

### Quote

```text
DRAFT → SENT → ACCEPTED → CONVERTED
                     └────→ REJECTED
                     └────→ EXPIRED
```

### Sales order

```text
DRAFT
  ↓
CONFIRMED
  ↓
PARTIALLY DELIVERED
  ↓
DELIVERED
  ↓
INVOICED
```

Cancellation should be a controlled transition, not deletion.

### Delivery note

```text
DRAFT → POSTED → PARTIALLY INVOICED → INVOICED
```

### Invoice

```text
DRAFT → POSTED → UNPAID
                ↓
             PARTIAL
                ↓
              PAID
```

Returned/cancelled documents should be handled through explicit reversal/return workflows.

---

# 15. Document header / line structure

### `documents`

Suggested fields:

- id
- document_type
- document_number
- fiscal_year_id
- party_id
- warehouse_id
- sales_rep_id
- vehicle_id nullable
- route_id nullable
- date
- due_date
- status
- currency
- subtotal
- discount_total
- taxable_total
- tax_total
- stamp_total
- grand_total
- paid_total / derived
- notes
- reference_document_id nullable
- created_by
- posted_by
- posted_at
- cancelled_by
- cancelled_at

### `document_lines`

- id
- document_id
- product_id
- warehouse_id
- lot_id nullable
- quantity
- unit_id
- unit_price
- discount_percent
- discount_amount
- tax_rate
- tax_amount
- line_total
- cost_snapshot
- free_quantity
- notes

The `free_quantity` field is worth having for legitimate promotional/free goods without confusing them with a hidden sale.

---

# 16. Atomic posting rules

This should be one of the core engineering requirements.

Posting a sales delivery should do one transactional operation:

```text
BEGIN
  validate document
  validate product/lot availability
  create/post document state
  create stock ledger movements
  update cached stock balances
  create receivable if invoiced
  create audit event
COMMIT
```

If anything fails, **nothing should be partially committed**.

This is more important than copying a specific screen from Dolisoft.

---

# 17. Purchase subsystem

The equivalent inbound flow should be:

```text
PURCHASE QUOTE (optional)
        ↓
PURCHASE ORDER
        ↓
RECEIPT / GOODS IN
        ↓
SUPPLIER INVOICE
        ↓
SUPPLIER PAYMENT
```

For a small distributor, the UI can simplify this to:

- Purchase order
- Receive stock
- Supplier invoice
- Supplier payment

But the database should preserve document boundaries.

### Purchase receipt effects

A posted receipt should:

- increase stock
- create or attach lots
- record cost
- update weighted/average cost if that valuation method is selected
- create supplier payable if invoice is posted

---

# 18. Returns

Returns deserve their own workflow.

### Customer return

```text
Customer return
    ↓
Validate returned quantity
    ↓
Stock IN
    ↓
Credit note / receivable adjustment
```

### Supplier return

```text
Supplier return
    ↓
Stock OUT
    ↓
Supplier payable adjustment
```

Do not represent a return by editing the original invoice quantity after posting.

---

# 19. Cash and payments

Dolisoft advertises cash/payment management and has a dedicated third-party payment file.

For Depot, use:

### `cash_accounts`

Examples:

- Main cash box
- Office cash
- Bank
- Mobile payment account if needed later

### `cash_sessions`

- opening balance
- closing balance
- opened_by
- closed_by
- timestamps

### `cash_transactions`

- payment in
- payment out
- expense
- refund
- transfer
- adjustment

### `payments`

- party_id
- direction: incoming/outgoing
- amount
- method
- reference
- date
- cash_account_id
- document allocation
- created_by

---

# 20. Expenses

The presence of both `Charge` and `TypeCharge` means expense classification is probably a first-class concept.

Recommended:

### `expense_categories`

Examples:

- fuel
- maintenance
- electricity
- phone/internet
- rent
- salaries
- packaging
- miscellaneous

### `expenses`

- category_id
- amount
- date
- supplier/party nullable
- employee nullable
- vehicle nullable
- cash_account_id
- notes
- attachment
- posted_by

For this customer, associating fuel/maintenance expenses to a specific truck is likely more valuable than replicating generic accounting UI.

---

# 21. Distributor-specific delivery subsystem

This is where the rebuild should **diverge from a generic Dolisoft clone and become better suited to the customer**.

## Core entities

### `drivers`

- employee_id
- licence info
- phone
- active

### `vehicles`

- registration
- make/model
- capacity
- odometer
- active
- current_status

### `routes`

- route_date
- driver_id
- vehicle_id
- status
- planned_distance
- notes

### `route_stops`

- route_id
- customer_id
- sequence
- planned_time
- status
- delivery_document_id
- amount_due
- amount_collected
- notes
- proof_photo
- customer_signature if later required

### Route lifecycle

```text
DRAFT
  ↓
PLANNED
  ↓
DISPATCHED
  ↓
IN PROGRESS
  ↓
COMPLETED
```

Each stop should record:

- arrived
- served
- partial
- skipped
- refused
- rescheduled

That data is extremely valuable for distributor reporting.

---

# 22. Sales-to-delivery integration

The correct relationship is:

```text
Customer order
      ↓
Allocate stock
      ↓
Build delivery route
      ↓
Driver receives stops
      ↓
Delivery confirmation
      ↓
Stock issue is posted
      ↓
Invoice generated/linked
      ↓
Payment collected at stop (optional)
```

Do not make `deliveries` a disconnected copy of `orders`.

A route stop should reference the actual commercial document.

---

# 23. Mobile / offline architecture

Dolisoft publicly promotes mobile functionality for field sales/offline ordering.

For the future Depot mobile app, do not make the phone the authoritative source of truth.

Recommended:

```text
DESKTOP / SERVER DB
       ↑   ↓
   SYNC QUEUE
       ↑   ↓
MOBILE OFFLINE DB
```

Each offline mutation gets:

- local id
- server id when synchronized
- operation id / idempotency key
- timestamp
- user/device id
- sync state

This prevents duplicate orders when connectivity is unstable.

---

# 24. Barcode subsystem

Dolisoft has at least two barcode-related data files.

Depot requirements:

- scan by product barcode
- scan alternate barcodes
- pack/carton barcode
- configurable barcode-to-unit conversion
- barcode label printing
- barcode lookup in POS/sales screen
- barcode as secondary key, never the product's database primary key

Potential search priority:

```text
exact barcode
→ exact SKU
→ exact reference
→ name contains
```

---

# 25. POS / fast-sale screen

The public product material describes a fast sales interface.

Recommended Depot POS screen:

```text
+---------------------------------------------------------+
| CUSTOMER [search]        PRICE LIST [Grossiste ▼]       |
+---------------------------------------------------------+
| Barcode / Product search                                |
+---------------------------------------------------------+
| Product | Qty | Unit | Price | Discount | Total         |
|---------|-----|------|-------|----------|---------------|
| ...                                                     |
+---------------------------------------------------------+
| Subtotal                    125,000 DA                  |
| Discount                     -5,000 DA                  |
| VAT                           0 / ...                   |
| Total                       120,000 DA                  |
| Paid                         80,000 DA                  |
| Due                          40,000 DA                  |
+---------------------------------------------------------+
| [SAVE] [BL] [INVOICE] [PRINT] [PAYMENT]                |
+---------------------------------------------------------+
```

For wholesale distribution, keyboard-first operation matters. Avoid building an overly graphical retail POS if the operator is processing many lines quickly.

---

# 26. Pricing at sale time

A common ERP bug is using the current product price when viewing an old document.

Correct behavior:

```text
Product price today = X
Price when invoice was posted = Y
Invoice must permanently retain Y
```

The document line must contain the price snapshot.

The same applies to:

- tax rate
- discount
- cost
- unit conversion
- description if documents require historical integrity

---

# 27. Fiscal year / exercise

The `Exercice` file should become a first-class table.

### `fiscal_years`

- id
- code
- label
- start_date
- end_date
- status: open / closed
- document numbering configuration

Never hard-code the year into SQL or UI logic.

Document numbers should be generated through a controlled sequence:

```text
INV-2026-000001
BL-2026-000001
CMD-2026-000001
```

Exact numbering format can remain configurable.

---

# 28. Accounting layer: keep it modular

The existence of:

- journals
- exercise
- charges
- zakat

shows Dolisoft goes beyond pure inventory.

For the Depot project, do **not** start by building a full accounting ERP.

Build a clean commercial ledger and expose exports/adapters.

Recommended architecture:

```text
COMMERCIAL CORE
      |
      +---- reports
      +---- cash
      +---- customer balances
      +---- supplier balances
      +---- accounting export
```

Only implement full accounting screens if the customer explicitly needs them.

---

# 29. Legitimate transaction visibility / tax modes

The application may need to distinguish operational transactions that have different fiscal treatment. That is legitimate.

Recommended explicit fields/states:

- tax-exempt
- zero-rated where legally applicable
- taxable
- proforma
- internal transfer
- free/sample goods
- stock adjustment
- customer return
- supplier return
- cancelled/reversed

Do **not** create:

```text
secret_invoice
hidden_sale
undeclared_sale
```

or a second invisible ledger intended to conceal revenue.

A professional design should make every stock/financial event explainable and auditable.

---

# 30. User and permissions architecture

Dolisoft has a user database and public material advertises user rights.

Recommended permission groups:

### Administrator

Everything.

### Manager

- inventory
- purchases
- sales
- customers
- reports
- payments
- delivery planning

### Warehouse operator

- products read
- receiving
- transfers
- inventory counts
- stock adjustments with restricted rights

### Sales operator

- customers
- quotes
- orders
- sales documents
- payments

### Cashier

- POS
- payments
- cash sessions

### Driver

- assigned routes
- stop information
- delivery confirmation
- collection entry if authorized

### Accountant / reporting

- invoices
- payments
- balances
- reports
- exports

Permission checks must exist at the service/domain layer, not only by hiding UI buttons.

---

# 31. Audit trail

This should be stronger than the reference app if possible.

### `audit_log`

- id
- timestamp
- user_id
- action
- entity_type
- entity_id
- before_json nullable
- after_json nullable
- workstation/device
- reason nullable

Audit events worth recording:

- created document
- posted document
- cancelled document
- changed price
- changed customer credit limit
- manual stock adjustment
- payment posted
- payment reversed
- inventory count adjustment
- user permission changed
- configuration changed

Posted transactions should not be silently edited.

---

# 32. Inventory count workflow

Recommended:

```text
CREATE COUNT
   ↓
FREEZE/RESTRICT TARGET LOCATION (optional)
   ↓
COUNT PHYSICAL STOCK
   ↓
COMPARE SYSTEM VS PHYSICAL
   ↓
APPROVE DIFFERENCE
   ↓
CREATE ADJUSTMENT MOVEMENTS
```

Never overwrite `stock_balance` directly from an inventory-count screen.

---

# 33. Reporting requirements

Minimum useful reports:

## Sales

- sales by day
- sales by customer
- sales by product
- sales by category
- sales by salesman
- sales by route
- gross margin
- discounts
- top products
- slow products

## Receivables

- customer balance
- aging
- overdue invoices
- payment history
- collection by route/driver

## Inventory

- current stock
- stock valuation
- movement history
- low stock
- negative stock
- lot status
- expiring stock
- warehouse comparison
- inventory adjustments

## Purchasing

- purchases by supplier
- supplier balance
- purchase price history
- price variation

## Delivery

- route completion
- stops completed
- skipped/refused stops
- delivery value
- collected value
- outstanding value
- vehicle utilization
- driver performance

## Cash

- daily cash
- cash movements
- expense summary
- payment methods

---

# 34. Printing requirements

Public Dolisoft material puts substantial emphasis on printed commercial documents.

Depot should support configurable templates for:

- quote
- sales order
- delivery note
- invoice
- proforma
- purchase order
- purchase receipt
- payment receipt
- return document
- customer statement
- supplier statement
- stock movement
- inventory count
- barcode labels

Template engine should separate data from layout.

Recommended:

```text
Document model
     ↓
Print renderer
     ↓
A4 / A5 / thermal / PDF
```

Do not embed printing logic directly inside sales transactions.

---

# 35. Import / export

Public Dolisoft material advertises mass Excel import.

For Depot, prioritize:

### Import

- products
- customers
- suppliers
- opening stock
- price lists
- barcodes

### Export

- products
- stock
- customers
- sales
- purchases
- invoices
- payments
- customer statements

Use a preview/validation step before committing a bulk import.

Example:

```text
Excel
 ↓
Parse
 ↓
Validate
 ↓
Preview errors
 ↓
User confirms
 ↓
Transactional import
```

---

# 36. Backup / restore

Backups must be a product feature.

Minimum:

- manual backup
- automatic backup
- timestamped backups
- backup destination configuration
- database integrity check before backup
- restore flow
- backup verification

Recommended backup naming:

```text
Depot-2026-10-08-1150.db
```

A restore operation must never silently overwrite the active database.

---

# 37. Data integrity invariants

This should become the engineering contract for the rewrite.

### Inventory invariant

For every product/warehouse/lot:

```text
balance = sum(all posted ledger movements)
```

### Sales invariant

Every posted delivery/sale that affects stock must correspond to exactly one intended stock-out movement per line/lot.

### Payment invariant

Every allocated payment must point to an existing posted receivable/payable.

### Document invariant

Every line belongs to exactly one document.

### Numbering invariant

A document number cannot be duplicated within its numbering scope.

### Cancellation invariant

Posted documents are not deleted. They are cancelled/reversed through an explicit transaction.

### Audit invariant

High-impact actions create audit events.

### Transaction invariant

Any business action that changes multiple related tables must be atomic.

### Idempotency invariant

A retry of the same client operation must not create a duplicate document/payment/stock movement.

---

# 38. Recommended database schema

A practical first-pass SQLite/server schema could be organized as follows.

## Master data

```text
products
categories
subcategories
units
product_barcodes
product_images
parties
customers
suppliers
price_lists
price_list_items
customer_price_lists
lots
warehouses
warehouse_locations
```

## Purchases

```text
purchase_orders
purchase_order_lines
purchase_receipts
purchase_receipt_lines
purchase_invoices
purchase_invoice_lines
supplier_returns
supplier_return_lines
```

## Sales

```text
quotes
quote_lines
sales_orders
sales_order_lines
delivery_notes
delivery_note_lines
sales_invoices
sales_invoice_lines
customer_returns
customer_return_lines
credit_notes
credit_note_lines
```

## Inventory

```text
stock_ledger
stock_balances
stock_transfers
stock_transfer_lines
stock_adjustments
stock_adjustment_lines
stock_adjustment_reasons
inventory_counts
inventory_count_lines
```

## Payments / cash

```text
payments
payment_allocations
cash_accounts
cash_sessions
cash_transactions
expenses
expense_categories
```

## Logistics

```text
vehicles
drivers
routes
route_stops
route_stop_events
delivery_proofs
```

## Administration

```text
users
roles
permissions
role_permissions
user_roles
fiscal_years
document_sequences
settings
audit_log
attachments
```

---

# 39. Entity relationship overview

```text
PARTY
  ├── CUSTOMER
  └── SUPPLIER

PRODUCT
  ├── CATEGORY
  ├── SUBCATEGORY
  ├── BARCODE(s)
  ├── PRICE(s)
  └── LOT(s)

WAREHOUSE
  ├── STOCK BALANCES
  ├── STOCK LEDGER
  └── TRANSFERS

CUSTOMER
  ├── ORDERS
  ├── DELIVERY NOTES
  ├── INVOICES
  ├── RETURNS
  └── PAYMENTS

SUPPLIER
  ├── PURCHASE ORDERS
  ├── RECEIPTS
  ├── INVOICES
  ├── RETURNS
  └── PAYMENTS

ROUTE
  ├── DRIVER
  ├── VEHICLE
  └── STOPS
          └── CUSTOMER
          └── DELIVERY NOTE
          └── PAYMENT
```

---

# 40. UI architecture recommendation

The current Depot interface can evolve into this structure.

```text
DASHBOARD
│
├── PRODUCTS
│   ├── Products
│   ├── Categories
│   ├── Units
│   ├── Barcodes
│   ├── Price Lists
│   └── Lots
│
├── INVENTORY
│   ├── Stock
│   ├── Movements
│   ├── Transfers
│   ├── Adjustments
│   └── Inventory Counts
│
├── SALES
│   ├── Quotes
│   ├── Orders
│   ├── Delivery Notes
│   ├── Invoices
│   ├── Returns
│   └── Payments
│
├── PURCHASES
│   ├── Orders
│   ├── Receipts
│   ├── Supplier Invoices
│   └── Returns
│
├── CUSTOMERS
│   ├── Customers
│   ├── Statements
│   └── Collections
│
├── SUPPLIERS
│
├── DELIVERIES
│   ├── Routes
│   ├── Today's Stops
│   ├── Drivers
│   └── Vehicles
│
├── CASH
│   ├── Cash Sessions
│   ├── Payments
│   └── Expenses
│
├── REPORTS
│
└── SETTINGS
    ├── Users
    ├── Roles
    ├── Fiscal Years
    ├── Numbering
    ├── Printing
    ├── Backup
    └── Import / Export
```

---

# 41. Dashboard requirements

The distributor dashboard should show operational facts, not decorative graphs.

Top KPIs:

- today's sales
- today's deliveries
- outstanding customer debt
- low-stock items
- pending orders
- deliveries in progress
- cash collected today
- overdue customer balances
- expiring/near-expiry lots

Operational widgets:

- today's route list
- urgent low-stock products
- unpaid invoices
- recent stock adjustments
- latest payments

---

# 42. Search architecture

A commercial application lives or dies on search speed.

Global product search should support:

```text
barcode
SKU/reference
exact name
partial name
category
supplier reference
```

Customer search should support:

```text
customer name
phone
code
NIF/RC if stored
address
```

Do not make users open a modal and click through three levels every time they need a product.

---

# 43. Product entry workflow

Recommended:

```text
NEW PRODUCT
   ↓
Basic identity
   ↓
Category / unit
   ↓
Purchase / selling prices
   ↓
Tax configuration
   ↓
Barcodes
   ↓
Lot tracking settings
   ↓
Reorder rules
   ↓
Save
```

Optional advanced fields should remain collapsed so the operator is not hit with 50 fields on day one.

---

# 44. Customer workflow

Customer creation should immediately support operational use:

- identity
- contacts
- delivery address
- price list
- credit limit
- payment terms
- sales representative
- route assignment
- active/inactive
- notes

Then the customer page should expose tabs:

```text
Overview | Orders | Delivery | Invoices | Payments | Statement | Notes
```

---

# 45. Customer credit controls

Recommended fields:

- credit limit
- payment term days
- overdue threshold
- block-on-overdue toggle
- block-on-credit-limit toggle
- override permission

When a new order is entered:

```text
current exposure
+ new order exposure
≤ credit limit ?
```

If not, warn or block according to configuration.

Manager-level overrides should be audited.

---

# 46. Purchase receiving workflow

A warehouse operator should be able to:

1. open supplier receipt
2. scan/select products
3. enter quantities
4. assign lots/expiry if required
5. confirm damaged/missing quantities
6. post receipt
7. print receiving document

After posting:

- stock increases
- inventory ledger gets entries
- cost is captured
- supplier account is updated if invoiced

---

# 47. Sales fulfillment workflow for distributor

Better than generic POS:

```text
ORDER
 ↓
ALLOCATE STOCK
 ↓
PICK LIST
 ↓
PACK
 ↓
DELIVERY NOTE
 ↓
LOAD TRUCK
 ↓
ROUTE
 ↓
CUSTOMER DELIVERY
 ↓
INVOICE / PAYMENT
```

The UI can collapse steps for a small company, but the domain model should keep the distinctions.

---

# 48. Truck loading

This is a valuable Depot feature.

A route can create a truck load sheet:

```text
ROUTE #2026-10-08-01
Driver: X
Vehicle: 12345-xxx

Product              Planned     Loaded
-----------------------------------------
Water 1.5L             100         100
Juice 1L                50          48
Biscuits 200g           80          80
```

After finalizing the load, discrepancies are visible before the truck leaves.

Do not deduct warehouse stock merely because a route was planned. Stock should move from warehouse to truck/location only when the load/dispatch event is actually posted, if the customer wants truck stock tracking.

---

# 49. Optional truck-stock model

For a more advanced distributor workflow:

```text
MAIN WAREHOUSE
      ↓
TRUCK STOCK
      ↓
CUSTOMER DELIVERY
```

Then each vehicle acts as a mobile warehouse.

This enables:

- truck inventory
- route-level stock
- end-of-day truck reconciliation
- returned goods
- shortages

This is a major potential differentiator from a generic commercial package.

---

# 50. Delivery collection workflow

At a customer stop:

```text
OPEN STOP
  ↓
See order / delivery note
  ↓
Confirm quantities
  ↓
Record discrepancy
  ↓
Confirm delivery
  ↓
Create/validate invoice
  ↓
Collect payment (optional)
  ↓
Issue receipt
```

Payment methods can include:

- cash
- bank transfer
- cheque if needed
- card if available
- other configured method

Never hard-code one payment method.

---

# 51. Report-generation architecture

Reports should use read models / queries rather than directly embedding large SQL fragments into UI components.

Example:

```text
reports/
  sales-report.js
  stock-report.js
  customer-statement.js
  supplier-statement.js
  delivery-performance.js
```

Then the UI only supplies filters.

---

# 52. Recommended technical architecture

For the existing Electron direction, a clean architecture would be:

```text
ELECTRON UI
    |
IPC / application commands
    |
DOMAIN SERVICES
    |
REPOSITORIES
    |
DATABASE
```

Example:

```text
sales.createOrder()
sales.postDelivery()
sales.postInvoice()
stock.postMovement()
payments.postPayment()
deliveries.assignRoute()
```

The UI should never implement business rules such as:

```text
UPDATE products SET stock = stock - 5
```

That belongs inside a transaction-aware domain service.

---

# 53. SQLite considerations

SQLite is perfectly reasonable for the first desktop release.

Use it as a transactional commercial core.

Important settings/features:

- foreign keys enabled
- WAL mode where appropriate
- explicit transactions
- indexes on operational search fields
- unique constraints for document numbers
- CHECK constraints for valid states
- decimal-safe money representation

Do not rely on floating-point JavaScript `Number` arithmetic for money when exact currency accounting is required. Store monetary values as integer smallest units where practical, or use a decimal implementation.

---

# 54. Index strategy

High-value indexes:

```text
products(sku)
products(name)
product_barcodes(barcode)
parties(name)
parties(phone)
documents(document_number)
documents(party_id, date)
documents(document_type, status)
document_lines(product_id)
stock_ledger(product_id, warehouse_id, created_at)
stock_ledger(lot_id)
payments(party_id, date)
route_stops(route_id, sequence)
```

Do not add dozens of indexes blindly; measure real query patterns.

---

# 55. Migration strategy from the current prototype

Do not perform a blind destructive migration.

Recommended process:

### Phase A — Freeze baseline

- create a Git tag
- back up the current database
- record schema version
- export key data sets

### Phase B — Map existing entities

```text
Current products       → products
Current customers      → parties/customers
Current orders         → sales_orders
Current staff          → employees/users
Current vehicles       → vehicles
Current deliveries     → routes/route_stops
```

### Phase C — Introduce new schema alongside old

For the first migration, avoid renaming everything in place.

### Phase D — Import

- products
- customers
- suppliers
- stock
- orders where history is necessary
- vehicles/drivers

### Phase E — Reconcile

Run:

```text
source count = destination count
source quantities = destination quantities
source balances = destination balances
source references remain unique
```

### Phase F — Cut over

Only after reconciliation should the new application become operational.

---

# 56. Migration mapping details

| Reference concept | Proposed Depot entity |
|---|---|
| Produit | products |
| FamilleProduit | categories |
| SOUS_FAMILLE | subcategories |
| Unité | units |
| CodeBarre / Liste_code_barre | product_barcodes |
| Lot | lots |
| TypeTarifs | price_lists |
| TypeTarif_Produit | price_list_items |
| Tiers | parties + customer/supplier profile |
| Document | document headers / typed documents |
| LigneDocument | document lines |
| Facture | sales_invoices / invoice document type |
| LigneFacture | sales_invoice_lines |
| VersementTiers | payments + allocations |
| MotifEntreeSortieStock | stock_adjustment_reasons / movement reasons |
| Exercice | fiscal_years |
| Utilisateur | users |
| Employe | employees |
| POINTAGE | attendance |
| Charge | expenses |
| TypeCharge | expense_categories |
| Nomenclature | BOM |
| Production | production_orders |
| LigneProduction | production_lines |
| Reparation | repair_jobs (optional) |
| Atelier | workshop (optional) |
| Appareil | customer_equipment (optional) |
| ActiviteClient | customer_activity (optional) |
| Zakat | fiscal/religious module only if actually required |

---

# 57. What to copy from Dolisoft

### Copy the concepts

- product master depth
- categories/subcategories
- barcode handling
- units
- lot support
- multiple tariffs
- party/customer/supplier model
- document header/line model
- delivery-note/invoice separation
- customer statements
- payment records
- stock reasons
- fiscal-year concept
- user permissions
- import/export
- backup
- printing
- reporting

### Improve over Dolisoft

- stock ledger integrity
- explicit transaction boundaries
- idempotency
- audit trail
- route/delivery integration
- truck stock
- modern search
- offline sync design
- clear document state machine
- database constraints
- testability

### Do not automatically copy

- full payroll
- full accounting UI
- repair/workshop
- production
- every obscure fiscal report

Those modules should be activated only when the customer's business actually needs them.

---

# 58. What NOT to do during the rewrite

### Do not make a single mega-table called `transactions`

It eventually becomes impossible to reason about.

### Do not make `orders` mean everything

Order, delivery, invoice, return, and payment are different business events.

### Do not directly edit posted documents

Use revisions/reversals.

### Do not directly edit stock

Every stock change must have a reason and reference.

### Do not duplicate customer data into invoice rows unnecessarily

Snapshot only what must be historically immutable for legal/printing reasons.

### Do not put authorization solely in the renderer

IPC/domain layer must enforce it.

### Do not delete historical transactions

Use cancellation/reversal.

---

# 59. Testing strategy

The rewrite should use business-invariant tests, not only button-click tests.

## Products

- duplicate SKU rejected
- duplicate barcode rejected when unique
- product can have multiple barcodes
- inactive product behavior defined

## Stock

- purchase increases stock exactly once
- delivery decreases stock exactly once
- transfer creates source and destination movements
- return reverses expected stock direction
- adjustment always requires reason
- lot stock reconciles

## Sales

- conversion retains line quantities/prices correctly
- partial delivery works
- multiple delivery notes can be invoiced together
- cancellation does not delete history

## Payments

- payment allocation cannot exceed unapplied amount
- duplicate payment submission is idempotent
- customer balance reconciles

## Routes

- one stop cannot silently be assigned to two active routes
- completion status is consistent
- delivered quantities are linked to actual documents

## Permissions

- unauthorized IPC request is rejected even if UI is manipulated

## Concurrency / repeated input

- double-click save
- repeated Enter key
- two requests for same order
- retry after timeout

This is especially important in Electron desktop software because the user can generate multiple events faster than the UI appears to react.

---

# 60. Core transaction test examples

A good automated test suite should prove cases such as:

### Sale posting

```text
Before stock = 100
Sale quantity = 7
After stock = 93
Ledger movement = exactly 1 x -7
```

### Failed sale posting

```text
Before stock = 100
Sale fails halfway
After stock = 100
Invoice not posted
Ledger movement = 0
```

### Duplicate submission

```text
Same idempotency key sent twice
→ one document
→ one stock movement
→ one payment if payment included
```

### Transfer

```text
Warehouse A = 100
Warehouse B = 40
Transfer = 12
A = 88
B = 52
```

These tests are more valuable than hundreds of screenshot snapshots.

---

# 61. Performance requirements for distributor workload

The application should be optimized for:

- fast product search
- rapid barcode scanning
- large customer lists
- large invoice histories
- large stock-ledger histories
- hundreds/thousands of products
- thousands/tens of thousands of transaction lines over time

Use pagination/virtualization for large grids.

Do not load entire transaction tables into JavaScript arrays just to render a table.

---

# 62. Offline resilience

Desktop use may continue even when internet/cloud connectivity is unavailable.

The core commercial database should be locally durable.

If cloud sync is added:

- local writes succeed independently
- sync is asynchronous
- conflicts are explicit
- retries are safe
- operations are idempotent

Do not turn the desktop application into a permanently online-only interface unless the customer's actual deployment model requires it.

---

# 63. Recommended implementation priority

## P0 — foundation

1. database schema
2. products/categories/units
3. customers/suppliers
4. warehouses
5. stock ledger
6. price lists
7. users/roles
8. document framework
9. audit log
10. database backup/restore

## P1 — commercial operation

11. purchasing
12. sales orders
13. delivery notes
14. invoices
15. payments
16. customer statements
17. returns
18. cash
19. printing
20. core reports

## P2 — distributor advantage

21. routes
22. route stops
23. drivers
24. vehicles
25. truck loading
26. truck stock
27. collection at delivery
28. route analytics

## P3 — advanced

29. mobile app
30. offline sync
31. production
32. repair/workshop
33. payroll
34. advanced accounting integration

---

# 64. Suggested development sequence

### Sprint 1 — Domain foundation

- schema
- migrations
- repositories
- transaction helper
- error model
- audit log

### Sprint 2 — Master data

- products
- categories
- units
- barcodes
- customers
- suppliers
- warehouses

### Sprint 3 — Inventory

- stock ledger
- stock balances
- receiving
- adjustments
- transfers
- lots

### Sprint 4 — Sales

- quotes
- orders
- delivery notes
- invoices
- returns

### Sprint 5 — Money

- receivables
- payments
- allocations
- cash sessions
- expenses

### Sprint 6 — Logistics

- drivers
- vehicles
- routes
- route stops
- delivery completion

### Sprint 7 — Output

- printing
- reports
- Excel import/export
- backup/restore

### Sprint 8 — Hardening

- adversarial tests
- duplicate submission tests
- crash/recovery tests
- migration tests
- performance tests

---

# 65. Recommended folder/module structure

For the Electron codebase:

```text
src/
  main/
    ipc/
    services/
    repositories/
    db/
    migrations/

  domain/
    products/
    inventory/
    parties/
    purchasing/
    sales/
    payments/
    deliveries/
    cash/
    reports/

  renderer/
    views/
    components/
    tables/
    forms/

  shared/
    validation/
    money/
    dates/
    ids/
```

The key idea is to keep business logic out of renderer files.

---

# 66. Recommended command/service API surface

Examples:

```text
products.create
products.update
products.search

inventory.receive
inventory.adjust
inventory.transfer
inventory.getBalance
inventory.getMovements

sales.createQuote
sales.confirmOrder
sales.createDeliveryNote
sales.postDelivery
sales.createInvoice
sales.postInvoice
sales.createCustomerReturn

purchases.createOrder
purchases.receive
purchases.postSupplierInvoice

payments.create
payments.allocate
payments.reverse

routes.create
routes.addStop
routes.dispatch
routes.completeStop
routes.close
```

The renderer calls commands; commands call domain services; services call repositories.

---

# 67. Error-handling requirements

Business errors should be explicit.

Examples:

```text
INSUFFICIENT_STOCK
LOT_EXPIRED
PRODUCT_INACTIVE
CREDIT_LIMIT_EXCEEDED
DOCUMENT_ALREADY_POSTED
DOCUMENT_ALREADY_CANCELLED
PAYMENT_OVERALLOCATED
DUPLICATE_BARCODE
DUPLICATE_DOCUMENT_NUMBER
PERMISSION_DENIED
CONCURRENT_UPDATE
```

Do not show raw SQL or generic `Something went wrong` when a business rule was violated.

---

# 68. Database constraints worth enforcing

Examples:

```sql
UNIQUE(products.sku)
UNIQUE(product_barcodes.barcode)
UNIQUE(document_type, fiscal_year_id, document_number)
FOREIGN KEY(document_lines.document_id)
FOREIGN KEY(document_lines.product_id)
CHECK(quantity > 0)
CHECK(amount >= 0)
```

The database should reject invalid states where feasible.

---

# 69. Security baseline

Even a local desktop ERP needs basic security.

- password hashes, never plaintext passwords
- session/user context in every privileged operation
- least-privilege roles
- audit trail
- safe backup handling
- no SQL assembled from raw user input
- renderer cannot access filesystem/database directly
- IPC handlers validate input
- sensitive settings stored securely

---

# 70. The biggest architectural lesson from Dolisoft

The most important lesson is not one particular screen.

It is the separation between:

```text
MASTER DATA
     ↓
COMMERCIAL DOCUMENTS
     ↓
STOCK MOVEMENTS
     ↓
FINANCIAL MOVEMENTS
     ↓
REPORTING
```

Everything should connect through these controlled transitions.

For the customer's distributor business, add:

```text
COMMERCIAL DOCUMENTS
     ↓
LOGISTICS / ROUTES
     ↓
DELIVERY EXECUTION
     ↓
PAYMENT COLLECTION
```

That is the architecture I would build.

---

# 71. Important limitation of this analysis

The supplied file is a Windows installer. The installer metadata and embedded manifest were successfully parsed, including its internal file list and many setup records.

The installer uses Inno Setup's internal compressed data container for the main payload. In this environment, the **raw `.FIC/.NDX/.MMO` records were not fully unpacked into their application-level database schemas**, so this report does not claim exact field names, indexes, record relations, screen-by-screen behavior, or private business rules from those files.

Therefore:

- File names = direct evidence.
- File relationships = strong inference.
- Publicly advertised workflows = external evidence.
- Exact internal DB columns = still unknown.
- Exact UI behavior = still requires direct runtime observation.

This is why the recommended schema is a **clean reconstruction**, not a claim that Dolisoft's private schema is exactly the same.

---

# 72. Runtime validation checklist for closing the remaining gaps

When the Windows demo can be run interactively, record the following.

### Navigation

- every main menu
- every submenu
- settings pages
- toolbar buttons
- context menus

### Product screen

- every visible field
- required vs optional
- validation rules
- pricing behavior
- units
- lots
- barcodes

### Customer screen

- customer fields
- supplier fields
- price assignment
- credit controls
- payment terms
- statement layout

### Sales

- document types
- state transitions
- conversion behavior
- partial fulfillment
- returns
- payment interaction

### Inventory

- stock movement screen
- adjustment reasons
- warehouse transfer behavior
- negative stock rules
- lot selection

### Printing

- document templates
- numbering
- paper sizes
- tax lines
- totals

### Reports

- filters
- grouping
- exports
- date behavior

### Permissions

- exact per-user restrictions
- manager overrides

This should be documented with screenshots/video and converted into test cases before implementing obscure behavior.

---

# 73. Final target product definition

The new Depot application should be thought of as:

> **A distributor-focused commercial and warehouse management system inspired by Dolisoft PRO's breadth, but rebuilt around a modern, transactional, auditable architecture with delivery-route and vehicle operations as first-class capabilities.**

Its core loop is:

```text
SUPPLIERS
   ↓
PURCHASES
   ↓
WAREHOUSE
   ↓
STOCK
   ↓
CUSTOMER ORDERS
   ↓
PICK / LOAD
   ↓
TRUCK / ROUTE
   ↓
DELIVERY
   ↓
INVOICE
   ↓
PAYMENT / COLLECTION
   ↓
REPORTS
```

Everything else is an extension of that loop.

---

# 74. Recommended immediate implementation backlog

If integration starts immediately, the first backlog should be:

### Epic A — Data foundation

- create migration framework
- define IDs and timestamps
- create products/categories/units
- create parties/customers/suppliers
- create warehouses
- create fiscal years

### Epic B — Inventory core

- stock ledger
- stock balances
- receive purchase
- stock adjustments
- transfer stock
- reason codes
- lots

### Epic C — Commercial documents

- generic document header
- generic line model
- sales order
- delivery note
- invoice
- customer return

### Epic D — Money

- receivables
- payments
- allocation
- cash accounts
- expenses
- statements

### Epic E — Distributor logistics

- vehicles
- drivers
- routes
- stops
- load sheet
- delivery status

### Epic F — Output / administration

- print templates
- reports
- permissions
- import/export
- backup/restore
- audit log

---

# 75. Bottom line

The supplied Dolisoft PRO 12.3 demo gives us enough evidence to justify a **substantial architecture change** in the Depot project.

The correct mental model is no longer:

```text
Products + Customers + Orders + Deliveries
```

It should become:

```text
Master Data
    ↓
Pricing
    ↓
Purchasing ↔ Inventory ↔ Sales
                 ↓
              Deliveries
                 ↓
             Invoicing
                 ↓
             Payments
                 ↓
              Reports

with Users / Audit / Backup / Fiscal / Printing across the whole system.
```

The reference installer alone exposes a much broader object model than the original prototype. The distributor-specific rewrite should therefore be **domain-first and transaction-first**, not UI-first.

That is the foundation to use for the integration/rebuild.

---

# Appendix A — Exact embedded file list

```text
.Rep / support:
.REP
Paramètre.ini

Executable:
dolisoft PRO12-3-demo.EXE

Core data:
ActiviteClient.fic / .ndx
Appareil.fic / .ndx
Atelier.FIC / .ndx
Charge.fic / .ndx
CodeBarre.fic / .ndx
Congés_et_absences.fic / .ndx
Document.fic / .mmo / .ndx
Employe.fic / .ndx
Exercice.fic / .ndx
Facture.fic / .ndx
FamilleProduit.fic / .mmo / .ndx
Fiches_de_paie.fic / .ndx
JournalIdentification.FIC / .ndx
JournalOperation.FIC / .ndx
LigneDocument.fic / .mmo / .ndx
LigneFacture.fic / .ndx
LigneProduction.FIC / .ndx
LigneProductionJNL.FIC / .ndx
LigneReparation.fic / .ndx
Liste_code_barre.FIC / .ndx
Lot.fic / .mmo / .ndx
MotifEntreeSortieStock.fic / .ndx
Nomenclature.fic / .ndx
POINTAGE.fic / .ndx
Production.FIC / .ndx
Produit.fic / .mmo / .ndx
PRODUIT_sof.FIC / .ndx
Reparation.fic / .ndx
SOUS_FAMILLE.FIC / .ndx
Tiers.fic / .mmo / .ndx
TypeCharge.fic / .ndx
TypeTarif_Lot.fic / .ndx
TypeTarif_Produit.fic / .ndx
TypeTarifs.fic / .ndx
Unité.fic / .ndx
Utilisateur.fic / .mmo / .ndx
VersementTiers.fic / .ndx
zakat.fic / .ndx
```

---

# Appendix B — External reference

Dolisoft's official public demo/product material:

- Demo: https://demo.dolisoft.com/demodolisoft.html
- Demo selection: https://demo.dolisoft.com/demo.html
- Main product site: https://www.dolisoft.com/

Inno Setup 6.4 shared data structures used to validate the installer metadata:

- https://github.com/jrsoftware/issrc/blob/is-6_4_0/Projects/Src/Shared.Struct.pas

---

**End of report.**
