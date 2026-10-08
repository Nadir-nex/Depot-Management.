# Advanced/Reference Modules Decision (Phase 26)

Date: 2026-10-08

## Context
Phase 26 evaluates remaining Dolisoft concepts for inclusion in this customer's product.
The core distributor functionality (sales, stock, purchases, deliveries, cash, fiscal) is complete through Phase 25.

## Source Database Evidence
- `employees` table exists but is **empty** (0 rows)
- `employee_roles`, `employee_phones` tables exist but empty
- `vehicles` table exists (maps to our `fleet_vehicles`)
- No production/BOM (`nomenclature`), repair (`atelier`, `appareil`), or payroll data

## Decision Matrix

| Module | Decision | Rationale |
|--------|----------|-----------|
| **Production / BOM / Nomenclature** | **DEFERRED** | Customer is a pure distributor, no manufacturing/assembly operations. No evidence in source data. |
| **Repair / Workshop / Atelier / Appareil** | **DEFERRED** | No repair/service business line. Source has no repair records. |
| **Full Payroll** | **DEFERRED** | No requirement for payroll calculation, payslips, tax declarations. Source employees table empty. |
| **Basic Employee/Driver Management** | **RETAINED** | Already implemented as `drivers` + `fleet_vehicles` (Phases 19-21). Covers delivery crew tracking, vehicle assignment, route linkage. Sufficient for distributor operations. |

## Implementation Status

**Already Implemented (Phases 19-21):**
- `drivers` table: code, name, phone, active status
- `fleet_vehicles` table: registration, capacity, active status
- Route assignment: drivers + vehicles linked to routes
- Stop completion: driver records collected amounts at handover
- Settlement reconciliation (Phase 21): driver/vehicle performance reports

**No Additional Implementation Required:**
- The existing driver/vehicle model satisfies the distributor's operational needs
- No HR module (attendance, leave, payroll) needed per business requirements
- Source data confirms no historical employee data to migrate

## Future Consideration Triggers
Revisit only if customer explicitly requests:
- Production: "we now assemble kits" → evaluate BOM + work orders
- Repair: "we service equipment" → evaluate work orders + parts consumption
- Payroll: "calculate salaries in-system" → evaluate payroll engine + compliance

## Exit Gate
✅ Advanced features explicitly deferred with documented business reasons.
✅ Core distributor functionality uncompromised.
✅ Driver/vehicle management retained as sufficient employee tracking.
