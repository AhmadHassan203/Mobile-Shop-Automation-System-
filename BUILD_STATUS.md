# Build Status

**Last updated:** 2026-07-16 (Returns module complete)

**Evidence rule:** Only checks actually executed are described as passing.

## Returns / warranty module — complete and Ready

The Returns/Refunds vertical slice is a real, permission-aware browser workflow
backed by PostgreSQL. Migration `0013_returns_foundation` (forward-only) adds the
`returns`/`return_lines`/`refunds` tables, narrows the `guard_sale_after_draft`
trigger so a posted sale may only advance within the returned family (financial
snapshots stay immutable as a DB backstop), repairs runtime privileges across
Catalog/Inventory/Purchasing/Sales/Demand/Returns, and preserves the append-only
and no-hard-delete protections. `POST /returns/{id}/post` runs one Serializable
transaction: idempotency + `FOR UPDATE` locks, authoritative money/quantity
recompute, INSERT-only restock movements (serialized units → `returned_inspection`),
balanced ledger reversal, receivable credit, sale status transition and audit.

Endpoints (all tenant + branch scoped, response-validated through shared Zod):
`GET /returns`, `GET /returns/eligibility`, `POST /returns`, `GET /returns/{id}`,
`POST /returns/{id}/post` (idempotency-key), `POST /returns/{id}/exchange`
(intentionally deferred — stable CONFLICT). Permissions: `returns.view`,
`returns.create`, `returns.approve` (+`payments.collect`).

Executed evidence (this checkpoint): all migrations `0001`→`0013` rehearsed clean
from an empty schema on the disposable `mobileshop_test` database (ownership
repaired to the migrator role first), seeded, and `migrate diff` reports
**No difference**. Gates: typecheck (5 packages), lint (0 warnings), unit
**backend 272 / frontend 338 / shared 543**, **database integration 111/111**,
**backend HTTP+service integration 335/335** (incl. `returns.e2e-spec.ts`: a real
full-lifecycle return of a posted sale asserting balanced ledger, restock,
receivable credit, sale→`returned`, idempotency replay, window-override,
quantity-exceeds-sold and cross-tenant isolation), production build (all routes),
and **authenticated browser Playwright** `returns-workspace.spec.ts` **3/3** (login
→ real `GET /returns` queue → honest empty state → intake drawer → real
`GET /returns/eligibility`). Browser e2e ran against the app pointed at the
disposable test database; no owner development data was touched.

## Current outcome

Product Catalog, Stock Inventory, Purchasing, Suppliers and Goods Receipts are
real browser workflows. Catalog supports complete category, brand, model and
variant management. Stock exposes derived balances, serialized units, the
append-only movement ledger and stock locations, plus permission-aware
adjustment, reservation, release, transfer and serialized lifecycle actions.
Purchasing supports supplier management, purchase-order lifecycles, partial
receiving, bulk serialized identifiers, landed costs and receipt/payable
reconciliation. All use tenant-scoped PostgreSQL-backed APIs.

- frontend: `http://localhost:3000/login`
- catalog workspace: `http://localhost:3000/inventory`
- stock workspace: `http://localhost:3000/stock`
- purchasing workspace: `http://localhost:3000/purchases`
- backend readiness: `http://localhost:4000/api/v1/health/ready`

Nothing is hard-deleted. No fake stock, IMEI, cost, price, sales, demand or KPI
value is displayed anywhere. Inventory remains honest: stock appears only when
a real goods receipt or controlled inventory action creates it. Pricing remains
unavailable.

The sidebar now lists the complete prototype module roadmap. API-backed working
workflows are labelled **Ready**. Prototype-aligned frontend modules whose APIs
are still missing are clickable and labelled **Building**. Later modules remain
visible but disabled as **Planned**, so the UI never pretends an unsafe write is
available.

## Prototype-aligned frontend expansion

The production frontend now has visible routes for the prototype's next major
modules:

- `/` — owner dashboard with the prototype's six analytics tiles, ranked
  attention queue, recent-sales table, demand/buying analytics, digital-service
  analytics and today's tasks. Existing Catalog/Inventory/Purchasing attention
  uses live API data; missing Sales/Demand/Finance/Digital metrics display an
  explicit pending value instead of copied prototype numbers.
- `/sell` — the complete POS surface: Find → Select → Cart → Customer → Payment
  → Review → Complete, with real Catalog/Inventory discovery and safe blocking
  where Pricing, Customer, Payment and Sales-posting APIs are absent.
- `/customers` and `/demand` — prototype KPI, filters, tables, profile/detail,
  add/capture drawers, relationship history and follow-up/sales action layouts.
- `/returns`, `/repairs` and `/used-intake` — prototype quality gates, KPI rows,
  return tables, repair Kanban, quarantine/clearance areas, intake/processing
  drawers and controlled workflow previews.
- `/finance` and `/closing` — prototype finance KPIs, P&L, digital earnings,
  cash/bank, receivables/payables, expense table/drawer, reconciliation ladder,
  counted cash, variance, sign-off, tender split, activity, drilldowns and final
  confirmation preview.
- `/digital/new`, `/digital/history`, `/digital/balances`,
  `/digital/commission` and `/digital/reconciliation` — the prototype's full
  external-service transaction, history, float, earnings and reconciliation
  surfaces, including service-specific fields, filters/tables, balance warnings,
  permission-aware controls and review-impact previews.
- `/intelligence` — the prototype budget meter, engine disclosure and complete
  13-column recommendation surface with expandable reasons, risks, supplier and
  decision controls.
- `/reports` — the range/trend structure, digital KPI row and all 18 prototype
  report definitions across eight groups, including preview and export layouts.
- `/tasks` — the prototype task KPIs, owner summary, filters, priority groups,
  jump links and add/detail drawer workflows.
- `/settings` — all five prototype configuration tabs: Shop/Branches,
  Users/Roles/Permissions, Price Bands, Reorder formula/weights and
  Policies/Backup/Audit, plus role and formula-impact overlays.
- `/status` — the authenticated runtime and API readiness screen previously at
  `/`.

Every missing backend boundary is stated in the UI. No prototype record, sale,
customer, money amount, KPI or identifier was copied into production, and final
state-changing actions without real APIs remain disabled.

Current integrated frontend evidence: **26 test files / 247 tests passed**,
typecheck passed, lint passed with zero warnings, production build generated all
23 listed application routes, and live HTTP checks returned 200 for every route.
Backend readiness also returned 200 after the frontend build.

## Slice 4 — Purchasing frontend and receiving safety complete

`/purchases` provides permission-aware, URL-backed Purchase Orders, Suppliers
and Goods Receipts tabs. Users can create and maintain suppliers, draft/edit
orders, move orders through allowed lifecycle transitions, inspect receipt
history and post physical deliveries into stock.

Receiving sends a UUID idempotency key required by the backend. If the network
response is interrupted, the drawer preserves and locks the exact submitted
payload and safely retries it with the same key. The backend either replays the
original receipt or rejects a changed payload, preventing duplicate stock,
movements and payables.

Executed frontend evidence: **16 files / 203 tests passed**, typecheck passed,
lint passed with zero warnings, production build passed, and live `/login` and
`/purchases` requests returned HTTP 200. Backend readiness also returned 200.
The PostgreSQL development schema has **10 applied migrations** and is up to
date; no database was reset.

## Clean handoff checkpoints

```text
5612852 Make goods receipt retries idempotent
cf4bac0 Scope receiving locations to authenticated branch
498b2df Add durable goods receipt request identity
57016ff Preserve received identifier slots end to end
4490dfc Harden received identifier evidence
551f77c Harden Purchasing receipt authorization and costs
fecbb2a Slice 4: ship Purchasing backend and atomic receiving
b531e3c Slice 4: add strict Purchasing frontend data layer
5fcf6f6 Slice 4: establish Purchasing contracts and database truth
0f6b548 Slice 3: ship stock workspace and Inventory HTTP boundary
7222fe7 docs: record Slice 3 inventory state and what it still needs
d8cb357 Slice 3: inventory module — stock APIs over the movement ledger
44e7918 Slice 3: prove the inventory constraints against real PostgreSQL
eb5ca2c Slice 3: inventory foundation — contracts and migration 0007
0d5346c Slice 2: complete the product catalog management workflow
e390642 Slice 2: ship authenticated product catalog core
4366145 Slice 0/1: ship authenticated workspace foundation
```

## What this checkpoint added

### Shared contracts (`shared/src/catalog.ts`)

- `UpdateCategoryInputSchema`, `UpdateBrandInputSchema`,
  `UpdateProductModelInputSchema`, `UpdateProductInputSchema`.
- `CatalogVersionInputSchema` — the deactivate/reactivate body.
- `ProductDetailSchema` + `ProductAliasSchema` + `ProductBarcodeSchema`.
- A required `version` on all four response schemas.
- Create and update share one refinement, so they cannot drift apart.
- Updates use **replace semantics** (the whole editable identity is sent);
  `parentCategoryId` is required-but-nullable so "move to root" is deliberate
  and an omitted key can never mean "leave unchanged" to one side and "clear
  it" to the other.
- **9 files / 290 tests pass** (was 190).

### PostgreSQL — migration 0006

`database/prisma/migrations/20260716120000_0006_catalog_management`. Migration
`0005` was **not** edited. `0006` exists because Catalog completion genuinely
required schema the create-only slice could not express:

1. `categories`, `brands`, `product_models` gained `version` (`CHECK > 0`).
   `product_variants.version` already existed from `0005`.
2. `categories` gained `CHECK parent_category_id IS DISTINCT FROM id` and a
   cycle-rejecting trigger. The trigger takes a per-organization transaction
   advisory lock first, because two concurrent re-parents can each look acyclic
   and still commit a cycle between them.
3. `product_aliases` and `product_barcodes` gained `is_active`, and their
   unconditional unique indexes became **partial** (`WHERE is_active`).
   Reason: those tables are hard-delete protected, so an unconditional unique
   index meant a mistyped barcode was burned inside the organization forever.
   Rows are now **retired**, never deleted — the protection is preserved, not
   weakened.
4. `product_barcodes` gained `CHECK (NOT is_primary OR is_active)` so a retired
   barcode can never stay flagged primary.

Evidence:

- Prisma format, validate, generate pass.
- `migrate diff --from-migrations --to-schema` reports **no difference** (the
  shadow database applied all six migrations from scratch).
- `migrate deploy` applied `0006` to the disposable test database **first**, then
  to `mobileshop_dev`. **No database was reset.**
- **2 files / 32 real-PostgreSQL integration tests pass** (was 16).
- Directly proven against real PostgreSQL: the cycle trigger rejects
  self-parent, 2-level and 3-level cycles and does **not** false-positive on a
  legitimate deep chain; a retired barcode/alias frees its value for reuse while
  a duplicate active one is rejected; hard delete is still refused (`42501`).

Prisma cannot express partial indexes, so `@@unique` was removed from
`ProductAlias`/`ProductBarcode` in the datamodel and the rule now lives only in
SQL. This is documented inline in `schema.prisma`.

### Backend — 13 new routes

| Endpoint                                              | Permission           |
| ----------------------------------------------------- | -------------------- |
| `PATCH /api/v1/catalog/categories/{id}`               | `catalog.update`     |
| `POST /api/v1/catalog/categories/{id}/deactivate`     | `catalog.deactivate` |
| `POST /api/v1/catalog/categories/{id}/activate`       | `catalog.update`     |
| `PATCH /api/v1/catalog/brands/{id}`                   | `catalog.update`     |
| `POST /api/v1/catalog/brands/{id}/deactivate`         | `catalog.deactivate` |
| `POST /api/v1/catalog/brands/{id}/activate`           | `catalog.update`     |
| `PATCH /api/v1/catalog/product-models/{id}`           | `catalog.update`     |
| `POST /api/v1/catalog/product-models/{id}/deactivate` | `catalog.deactivate` |
| `POST /api/v1/catalog/product-models/{id}/activate`   | `catalog.update`     |
| `GET /api/v1/products/{id}`                           | `catalog.view`       |
| `PATCH /api/v1/products/{id}`                         | `catalog.update`     |
| `POST /api/v1/products/{id}/deactivate`               | `catalog.deactivate` |
| `POST /api/v1/products/{id}/activate`                 | `catalog.update`     |

Correctness and security properties:

- Optimistic locking is an **atomic conditional write** — a single
  `updateMany({ where: { id, organizationId, version } , data: { version: { increment: 1 } } })`,
  not a read-then-write race. `count === 0` becomes `OPTIMISTIC_LOCK_FAILED`.
- Unknown id, or an id from another organization, returns `NOT_FOUND` — existence
  elsewhere is never leaked.
- `trackingType` changes always return `CATALOG_TRACKING_TYPE_LOCKED`; re-sending
  the stored value is a no-op. See the decision note below.
- Category parent must exist, be in the caller's organization and be active.
  Self-parent and cycles are rejected by an in-transaction ancestor walk (bounded
  at 64 hops) as a clean 422; the SQL trigger is a backstop, mapped to the same
  422 rather than leaking a 500.
- Alias/barcode edits are diffed against the stored active rows and **retired**,
  never deleted; retirement happens before insertion because the partial index
  counts only active rows; the old primary is cleared before the new one is set.
- Every mutation runs in one transaction and writes one audit event with safe
  before **and** after snapshots.
- **11 files / 83 unit tests pass** (was 53).

### Frontend

`/inventory` is a Catalog workspace with URL-backed tabs (Products, Categories,
Brands, Models), each with server-driven search, filters and pagination,
permission-aware actions, product detail, create/edit drawers, and inline
creation of a missing brand/category/model without leaving the product flow.

## Slice 3 — Inventory (API, HTTP boundary and browser workspace complete)

Migration `20260717000000_0007_inventory_foundation` adds `serialized_units`
(12-state machine), `device_identifiers` (IMEI/serial in ONE uniqueness
namespace), `stock_batches` (negative stock refused by the database), and the
append-only `inventory_movements` ledger (UPDATE/DELETE revoked). It extends the
pre-existing `stock_locations` from `0001` rather than duplicating it. Balances
are **derived** from the ledger and unit/batch rows — there is deliberately no
stored rollup to drift out of truth.

17 routes are live on `:4000`. Stock is never written directly: every quantity
change is a movement. Serialized state changes go through `isTransitionAllowed()`
and take a real `SELECT ... FOR UPDATE` row lock, so two users cannot take the
same IMEI.

`/stock` adds URL-backed Balances, Serialized units, Movements and Locations
tabs. Actions are shown only for the matching server permission. All responses
are parsed through strict shared contracts; no cost, price, tenant field or
fallback stock record is accepted.

Evidence: shared **474** tests, backend unit **145**, backend HTTP integration
**223**, frontend **170**, database real-PostgreSQL **58**, lint/typecheck and
production build green. A live Playwright flow logged in, loaded every Stock tab
from the real API, and logged out. Balances, movements and units remain honestly
empty; the configured `SHOP` location is real.

**Not done:** location configuration is read-only in this first Stock UI.
Purchasing receiving now creates real units/batches and inventory movements.

## Decisions recorded (not invented rules)

- **Tracking type is locked on update, unconditionally.** `05_RULES` §2 says it
  cannot change once transactions exist. The Inventory slice does not exist, so
  the API cannot ask whether transactions exist. An "allow now, block later" path
  would silently become wrong the day Slice 3 lands, so the existing
  `CATALOG_TRACKING_TYPE_LOCKED` code is returned for any change.
- **Barcode/alias maintenance is part of `PATCH /products/{id}`**, not the
  separate routes the API map proposed. It keeps an identity edit atomic and
  auditable as one event, and the proposed `DELETE .../barcodes/{id}` is
  impossible anyway under the no-hard-delete protection.
- **Deactivation does not cascade.** No source specifies a cascade, so none was
  invented. Reactivation requires the parent/brand/category/model to be active,
  which mirrors the already-shipped create-time checks.

## Database migrations

| Migration                                              | Development | Disposable test         | Production     |
| ------------------------------------------------------ | ----------- | ----------------------- | -------------- |
| `20260715164914_0001_identity_and_access`              | Applied     | Rehearsed               | Not configured |
| `20260715235500_0002_runtime_schema_privileges`        | Applied     | Rehearsed               | Not configured |
| `20260715235600_0003_runtime_object_privileges`        | Applied     | Rehearsed               | Not configured |
| `20260716003000_0004_auth_evidence_and_user_integrity` | Applied     | Rehearsed               | Not configured |
| `20260716014200_0005_catalog_core`                     | Applied     | Rehearsed from clean DB | Not configured |
| `20260716120000_0006_catalog_management`               | Applied     | Applied first           | Not configured |
| `20260717000000_0007_inventory_foundation`             | Applied     | Applied first           | Not configured |
| `20260717120000_0008_purchasing_foundation`            | Applied     | Applied first           | Not configured |
| `20260717180000_0009_received_identifier_evidence`     | Applied     | Applied first           | Not configured |
| `20260717190000_0010_goods_receipt_idempotency`        | Applied     | Applied first           | Not configured |

No development or production database was reset. Owner data is intact: the
owner-created product (`PH-BRAND-VARIANT`, variant `256gb`) and the three seeded
references survived `0006` and were backfilled to `version = 1`.

## Remaining risks and scope

| ID       | Remaining item                                               | Impact                                             |
| -------- | ------------------------------------------------------------ | -------------------------------------------------- |
| AUTH-001 | Password change, user/role admin, ScopeGuard absent          | Slice 1 remains incomplete                         |
| AUTH-002 | Trusted reverse-proxy/client-IP policy not configured        | Production proxy/rate-limit confidence pending     |
| CAT-002  | Pricing is intentionally absent                              | Must be built before POS                           |
| CAT-003  | `GET /api/v1/products/search` counter-speed lookup not built | POS needs it                                       |
| INV-004  | Stock location editor UI is not exposed yet                  | API exists; current Locations tab is read-only     |
| CON-008  | Docker unavailable locally                                   | Container/volume/proxy evidence must run elsewhere |
| ENV-002  | Local Node 25 is outside Prisma-supported release lines      | Repeat release gates on supported Node 24 LTS      |

## Next smallest executable work

1. Pricing and counter-speed product search, then POS.
2. Customer management and customer demand.
3. Finish Slice 1: password change, user/role administration and ScopeGuard.
