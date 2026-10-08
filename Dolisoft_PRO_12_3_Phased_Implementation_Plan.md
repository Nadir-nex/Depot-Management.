# Dolisoft PRO 12.3 → Depot Management
# Phased Business-Rule Implementation Plan

**Prepared:** 2026-10-08  
**Reference specification:** `Dolisoft_PRO_12_3_Detailed_Reverse_Requirements_Report.md`  
**Reference package:** `DOLISOFTPROdemo.zip` / Dolisoft PRO 12.3 demo installer  
**Target application:** Existing Depot Management Electron application  
**Target stack:** Existing project stack; expected direction is Electron + JavaScript + SQLite (`node:sqlite` / `DatabaseSync` where already used)  
**Implementation model:** Incremental replacement/extension, one bounded phase at a time  
**Total phases:** **28**

---

# 0. How this document is meant to be used

This document is an **execution plan**, not another product-description document.

The accompanying reverse-requirements report answers:

> **What business capabilities and rules must the finished system contain?**

This document answers:

> **In what order should the coding agent implement them, how do we prevent the agent from choking on a huge rewrite, and what must be proven after every phase?**

The coding agent must receive both documents together:

1. `Dolisoft_PRO_12_3_Detailed_Reverse_Requirements_Report.md`
2. `Dolisoft_PRO_12_3_Phased_Implementation_Plan.md`

It should also have the actual current Depot Management repository available and inspect it before changing anything.

The agent must treat the reverse-requirements report as the **functional reference** and this document as the **execution sequence**. Neither document grants permission to copy proprietary source code, binaries, branding, artwork, or implementation details from Dolisoft. The goal is to reproduce the required business capabilities in our own JavaScript/SQLite implementation.

---

# 1. Non-negotiable execution rules for the coding agent

These rules are intentionally strict. They exist to prevent a multi-hour autonomous coding run from turning into an uncontrolled rewrite.

## Rule 1 — One phase at a time

Implement **only the current phase**.

Do not silently start work belonging to later phases merely because the code is already nearby.

A later phase may be prepared for by adding a necessary interface or migration seam, but its business behavior must not be implemented early unless explicitly required by the current phase.

## Rule 2 — Every phase ends with a test gate

At the end of every phase:

1. run the project's existing automated test suite;
2. run the new tests for the phase;
3. run database/invariant checks relevant to the phase;
4. launch the app enough to verify the critical path still works;
5. inspect the diff for accidental scope expansion;
6. produce a short phase report containing:
   - files changed;
   - database migrations added;
   - tests added;
   - tests executed and results;
   - known limitations;
   - explicit confirmation that no later phase was implemented.

If the tests fail, **stop and repair the current phase**. Do not continue building on red tests.

## Rule 3 — Database is the source of truth

Do not maintain an authoritative parallel UI state, giant renderer-side application state, or JSON shadow database.

Business operations must ultimately be represented by SQLite data and transaction-safe domain operations.

## Rule 4 — Use transactions for multi-record business operations

Any business operation that changes multiple related records must be atomic.

Examples:

- posting a sale;
- receiving a purchase;
- payment against an invoice;
- customer return;
- supplier return;
- warehouse transfer;
- truck loading;
- delivery completion when stock/payment status changes;
- inventory adjustment;
- production consumption/output.

A partial business operation is considered a defect even when the UI appears to recover correctly.

## Rule 5 — Posted history is immutable

Do not “fix” history by silently overwriting posted documents, payments, stock movements, or accounting events.

Use cancellation/reversal/correction workflows with audit records.

## Rule 6 — No hidden sales ledger

Do not build a covert second sales database intended to hide revenue from tax/accounting authorities.

The application may support legitimate classifications and reporting scopes such as:

- taxable;
- exempt where legally applicable;
- proforma/non-posting;
- internal movement;
- sample/free goods;
- stock adjustment;
- returns;
- reversals;
- other legally valid document states.

The meaning of those classifications must be explicit and auditable.

## Rule 7 — Preserve current data until migration is proven

Never drop the current database or permanently replace the current repository during the implementation phases.

The old system becomes a migration source until the new system has been verified.

## Rule 8 — Prefer simple domain services

Business rules should live in testable JavaScript modules/services, not be duplicated across HTML event handlers.

Renderer/UI code should call domain operations rather than manually performing stock or money calculations.

## Rule 9 — Keep accounting optional/modular

Implement operational commercial rules first. Build a modular fiscal/accounting layer around posted business events instead of coupling every feature to a full accounting system from day one.

## Rule 10 — Do not create speculative features

If a requirement is not supported by the reverse report, the current project, or a clearly documented distributor need, do not invent complex behavior just because Dolisoft appears to have a related concept.

Flag it for later instead.

## Rule 11 — Preserve backward compatibility where cheap

Existing customer/product/order data should be imported or mapped where practical. Do not destroy working distributor-specific functionality merely to mimic the reference product.

## Rule 12 — Keep the application runnable

After every phase the application must remain launchable.

A phase that leaves the project in a permanently half-migrated state is unacceptable.

---

# 2. Architectural target

The finished application should be understood as several business layers rather than as one enormous “ERP” module.

```text
                     ┌───────────────────────┐
                     │       UI / IPC         │
                     └───────────┬───────────┘
                                 │
                     ┌───────────▼───────────┐
                     │   Application Layer   │
                     │ commands / use-cases │
                     └───────────┬───────────┘
                                 │
               ┌─────────────────┼─────────────────┐
               │                 │                 │
               ▼                 ▼                 ▼
        Commercial Domain   Inventory Domain   Money Domain
               │                 │                 │
               └─────────────────┼─────────────────┘
                                 ▼
                       Logistics / Delivery
                                 │
                                 ▼
                       SQLite persistence
```

A future accounting/fiscal layer should consume **posted business events** rather than becoming the source of truth for operational stock and sales.

---

# 3. Definition of “done” for the entire program

The rebuild is considered functionally complete only when the application can reliably execute the core distributor lifecycle below:

```text
Product setup
   ↓
Supplier setup
   ↓
Purchase / stock receipt
   ↓
Warehouse stock
   ↓
Customer setup
   ↓
Price selection
   ↓
Sales quotation/order
   ↓
Delivery note / fulfillment
   ↓
Invoice posting
   ↓
Customer payment
   ↓
Truck loading
   ↓
Route assignment
   ↓
Delivery completion
   ↓
Receivable reconciliation
   ↓
Stock + cash + sales reporting
```

And the system must maintain these invariants:

```text
Posted sale      → stock effect exactly once
Posted purchase  → stock effect exactly once
Payment          → receivable effect exactly once
Return           → compensating stock/money effect exactly once
Cancellation     → explicit reversal, never silent history mutation
Transfer         → source and destination movement in one transaction
Duplicate click  → does not duplicate the business event
Audit            → every sensitive mutation is traceable
```

---

# 4. Phase dependency map

The 28 phases are intentionally ordered.

```text
P01 Baseline / forensic freeze
  ↓
P02 Domain vocabulary + IDs
  ↓
P03 Database foundation + migration framework
  ↓
P04 Audit + authorization primitives
  ↓
P05 Product/catalog master data
  ↓
P06 Units/barcodes/categories
  ↓
P07 Pricing / tariffs
  ↓
P08 Warehouses / stock locations
  ↓
P09 Stock ledger + adjustments
  ↓
P10 Lots / expiry / serial support
  ↓
P11 Customers / suppliers / credit
  ↓
P12 Document engine foundation
  ↓
P13 Sales workflow
  ↓
P14 Purchases workflow
  ↓
P15 Returns + cancellation/reversal
  ↓
P16 Payments / receivables / cash
  ↓
P17 Expenses + operational cash
  ↓
P18 Inventory counts + reconciliation
  ↓
P19 Distributor delivery core
  ↓
P20 Truck loading / route fulfillment
  ↓
P21 Delivery collections / settlement
  ↓
P22 Import / export / migration
  ↓
P23 Printing / document snapshots
  ↓
P24 Reporting / dashboards
  ↓
P25 Fiscal-year + accounting event layer
  ↓
P26 Advanced domains (production / repair / HR where actually needed)
  ↓
P27 Performance / resilience / offline hardening
  ↓
P28 Final migration, acceptance, security and release
```

Some implementation details inside a phase may be parallelized by the coding agent, but **phase boundaries must remain intact**.

---

# 5. Phase 01 — Freeze and understand the existing Depot application

## Objective

Create a safe baseline before introducing the new domain model.

This is not a feature phase. It is an anti-disaster phase.

## Required work

The agent must inspect the current repository and document:

- Electron version;
- Node version/runtime assumptions;
- database access layer;
- current SQLite schema;
- existing tables;
- existing seed data;
- current IPC boundaries;
- renderer/business-logic boundaries;
- current modules for inventory/customers/orders/staff/vehicles/deliveries;
- current migration mechanism, if any;
- current test framework;
- current packaging/build commands;
- existing backup/export behavior.

Create or update a baseline document inside the repository containing the findings.

Create a Git checkpoint/tag or equivalent immutable baseline.

## Do not

- delete the old database;
- rename the whole project;
- rewrite the UI;
- replace the existing schema;
- implement Dolisoft features yet.

## Tests

- Existing tests pass before modifications.
- Application launches.
- Existing customer/product/order workflows remain functional.
- Database backup can be made and restored.
- A schema dump can be reproduced from the baseline database.

## Exit gate

**GREEN:** Current app is recoverable and its current architecture is documented.

**RED:** Stop. Fix the baseline/recovery process before continuing.

---

# 6. Phase 02 — Establish the domain vocabulary

## Objective

Agree on the names and meanings used by the new business layer before creating dozens of tables.

## Core concepts

Define canonical terminology for:

- Product
- Product category/family/subfamily
- Unit
- Barcode
- Price list / tariff
- Supplier
- Customer
- Party / third party
- Warehouse/depot
- Stock location
- Lot
- Serial number
- Document
- Document line
- Sale
- Purchase
- Quote
- Order
- Delivery note
- Invoice
- Proforma
- Return
- Payment
- Cash account/session
- Expense
- Driver
- Vehicle
- Route
- Route stop
- Delivery
- Inventory count
- Stock movement
- Audit event

Write explicit semantic definitions, especially for terms that can otherwise become overloaded.

For example:

> An `order` is not an invoice.

> A `document` is a generic commercial record with a specific document type and state.

> A `stock movement` is the inventory ledger event; a sales document is not itself the stock ledger.

## Tests

No major runtime feature is required.

Add unit tests for any conversion/status/type enums created in code.

## Exit gate

All core domain nouns have a single canonical meaning and are not represented by multiple competing enum systems.

---

# 7. Phase 03 — SQLite foundation and migration infrastructure

## Objective

Create a stable persistence foundation capable of supporting the new model without destructive migration.

## Required work

Implement or standardize:

- SQLite initialization;
- schema version table;
- numbered migrations;
- transaction helper;
- foreign-key enforcement;
- busy/locking handling;
- consistent date/time storage strategy;
- numeric/money representation rules;
- soft-delete policy where justified;
- database integrity checks;
- backup-before-migration hook;
- migration logging.

Use SQLite constraints wherever practical.

## Core rules

Enable foreign keys explicitly.

Never silently ignore migration failure.

A migration that fails must roll back atomically.

Do not mix schema migration with large business-data transformations unless the migration is itself designed and tested for that purpose.

## Tests

- Fresh database reaches latest schema.
- Old baseline database migrates successfully.
- Migration failure rolls back.
- Foreign keys reject invalid references.
- Transaction rollback restores all affected rows.
- Backup is created before a migration.

## Exit gate

The application can create/migrate a database deterministically from an empty database and from the frozen baseline.

---

# 8. Phase 04 — Audit trail and authorization primitives

## Objective

Build the infrastructure required to safely protect every later business operation.

## Audit events

Create an append-only audit model capturing at minimum:

- timestamp;
- user;
- operation type;
- entity type;
- entity ID;
- before/after summary where appropriate;
- document/reference number when applicable;
- reason for sensitive corrections/cancellations.

Avoid storing entire database snapshots on every operation. Store useful business-level audit information.

## Permissions

Define permission keys for business operations rather than hardcoding a few role names.

Example capability families:

```text
products.view
products.edit
pricing.edit
stock.view
stock.adjust
stock.transfer
sales.create
sales.post
sales.cancel
purchases.create
purchases.post
payments.record
payments.reverse
customers.edit
credit.override
deliveries.create
deliveries.complete
reports.view
admin.backup
admin.restore
```

Roles can later map to these permissions.

## Tests

- Unauthorized user cannot execute protected domain operation.
- Renderer cannot bypass authorization by directly invoking an IPC route.
- Sensitive operation produces audit entry.
- Audit records are append-only from normal application paths.

## Exit gate

Every later protected service has a clear authorization hook and audit mechanism.

---

# 9. Phase 05 — Product master data

## Objective

Create the canonical product catalog.

## Implement

At minimum:

- products;
- SKU/reference;
- name/designation;
- product type;
- active/inactive state;
- purchase cost;
- default sales price;
- VAT/tax classification field where applicable;
- minimum stock threshold;
- image/path reference if current app needs it;
- optional notes.

Do not yet overload the product with stock quantity.

The product describes the item.

Inventory quantities belong to inventory records/ledger.

## Business rules

- Product references should be unique within the agreed scope.
- Inactive products cannot be sold unless explicitly allowed for historical/reversal operations.
- Cost values must follow one consistent precision policy.
- Negative prices/invalid thresholds are rejected.

## Tests

Create/read/update/deactivate product.

Reject duplicate SKU.

Reject invalid numeric values.

Historical documents continue to reference an inactive product.

## Exit gate

Product data is cleanly separated from stock state.

---

# 10. Phase 06 — Categories, units, barcodes and product packaging

## Objective

Implement the catalog structures signaled by `FamilleProduit`, `SOUS_FAMILLE`, `Unité`, `CodeBarre`, and `Liste_code_barre`.

## Implement

- category/family;
- subcategory/subfamily;
- unit of measure;
- one or more product barcodes;
- preferred barcode;
- optional pack/box conversion;
- validation of conversion factors.

## Business rules

A barcode identifies a purchasable/sellable product representation.

If multiple barcodes are supported, all must resolve deterministically to one product/pack representation.

Pack quantity must be positive.

Do not silently convert units when the conversion is ambiguous.

## Tests

- Product can be found by any registered barcode.
- Duplicate barcode assignment is rejected.
- Pack conversion is mathematically reversible where required.
- Selling a box updates the underlying stock quantity correctly.
- Invalid conversion factors are rejected.

## Exit gate

Barcode lookup and unit conversion can be consumed by sales, purchases, inventory and delivery modules without duplicating logic.

---

# 11. Phase 07 — Pricing and tariffs

## Objective

Implement Dolisoft-style multiple price levels without making the product record explode into dozens of columns.

## Implement

- named price lists/tariffs;
- customer-specific or customer-class pricing;
- product-specific prices;
- optional pack price;
- validity dates if required;
- explicit priority/resolution rules.

## Price resolution order

Use one deterministic resolver, for example:

```text
Explicit line override
        ↓
Customer + product price
        ↓
Customer tariff + product
        ↓
Product default sale price
```

The exact final hierarchy must be documented in tests.

## Business rules

The price used on a posted document becomes historical data on that line. Later tariff changes must not rewrite old documents.

Discounts should be represented explicitly, not by overwriting the original catalog price invisibly.

## Tests

Create several tariffs.

Resolve customer-specific price.

Change tariff after an invoice and verify old invoice remains unchanged.

Test discount calculations, rounding and tax interactions.

## Exit gate

One price-resolution service exists and all future sales flows use it.

---

# 12. Phase 08 — Warehouses / depots / locations

## Objective

Turn the distributor's physical stock locations into first-class entities.

## Implement

- warehouses/depots;
- optional bins/shelves/locations;
- active/inactive state;
- warehouse-specific product availability;
- transfer relationships.

Do not yet invent elaborate warehouse robotics.

## Business rules

A stock quantity is scoped to a product + warehouse (+ lot/serial/location when applicable).

A transfer is not a stock overwrite; it is a pair of linked movements.

## Tests

- Create multiple warehouses.
- Same product can exist in multiple warehouses.
- Warehouse deletion is blocked when historical stock movements reference it.
- Invalid transfer destinations rejected.

## Exit gate

Inventory can now represent the distributor's depot model.

---

# 13. Phase 09 — Stock ledger and stock movement engine

## Objective

Build the most important engine in the entire application.

Do not let individual screens directly modify stock quantities.

## Implement

A stock movement ledger containing, at minimum:

- product;
- warehouse/location;
- quantity delta;
- unit;
- movement type/reason;
- source document/entity;
- lot/serial when applicable;
- timestamp;
- user;
- cancellation/reversal link if applicable.

Expose domain operations such as:

```text
receiveStock()
issueStock()
adjustStock()
transferStock()
reverseStockMovement()
getAvailableStock()
getStockLedger()
```

## Core invariant

```text
Current stock = sum(posted stock movements)
```

Do not let “current quantity” become an independently editable source of truth.

A cached quantity may be used for performance later, but the source-of-truth ledger must remain recoverable.

## Tests

- Receipt increases stock.
- Issue decreases stock.
- Transfer decreases one warehouse and increases another atomically.
- Failed transaction changes neither side.
- Duplicate posting does not duplicate movements.
- Stock cannot go negative unless the product configuration explicitly permits it.
- Reversal creates compensating movement.

## Exit gate

No later business module is allowed to manipulate inventory by directly assigning a quantity.

---

# 14. Phase 10 — Lots, expiry dates and serial support

## Objective

Implement the lot subsystem indicated by the demo package without forcing every product to use lots.

## Implement

- lot identity;
- supplier/batch reference where useful;
- expiry date;
- product association;
- stock quantity per lot;
- optional serial-number support;
- FEFO/FIFO policy hooks where required.

## Business rules

A lot belongs to one product.

Expired inventory should have an explicit status/availability policy.

Serial-controlled items cannot be sold twice with the same serial.

Do not automatically consume the “oldest” lot unless the selected inventory policy requires that behavior.

## Tests

- Receive two lots and sell from the correct selected lot.
- Expired lot behavior is enforced according to policy.
- Serial duplicate is rejected.
- Lot reversal restores the correct lot.

## Exit gate

Lots are integrated into the stock ledger rather than bolted onto the UI.

---

# 15. Phase 11 — Customers, suppliers and credit accounts

## Objective

Implement a proper `Tiers`/party model suitable for both customers and suppliers.

## Implement

- party identity;
- party type/roles;
- contact data;
- address;
- tax/fiscal identifiers where legally needed;
- customer price tariff;
- credit limit;
- payment terms;
- active state;
- balance calculation;
- notes.

A party may potentially be both customer and supplier without duplicating identity records.

## Business rules

A customer's balance must come from posted receivable/payment events, not a manually edited balance field.

Credit-limit checks should be centralized.

An explicit override should require permission and be audited.

## Tests

- Create customer.
- Create supplier.
- Party can occupy both roles.
- Credit limit blocks or warns according to policy.
- Payment changes balance exactly once.
- Historical documents remain attached to party after profile edits.

## Exit gate

All future commercial documents reference the same canonical party model.

---

# 16. Phase 12 — Generic commercial document engine

## Objective

Create the document backbone corresponding conceptually to `Document` + `LigneDocument` + specialized invoice records.

This phase does not implement every document type yet.

## Implement

Document header:

- document ID;
- document number;
- document type;
- party;
- source document;
- date;
- warehouse;
- status;
- totals snapshot;
- notes;
- user;
- creation/posting timestamps.

Document lines:

- product;
- description snapshot;
- quantity;
- unit;
- unit price snapshot;
- discount;
- tax classification/rate snapshot where appropriate;
- line total;
- lot/serial allocation if needed.

## State machine

At minimum support a controlled progression resembling:

```text
DRAFT
  ↓
CONFIRMED
  ↓
POSTED
  ↓
CANCELLED / REVERSED
```

Not every document needs every state, but transitions must be explicit.

## Critical rule

The system must distinguish:

- document existence;
- document posting;
- stock posting;
- payment posting.

Do not assume that creating a draft invoice changes stock.

## Tests

- Create draft.
- Edit draft.
- Confirm.
- Post.
- Reject illegal transitions.
- Cancel/reverse according to rules.
- Historical totals remain stable after product price changes.

## Exit gate

There is one generic, testable document lifecycle service that later sales/purchases can reuse.

---

# 17. Phase 13 — Sales workflow

## Objective

Implement the distributor's primary sale lifecycle.

## Document types

Support the required subset of:

- quotation/devis;
- sales order;
- delivery note/BL;
- invoice;
- proforma.

## Workflow

Suggested model:

```text
Quotation
   ↓ optional conversion
Order
   ↓ fulfillment
Delivery Note
   ↓ invoicing
Invoice
```

Allow supported direct paths where the business requires them.

## Business rules

- Quote does not change stock.
- Order does not consume stock unless an explicitly configured reservation model is introduced.
- Delivery note posts stock issue.
- Invoice posts receivable.
- Combining multiple delivery notes into one invoice is allowed when requirements call for it.
- Conversion creates explicit source-document links.
- Quantities cannot be invoiced twice.
- Returns cannot silently modify the original invoice.

## Totals

Centralize calculation of:

- subtotal;
- line discounts;
- document discounts;
- taxes;
- stamp/fiscal amounts when applicable;
- grand total;
- paid amount;
- remaining balance.

## Tests

Test the full lifecycle.

Especially test:

1. create quote;
2. convert to order;
3. fulfill partially;
4. create BL;
5. post stock issue;
6. invoice the BL;
7. payment;
8. verify customer balance;
9. verify stock;
10. verify audit trail.

Also test failed invoice/posting transactions for zero partial writes.

## Exit gate

Sales can be run end-to-end without directly manipulating stock or balance from the UI.

---

# 18. Phase 14 — Purchases and receiving

## Objective

Implement supplier-side commercial operations and stock intake.

## Implement

- purchase quotation/order if needed;
- supplier delivery/receipt;
- supplier invoice;
- purchase lines;
- cost snapshot;
- payment/credit linkage;
- warehouse receiving.

## Business rules

A purchase receipt posts stock exactly once.

Supplier invoice creates the appropriate payable/party event when that accounting mode is enabled.

Received quantity and invoiced quantity must be separately representable if partial workflows are required.

## Tests

- Purchase order to receipt.
- Partial receipt.
- Multi-line receipt.
- Lot assignment on receiving.
- Failed receipt transaction.
- Duplicate receive attempt.
- Supplier balance after invoice/payment.

## Exit gate

The stock pipeline now works in both directions: supplier → warehouse and warehouse → customer.

---

# 19. Phase 15 — Returns, cancellation and reversal engine

## Objective

Build safe correction workflows before money and logistics become harder to reconcile.

## Implement

- customer return;
- supplier return;
- document cancellation;
- stock reversal;
- payment reversal where allowed;
- reason codes;
- links between original and compensating records.

## Rules

Never delete a posted business event to “undo” it.

A reversal must point to what it reverses.

Do not permit a reversal larger than the remaining reversible quantity/value.

## Tests

- Full customer return.
- Partial customer return.
- Supplier return.
- Double-return rejection.
- Cancellation of unpaid invoice.
- Cancellation/reversal of paid invoice under defined rules.
- Audit contains reason.

## Exit gate

The system can correct mistakes without corrupting history.

---

# 20. Phase 16 — Payments, receivables and cash

## Objective

Implement `VersementTiers`-style payment behavior and operational cash.

## Implement

- payment methods;
- cash accounts;
- cash sessions/opening balance/closing balance;
- customer receipts;
- supplier payments;
- allocations against invoices;
- unallocated/on-account payments when required;
- payment reversal;
- cash movements;
- remaining receivable/payable.

## Business rules

A payment cannot be applied twice.

Allocation totals cannot exceed available payment amount.

Payment reversal must undo its allocation effects atomically.

Cash-session totals must reconcile with recorded cash transactions.

## Tests

- Full payment.
- Partial payment.
- Multi-invoice allocation.
- On-account payment.
- Payment reversal.
- Duplicate submission.
- Cash opening/closing.
- Cash discrepancy report.

## Exit gate

Sales, purchases, payments and balances reconcile end-to-end.

---

# 21. Phase 17 — Expenses and operational cash

## Objective

Implement the operational expense layer corresponding to `Charge` / `TypeCharge` concepts.

## Implement

- expense categories;
- expense record;
- amount/date/payment method;
- linked employee/supplier/customer where appropriate;
- notes/reference;
- cash impact;
- optional tax/fiscal classification field.

## Business rules

An expense is not a stock movement unless explicitly categorized as such.

Cash-paid expenses reduce the relevant cash account atomically.

Deleting a historical expense should be replaced by reversal/correction according to policy.

## Tests

- Create cash expense.
- Create non-cash expense if supported.
- Reject invalid amount.
- Verify cash reconciliation.
- Reverse expense.

## Exit gate

Operational cash can be explained from sales receipts, supplier payments, expenses and adjustments.

---

# 22. Phase 18 — Inventory counting and reconciliation

## Objective

Create a formal stock-count workflow instead of manual quantity editing.

## Implement

- count session;
- counted quantity;
- expected system quantity;
- variance;
- review/approval;
- adjustment posting;
- reason code;
- audit.

## Business rules

Count entry itself does not change stock.

Only approved count variance posts adjustment movements.

Every variance requires a reason/category.

## Tests

- Count equal to expected → zero adjustment.
- Count lower → negative adjustment.
- Count higher → positive adjustment.
- Approval required before posting.
- Duplicate approval prevented.
- Audit captured.

## Exit gate

Physical inventory reconciliation is controlled, explainable and reversible.

---

# 23. Phase 19 — Distributor delivery domain

## Objective

Build the area where our app should differentiate from a generic Dolisoft clone.

## Core entities

- driver;
- vehicle/truck;
- route;
- route stop;
- delivery assignment;
- delivery status;
- delivery notes/proof references;
- collections made during delivery where applicable.

## Suggested states

```text
PLANNED
  ↓
LOADED
  ↓
OUT_FOR_DELIVERY
  ↓
DELIVERED

or

FAILED
CANCELLED
PARTIAL
RETURNED
```

## Business rules

A route stop must reference a customer/location.

A delivery cannot be completed without satisfying required completion checks.

A failed delivery must have a reason.

Delivered quantities must reconcile to loaded/ordered quantities according to the selected policy.

## Tests

- Create route.
- Add stops.
- Assign driver/vehicle.
- Assign sales documents.
- Transition route states legally.
- Reject illegal state transitions.
- Record failed delivery with reason.

## Exit gate

Delivery is represented as a proper business process rather than a note on an order.

---

# 24. Phase 20 — Truck loading and route fulfillment

## Objective

Integrate inventory with the physical truck operation.

There are two possible architectural approaches:

### Model A — Truck is a stock location

The truck has its own inventory scope.

### Model B — Truck loading is a controlled reservation/dispatch event

The warehouse remains authoritative and a loading record tracks what physically leaves the warehouse.

Choose based on the existing customer workflow and performance requirements, but do not implement both as competing sources of truth.

## Recommended direction

Represent trucks as inventory-capable locations only if the customer truly manages stock on the truck as stock.

Otherwise use a dispatch/loading ledger linked to warehouse stock movements.

## Business rules

Loading decreases warehouse availability exactly once.

Unloading/returning goods creates explicit reverse movements.

Route completion must not magically change warehouse stock without a corresponding business event.

## Tests

- Load planned quantities.
- Attempt to load unavailable stock.
- Partial loading.
- Cancel loading before dispatch.
- Return unused stock.
- Verify warehouse totals + truck totals.

## Exit gate

Physical logistics and database stock cannot silently diverge.

---

# 25. Phase 21 — Delivery collections and settlement

## Objective

Handle payments or collections made by drivers during route execution when required.

## Implement

- payment collected by driver;
- customer invoice allocation;
- receipt reference;
- cash/transfer/card method;
- end-of-route settlement;
- outstanding collection report;
- discrepancy handling.

## Business rules

A driver-collected payment must have a clear custodian/location until settled.

Settlement must be idempotent.

A driver should not be able to silently alter the amount of an already posted customer payment.

## Tests

- Collect exact invoice amount.
- Partial collection.
- Multiple invoices in route.
- End-route settlement.
- Missing cash / discrepancy.
- Duplicate sync/submission.

## Exit gate

The full physical cycle works:

```text
Warehouse → Truck → Customer → Payment → Settlement
```

---

# 26. Phase 22 — Import, export and migration from the old Depot database

## Objective

Move actual customer data into the new model without losing history.

## Work sequence

1. Inventory old tables.
2. Map old fields to canonical entities.
3. Build staging/import tables.
4. Import master data.
5. Import historical documents where feasible.
6. Import/opening stock.
7. Import balances.
8. Reconcile counts and totals.
9. Record source IDs for traceability.
10. Produce migration report.

## Migration rules

Never migrate directly into production tables without staging when the source is ambiguous.

Every imported record should have either:

- a source-system identifier;
- or a documented deterministic mapping key.

Duplicate handling must be explicit.

## Reconciliation checklist

At minimum compare:

- customer count;
- supplier count;
- product count;
- warehouse count;
- opening stock quantities/value where available;
- order count;
- invoice count;
- payment totals;
- outstanding balances.

## Tests

Run migration repeatedly on a disposable copy and verify deterministic results.

Run migration twice and ensure it does not duplicate imported business records when idempotency is expected.

## Exit gate

A migration can be executed, audited and reconciled without touching the customer's original source database destructively.

---

# 27. Phase 23 — Printing and document snapshots

## Objective

Make printed documents dependable after business rules are stable.

The UI itself is not the priority here; the business requirement is that a posted document has a stable printable representation.

## Implement

Support the needed output forms for:

- quotation;
- order;
- delivery note;
- invoice;
- purchase receipt;
- payment receipt;
- stock movement/count document;
- barcode labels where required.

## Critical rule

Printing must render from **posted document data/snapshots**, not current product/customer values fetched in a way that can rewrite historical output.

## Tests

Create a historical invoice.

Change the customer's address/product price.

Reprint the historical invoice.

Verify business-critical historical values remain identical.

## Exit gate

Printed history is stable and traceable.

---

# 28. Phase 24 — Reporting and dashboards

## Objective

Build reports on top of posted data rather than embedding business calculations in every screen.

## Required report families

### Sales

- sales by date;
- customer;
- product;
- salesperson/user;
- route;
- document type;
- gross/net/tax totals;
- discounts;
- margin where cost data is available.

### Receivables

- customer balance;
- overdue amounts;
- payment history;
- aging.

### Inventory

- current stock;
- stock valuation;
- movement history;
- low-stock products;
- lot/expiry;
- warehouse comparison.

### Purchasing

- purchases by supplier/product/date;
- received vs ordered;
- supplier balances.

### Delivery

- route completion;
- failed deliveries;
- quantity delivered;
- customer collection totals;
- driver/vehicle performance.

### Cash

- opening/closing;
- receipts;
- payments;
- expenses;
- adjustments;
- discrepancies.

## Business rule

Reports must clearly distinguish:

- draft/unposted data;
- posted operational data;
- cancelled/reversed records.

Do not casually include drafts in financial totals.

## Tests

Seed known transactions with predictable totals.

Compare reports against independently calculated expected results.

Test filters by date/warehouse/customer/product.

Verify reversals are represented correctly.

## Exit gate

Core operational reports reconcile exactly with transactional data.

---

# 29. Phase 25 — Fiscal year / exercise and accounting event layer

## Objective

Add the accounting/fiscal structure indicated by `Exercice`, journal entities, charges and zakat without coupling the whole app to full double-entry accounting immediately.

## Implement first

- fiscal year/exercise;
- posting period constraints;
- accounting event records generated from operational transactions;
- journal identification;
- journal operation references;
- charge categories;
- configurable fiscal classifications where legally needed.

## Important architecture

Operational domain remains authoritative:

```text
Sale posted
   ↓
Operational stock / receivable events
   ↓
Accounting event generated
```

Not:

```text
Accounting row edited manually
   ↓
Somehow infer sale/stock later
```

## Business rules

Closed fiscal periods reject ordinary posting.

Corrections in closed periods require an explicit controlled process.

Accounting events must be traceable to their source business transaction.

## Tests

- Open fiscal year.
- Post transaction in open period.
- Reject transaction in closed period.
- Reverse transaction and verify accounting-event relationship.
- Verify source-document traceability.

## Exit gate

The application has a reliable boundary between operational commerce and future full accounting functionality.

---

# 30. Phase 26 — Advanced/reference modules: production, repair and HR

## Objective

Only after the distributor core is stable, decide which of the remaining Dolisoft concepts belong in this customer's product.

The reverse report identifies evidence for:

- `Nomenclature` / BOM;
- `Production`;
- production lines/journal lines;
- `Appareil`;
- `Atelier`;
- repair records;
- employees;
- attendance;
- leave/absence;
- payroll.

## Critical decision rule

Do not automatically implement every one of these just because Dolisoft contains them.

For this customer, prioritize modules that produce direct operational value.

### Recommended default

Production: **only if the distributor manufactures/assembles products.**

Repair/workshop: **only if the customer actually repairs equipment.**

Full payroll: **only if the customer specifically requires payroll inside this system.**

Basic employee/driver management: likely already relevant and may be retained independently.

## Tests

Each selected advanced module must have its own bounded test suite and must not compromise the core sales/stock invariants.

## Exit gate

Advanced features are either implemented, explicitly deferred, or rejected for documented business reasons.

---

# 31. Phase 27 — Performance, resilience, concurrency and offline hardening

## Objective

Make the system safe for real distributor workload rather than merely correct on small demo data.

## Performance targets

Benchmark at realistic volumes, not toy data:

- thousands of products;
- thousands/tens of thousands of sales lines;
- many customers;
- years of stock movements;
- large payment history;
- multiple warehouses;
- route histories.

## Required checks

- indexed searches;
- product/barcode lookup latency;
- customer search;
- document loading;
- report generation;
- transaction throughput;
- WAL/locking behavior if used;
- long-running queries;
- database file growth;
- backup duration;
- restore duration.

## Concurrency tests

Test repeated user actions:

- double Enter;
- double click;
- rapid payment submission;
- two posting attempts;
- two stock transfers;
- simultaneous customer edits where relevant;
- interrupted transaction/process crash.

## Idempotency

Every critical command should have a strategy for preventing duplicate business events.

Examples:

```text
postSale(commandId)
recordPayment(commandId)
loadTruck(commandId)
completeDelivery(commandId)
receivePurchase(commandId)
```

The exact mechanism can be an operation key, unique business constraint, or transactional state transition.

## Offline / sync

If a mobile/offline driver app is later introduced, this phase establishes the conflict/idempotency rules before syncing is attempted.

## Tests

Run fault-injection tests where practical:

- crash after header insert;
- crash before stock movement;
- crash after stock movement;
- repeated command;
- malformed IPC payload;
- database lock;
- interrupted migration.

Expected outcome: either the complete business transaction exists or none of it exists, except for deliberately modeled pending/outbox states.

## Exit gate

The application behaves predictably under repeated input, process interruption and realistic data volume.

---

# 32. Phase 28 — Final migration, acceptance, security and release

## Objective

Move from engineering environment to customer-ready release without turning the first live deployment into the test environment.

## Final migration process

The release migration must be rehearsed on a fresh copy of the customer's real data.

Produce:

- pre-migration backup;
- migration log;
- row/count reconciliation;
- balance reconciliation;
- stock reconciliation;
- document totals reconciliation;
- post-migration backup;
- rollback procedure.

## Acceptance scenarios

Run realistic full-business scenarios:

### Scenario A — Purchase to sale

Supplier → purchase → receipt → stock → customer order → BL → invoice → payment.

### Scenario B — Partial fulfillment

Large customer order → partial delivery → remaining order → final invoice.

### Scenario C — Return

Sale → delivery → return → stock restoration → financial adjustment.

### Scenario D — Route operation

Warehouse → truck loading → route → customer delivery → collection → return/settlement.

### Scenario E — Inventory discrepancy

Expected stock → physical count → variance → approval → adjustment.

### Scenario F — Failure safety

Repeated clicks / interrupted process / duplicate posting → no duplicate stock or payment events.

## Security checks

- IPC authorization;
- permission enforcement in main/business layer;
- path validation for imports/exports/backups;
- database file permissions;
- sensitive configuration handling;
- audit logging;
- backup integrity;
- restore verification.

## Release gate

Do not release until:

- all phase test gates are green;
- migration is rehearsed;
- critical business scenarios pass;
- backups restore;
- database integrity checks pass;
- no known critical stock/payment duplication bugs remain;
- the customer workflow can be explained from business documents and reports.

---

# 33. Mandatory test strategy for every phase

Every phase should use a layered test structure.

## Layer 1 — Unit tests

Test pure business calculations and state transitions.

Examples:

- price resolution;
- totals;
- discount calculations;
- tax calculations;
- document transitions;
- credit checks;
- stock availability;
- payment allocation.

## Layer 2 — Database integration tests

Test the real SQLite schema and transaction behavior.

Do not mock SQLite for critical persistence invariants.

## Layer 3 — Business-flow tests

Run a complete realistic command sequence.

For example:

```text
createProduct
createCustomer
createOrder
postDelivery
postInvoice
recordPayment
```

Then query the resulting stock, balance and audit rows.

## Layer 4 — Regression tests

Run everything implemented by prior phases.

A new phase must not break an earlier phase.

## Layer 5 — Manual smoke test

Launch the application and perform the smallest meaningful user flow.

This catches IPC/UI wiring defects that pure domain tests may miss.

---

# 34. Required invariant suite

This suite must survive for the entire project.

## Stock invariant

For each product/location/lot scope:

```text
on-hand = sum(posted movement deltas)
```

Any cached quantity must reconcile to the ledger.

## Sales invariant

Every posted stock-impacting sale has exactly one corresponding stock-posting event unless the business model explicitly supports staged fulfillment.

## Payment invariant

Every payment has one source event and zero or more allocations whose sum does not exceed the payment's available amount.

## Document invariant

Posted documents cannot be directly mutated in a way that rewrites historical financial facts.

## Numbering invariant

Document numbers follow one controlled numbering service and are unique within the configured scope.

## Cancellation invariant

Cancellation/reversal creates an explicit compensating record.

## Audit invariant

Sensitive business operations can be traced to a user/time/source operation.

## Transaction invariant

A multi-table business operation either commits completely or leaves no partial state.

## Idempotency invariant

Repeating the same business command does not create duplicate business effects.

---

# 35. Special adversarial test matrix

The coding agent should repeatedly test the situations most likely to create silent corruption.

| Test | Expected result |
|---|---|
| Double-click Post Sale | One sale only |
| Double Enter on payment | One payment only |
| Two simultaneous sale posts | One succeeds or both serialize safely; no duplicate stock |
| Invoice fails after document insert | Entire transaction rolls back or enters an explicit pending state |
| Stock issue fails | Invoice/stock state remains consistent |
| Payment fails after allocation starts | No partial allocation |
| Duplicate barcode | Rejected |
| Duplicate document number | Rejected or transaction safely retried |
| Return twice | Second return rejected or limited to remaining quantity |
| Cancel twice | Second cancellation rejected/idempotently ignored |
| Transfer source insufficient | Nothing changes |
| Transfer DB failure midway | Both sides unchanged |
| Expired lot sale | Block/warn according to defined policy |
| Inactive product new sale | Rejected unless explicitly allowed |
| Closed fiscal period post | Rejected |
| Unauthorized IPC call | Rejected by main/domain layer |
| Renderer sends malformed quantity | Validation rejects it |
| Database opened with foreign keys off | Application turns them on or refuses to operate |
| Restore bad backup | Restore rejected before replacing live DB |
| Migration interrupted | No half-migrated production DB |

This matrix should grow as new defects are discovered.

---

# 36. Coding-agent output contract after each phase

At the end of each phase, the coding agent must produce a machine-readable and human-readable summary similar to:

```text
PHASE: 09
NAME: Stock Ledger
STATUS: PASS

IMPLEMENTED:
- ...

DATABASE:
- migrations/009_....sql
- new tables: ...
- new indexes: ...

CODE:
- ...

TESTS ADDED:
- ...

TEST COMMANDS:
- ...

TEST RESULT:
- X passed
- X failed

INVARIANTS CHECKED:
- stock balance: PASS
- duplicate posting: PASS
- rollback: PASS

REGRESSION:
- existing suite: PASS
- app launch: PASS

KNOWN LIMITATIONS:
- ...

NOT IMPLEMENTED (belongs to later phases):
- ...

NEXT PHASE:
- Phase 10
```

The agent must not claim PASS if tests were skipped.

---

# 37. How the coding agent should handle an unexpectedly large phase

A phase is deliberately bounded, but real codebases sometimes make a phase larger than expected.

When this happens:

1. Do not silently expand into later phases.
2. Split the current phase into `Pxx.a`, `Pxx.b`, etc. **before** making unrelated changes.
3. Keep each subphase testable.
4. Do not change the published dependency order.

Example:

```text
Phase 13 — Sales
  13.a document creation
  13.b document conversion
  13.c stock-posting delivery notes
  13.d invoicing
  13.e sales regression/invariants
```

This is preferable to a single giant autonomous run.

---

# 38. How the coding agent should handle uncertainty in the Dolisoft report

The reverse-requirements report deliberately identifies three evidence classes:

- directly observed installer facts;
- publicly advertised functionality;
- engineering inference.

When implementing an inferred behavior, the coding agent must not pretend that the vendor's exact internal implementation is known.

Instead:

1. implement the business capability;
2. choose a clean local design;
3. document the assumption;
4. write a test that captures the chosen behavior;
5. mark any unresolved uncertainty for review.

The objective is **functional equivalence where useful**, not forensic imitation of private source code.

---

# 39. What should explicitly NOT be rebuilt in the early phases

Do not spend early token budget on:

- pixel-perfect Dolisoft UI cloning;
- matching colors/fonts/icons;
- reproducing installer behavior;
- reverse-engineering private binary internals;
- copying report templates exactly;
- decorative dashboards;
- marketing pages;
- cloud infrastructure that is not currently required;
- full accounting double-entry logic before operational transactions are stable;
- HR/payroll unless the customer asks for it;
- manufacturing/repair modules unless the customer needs them.

The first objective is:

> **correct products + stock + customers + commercial documents + payments + delivery operations.**

Everything else is downstream.

---

# 40. What should be preserved from the existing Depot project

The agent should actively look for reusable pieces rather than assuming everything is disposable.

Likely reusable areas include:

- current Electron shell;
- database initialization;
- existing customer/product data structures;
- vehicle/truck data;
- delivery concepts;
- Arabic RTL conventions;
- import/export helpers;
- existing printing hooks;
- current backup behavior;
- packaging scripts;
- existing tests.

However, code should be reused only when its behavior is compatible with the new domain model.

Do not preserve a flawed architecture merely because it already exists.

---

# 41. Recommended internal module boundaries

A clean implementation could converge toward something similar to:

```text
src/
  main/
    ipc/
    security/
    db/
    migrations/

  domain/
    products/
    pricing/
    parties/
    inventory/
    documents/
    sales/
    purchases/
    returns/
    payments/
    cash/
    expenses/
    logistics/
    delivery/
    reporting/
    fiscal/
    audit/

  application/
    commands/
    queries/

  infrastructure/
    printing/
    import/
    export/
    backup/

  renderer/
    ...
```

The exact directory layout may differ from the existing project. The architectural separation matters more than the directory names.

---

# 42. Command/query separation

For important business operations, favor explicit commands over arbitrary renderer SQL.

Examples:

```text
createProduct
updateProduct
setProductBarcode
createPriceList
createCustomer
createPurchaseOrder
receivePurchase
createSalesOrder
createDeliveryNote
postInvoice
cancelDocument
recordPayment
reversePayment
transferStock
createInventoryCount
approveInventoryAdjustment
createRoute
loadTruck
completeDelivery
settleRouteCash
```

Queries can include:

```text
getProduct
searchProducts
getAvailableStock
getStockLedger
getCustomerBalance
getOpenInvoices
getRoute
getRouteStops
getSalesReport
getInventoryReport
```

The distinction matters because commands change state while queries should not.

---

# 43. Database design principles

The final SQLite database should favor explicit normalized transactional records.

Avoid:

```text
transactions(type, giant_json_blob, everything)
```

Prefer specialized tables linked by IDs and documented invariants.

The system will likely need families such as:

```text
products
product_categories
product_units
product_barcodes
price_lists
price_list_items
parties
party_roles
warehouses
stock_movements
lots
serial_numbers
documents
document_lines
payments
payment_allocations
cash_accounts
cash_sessions
cash_transactions
expenses
routes
route_stops
deliveries
inventory_counts
inventory_count_lines
audit_log
fiscal_years
accounting_events
```

Exact schema should follow the reverse-requirements report and current-repository findings rather than being blindly copied from this planning document.

---

# 44. Data retention and deletion policy

Business records have different lifecycles.

### Master data

Products/customers can usually be deactivated rather than deleted when historical references exist.

### Draft documents

May be deleted according to permissions and policy.

### Posted documents

Must be retained and corrected via controlled cancellation/reversal.

### Payments

Must be retained with reversal/correction records.

### Stock movements

Must be retained because they explain current stock.

### Audit records

Must be append-only from normal application operations.

This policy should be encoded in tests, not left as a UI convention.

---

# 45. Money and rounding standard

Before the sales/payment phases, choose one explicit representation.

Recommended options for a small desktop application:

- integer minor units where currency precision is fixed; or
- decimal-safe representation using integer scaling.

Do not use unconstrained JavaScript floating-point arithmetic for financial comparisons.

Define:

- currency precision;
- line rounding;
- document rounding;
- tax rounding;
- discount ordering;
- payment allocation rounding.

Write canonical tests for all of them.

---

# 46. Date/time standard

Use a single persistence convention.

Recommended:

- database stores UTC or a clearly defined neutral timestamp representation;
- UI converts to local Algerian time for display where appropriate;
- business dates such as document date and fiscal period date are not confused with timestamps.

Do not allow different modules to invent different date formats.

---

# 47. Migration strategy for major schema replacement

The safest strategy is **expand → migrate → verify → cut over**, not:

```text
DROP EVERYTHING
CREATE NEW DB
HOPE
```

Recommended sequence:

```text
Current DB
   ↓
Read-only snapshot
   ↓
Staging import
   ↓
Canonical new DB
   ↓
Automated reconciliation
   ↓
Human/business acceptance
   ↓
Cutover
```

The current database remains available until the new database proves it can reproduce the required business state.

---

# 48. Release branch/checkpoint strategy

Use one checkpoint after every green phase.

Suggested tags:

```text
phase-01-baseline
phase-02-vocabulary
phase-03-db-foundation
phase-04-audit-auth
phase-05-products
...
phase-28-release
```

A phase should not be tagged if its mandatory tests are red.

For high-risk phases, create a second database backup/checkpoint before migration.

---

# 49. Token and code-size management rules

This plan intentionally avoids asking the coding agent to “rewrite the whole application”.

The agent should process requirements in this order:

```text
Reference report
   ↓
Current repository inspection
   ↓
One phase
   ↓
Small implementation batch
   ↓
Tests
   ↓
Diff review
   ↓
Checkpoint
   ↓
Next phase
```

Do not generate huge speculative files “for later”.

Do not create empty modules for every future feature unless a real dependency requires a stable interface.

Keep migrations small.

Keep domain services cohesive.

Keep tests close to the behavior they protect.

---

# 50. Recommended first implementation sequence in practical terms

Although there are 28 phases, the practical critical path is only a few major milestones.

## Milestone A — Safe foundation

Phases 01–04.

Outcome:

```text
Current app safe
+ deterministic SQLite migrations
+ transactions
+ audit
+ authorization primitives
```

## Milestone B — Inventory foundation

Phases 05–10.

Outcome:

```text
Product
+ barcode/unit
+ pricing
+ warehouse
+ stock ledger
+ lots
```

## Milestone C — Commercial engine

Phases 11–18.

Outcome:

```text
Customers
+ documents
+ sales
+ purchases
+ returns
+ payments
+ cash
+ expenses
+ inventory counts
```

## Milestone D — Distributor advantage

Phases 19–21.

Outcome:

```text
Routes
+ trucks
+ loading
+ deliveries
+ collections
+ settlement
```

## Milestone E — Operational maturity

Phases 22–25.

Outcome:

```text
Migration
+ printing
+ reporting
+ fiscal/accounting event layer
```

## Milestone F — Optional/advanced

Phases 26–28.

Outcome:

```text
Selected advanced modules
+ hardening
+ acceptance
+ production release
```

---

# 51. First three phases should be exceptionally conservative

The most important strategic choice is **not** to start by coding the giant feature list.

Phase 01 proves that the existing project can be recovered.

Phase 02 prevents semantic chaos.

Phase 03 gives the application a migration/transaction foundation.

Only then should real business-domain replacement begin.

If the coding agent wants to skip these because they look “boring”, that is exactly when it should not be allowed to proceed.

---

# 52. Suggested instruction to give the coding agent together with these files

The following can be used as the execution instruction when passing the two documents to the coding agent:

```text
You are implementing an existing Electron + JavaScript + SQLite distributor/depot-management application.

Read these two files before making any changes:

1. Dolisoft_PRO_12_3_Detailed_Reverse_Requirements_Report.md
2. Dolisoft_PRO_12_3_Phased_Implementation_Plan.md

The first file is the functional/business requirements reference.
The second file is the mandatory implementation sequence.

Do not attempt to rewrite the whole application in one run.

Work one phase at a time, beginning with Phase 01.

Before coding each phase:
- inspect the current repository;
- identify the exact existing files/modules affected;
- inspect the current database schema;
- reconcile the phase requirements with the current implementation.

During a phase:
- implement only that phase;
- preserve existing functionality unless replacement is required;
- use SQLite as the source of truth;
- use transactions for multi-record business operations;
- keep business logic in testable JavaScript services;
- keep authorization in the main/domain layer, not only the renderer;
- never silently rewrite posted historical records;
- never create a covert second sales/accounting ledger;
- do not copy proprietary source code, assets, or branding from Dolisoft.

At the end of the phase:
- run the full existing test suite;
- run the new phase tests;
- run the relevant invariant/reconciliation checks;
- launch the application and perform a smoke test;
- inspect the diff for accidental scope creep;
- report exactly what changed;
- report exactly which tests passed/failed;
- explicitly list anything deferred to later phases.

Do not continue to the next phase if the current phase's mandatory tests are failing.

If a phase is unexpectedly too large, split it into bounded subphases rather than expanding scope.

Do not delete or overwrite the original customer data during migration work. Always work from backups/copies until reconciliation is complete.

The final product should reproduce the required commercial/warehouse business capabilities described in the reverse requirements report while remaining a clean, maintainable JavaScript + SQLite distributor application.
```

---

# 53. Final implementation philosophy

The goal is **not**:

> “Make our app look like Dolisoft.”

The goal is:

> “Take the useful commercial business model revealed by Dolisoft, implement it cleanly in our own JavaScript/SQLite architecture, and preserve the distributor-specific logistics that make our application more useful to this customer.”

The highest-risk areas are not buttons or screens.

They are:

1. **stock correctness**;
2. **document lifecycle correctness**;
3. **payment/balance correctness**;
4. **returns/reversals**;
5. **duplicate submission/idempotency**;
6. **migration correctness**;
7. **delivery/truck stock reconciliation**.

Therefore the implementation order gives those areas the most engineering discipline.

A beautiful UI built on corrupt stock/payment logic is worthless.

A plain UI backed by correct business transactions is the foundation of a commercial product.

---

# 54. Phase completion checklist

Before declaring any phase complete, the coding agent must be able to answer **YES** to all applicable questions:

```text
[ ] Did I implement only this phase?
[ ] Did I inspect the current code before changing it?
[ ] Did I preserve existing working functionality?
[ ] Did I add/update the SQLite migration correctly?
[ ] Did I use transactions where the business operation requires atomicity?
[ ] Did I validate inputs in the authoritative business layer?
[ ] Did I add tests for normal behavior?
[ ] Did I add tests for invalid behavior?
[ ] Did I add tests for rollback/partial-failure behavior where relevant?
[ ] Did I test duplicate/repeated input where relevant?
[ ] Did I run all previous tests?
[ ] Did I manually smoke-test the application?
[ ] Did I verify database integrity?
[ ] Did I review the diff for accidental scope creep?
[ ] Did I document assumptions?
[ ] Did I document deferred work?
[ ] Did I create a recovery/checkpoint after the phase?
```

If any mandatory item is **NO**, the phase is not complete.

---

# 55. Bottom line

Use the reverse-requirements report as the **what**.

Use this plan as the **how and when**.

Do not send the coding agent into the entire 3,000-line requirements document with an instruction like “implement everything.” That is exactly how a large agent run starts making incompatible schema decisions, duplicating logic, and eventually becoming impossible to debug.

The 28-phase model creates a controlled sequence:

```text
SAFE BASELINE
    ↓
DOMAIN FOUNDATION
    ↓
DATABASE FOUNDATION
    ↓
PRODUCTS / PRICING
    ↓
INVENTORY
    ↓
CUSTOMERS
    ↓
COMMERCIAL DOCUMENTS
    ↓
SALES / PURCHASES
    ↓
RETURNS
    ↓
PAYMENTS / CASH
    ↓
INVENTORY CONTROL
    ↓
DELIVERIES / TRUCKS
    ↓
MIGRATION
    ↓
PRINTING / REPORTING
    ↓
FISCAL LAYER
    ↓
OPTIONAL ADVANCED MODULES
    ↓
HARDENING
    ↓
FINAL ACCEPTANCE
```

Every arrow is a checkpoint.

Every checkpoint has tests.

Every phase leaves the application in a recoverable state.

That is the structure that makes a large rewrite manageable.
