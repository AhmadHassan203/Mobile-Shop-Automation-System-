# Build Status

**Last updated:** 2026-07-16 03:20 PKT

**Evidence rule:** Only checks actually executed are described as passing.

## Current outcome

The Product Catalog is a complete production workflow. Slice 2 is functionally
done: categories, brands, product models and product variants can each be
listed, searched, filtered, paginated, created, edited, deactivated and
reactivated through real tenant-scoped PostgreSQL-backed APIs and a real
browser workspace.

- frontend: `http://localhost:3000/login`
- catalog workspace: `http://localhost:3000/inventory`
- backend readiness: `http://localhost:4000/api/v1/health/ready`

Nothing is hard-deleted. No fake stock, IMEI, cost, price, sales, demand or KPI
value is displayed anywhere. Inventory and pricing are explicitly labelled
unavailable until their real modules exist.

## Clean handoff checkpoints

```text
e390642 Slice 2: ship authenticated product catalog core
4366145 Slice 0/1: ship authenticated workspace foundation
```

This checkpoint completes the Catalog on top of `e390642`.

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

| Endpoint                                                | Permission           |
| ------------------------------------------------------- | -------------------- |
| `PATCH /api/v1/catalog/categories/{id}`                 | `catalog.update`     |
| `POST /api/v1/catalog/categories/{id}/deactivate`       | `catalog.deactivate` |
| `POST /api/v1/catalog/categories/{id}/activate`         | `catalog.update`     |
| `PATCH /api/v1/catalog/brands/{id}`                     | `catalog.update`     |
| `POST /api/v1/catalog/brands/{id}/deactivate`           | `catalog.deactivate` |
| `POST /api/v1/catalog/brands/{id}/activate`             | `catalog.update`     |
| `PATCH /api/v1/catalog/product-models/{id}`             | `catalog.update`     |
| `POST /api/v1/catalog/product-models/{id}/deactivate`   | `catalog.deactivate` |
| `POST /api/v1/catalog/product-models/{id}/activate`     | `catalog.update`     |
| `GET /api/v1/products/{id}`                             | `catalog.view`       |
| `PATCH /api/v1/products/{id}`                           | `catalog.update`     |
| `POST /api/v1/products/{id}/deactivate`                 | `catalog.deactivate` |
| `POST /api/v1/products/{id}/activate`                   | `catalog.update`     |

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

No development or production database was reset. Owner data is intact: the
owner-created product (`PH-BRAND-VARIANT`, variant `256gb`) and the three seeded
references survived `0006` and were backfilled to `version = 1`.

## Remaining risks and scope

| ID       | Remaining item                                                | Impact                                             |
| -------- | ------------------------------------------------------------- | -------------------------------------------------- |
| AUTH-001 | Password change, user/role admin, ScopeGuard absent           | Slice 1 remains incomplete                         |
| AUTH-002 | Trusted reverse-proxy/client-IP policy not configured         | Production proxy/rate-limit confidence pending     |
| CAT-002  | Pricing is intentionally absent                               | Must be built before POS                           |
| CAT-003  | `GET /api/v1/products/search` counter-speed lookup not built  | POS needs it                                       |
| INV-001  | Physical inventory, IMEIs, batches, balances, movements absent | Next core module                                   |
| CON-008  | Docker unavailable locally                                    | Container/volume/proxy evidence must run elsewhere |
| ENV-002  | Local Node 25 is outside Prisma-supported release lines       | Repeat release gates on supported Node 24 LTS      |

## Next smallest executable work

1. Slice 3 Inventory foundation, contracts and migration `0007` first:
   serialized units and device identifiers, quantity batches, stock locations,
   immutable movements, derived balances.
2. Finish Slice 1: password change, user/role administration, ScopeGuard.
3. Pricing, then POS.
