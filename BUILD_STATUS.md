# Build Status

**Last updated:** 2026-07-16 02:24 PKT

**Evidence rule:** Only checks actually executed are described as passing.

## Current outcome

The authenticated Product Catalog vertical is live locally:

- frontend: `http://localhost:3000/login`
- backend readiness: `http://localhost:4000/api/v1/health/ready`
- protected catalog route: `http://localhost:3000/inventory`

This checkpoint implements real tenant-scoped category, brand, product-model,
and product APIs backed by PostgreSQL. The browser provides real search,
filters, pagination, permission-aware navigation, and an Add Product drawer.
No fake stock, IMEI, cost, price, sales, or KPI data is shown.

Catalog core is a usable vertical slice, but it is not all of blueprint Slice 2.
Product detail/update/deactivation, standalone reference management, and pricing
remain future work. Slice 1 is also still partial because password change,
user/role administration, and ScopeGuard are not implemented.

## Clean handoff checkpoints

The latest committed checkpoint before this Catalog work is:

```text
4366145 Slice 0/1: ship authenticated workspace foundation
```

The current Catalog checkpoint is intended to be committed as one coherent
follow-up. Do not discard its work when switching between Codex and Claude.

## Verified implementation

### Shared contracts

- Strict public contracts exist for category, brand, product model, product
  create/list/search, references, and paginated responses.
- Tenant, cost, price, stock, IMEI, and reorder fields are absent from public
  Catalog inputs and outputs.
- SKU, barcode, alias, warranty, pagination, and Unicode normalization limits
  are shared by frontend and backend.
- Unicode-expanding derived slugs/canonical aliases are code-point bounded to
  their PostgreSQL widths.
- Lint, strict typecheck, and build pass.
- **9 files / 190 tests pass.**

### PostgreSQL and Prisma

Migration `20260716014200_0005_catalog_core` adds:

- `categories`
- `brands`
- `product_models`
- `product_variants`
- `product_aliases`
- `product_barcodes`
- Catalog enums, indexes, checks, composite tenant foreign keys, and no-hard-
  delete protections

Evidence:

- Prisma format, validate, generate, typecheck, and build pass.
- Migration-to-schema diff reports no difference.
- The disposable test database was reset and rebuilt from all five migrations.
- **2 files / 16 real-PostgreSQL integration tests pass.**
- Tests cover tenant isolation, uniqueness, warranty/SKU/barcode checks, exact
  shared maximum widths, primary barcode rules, runtime privileges, and legacy
  evidence protections.
- The seed ran twice against the disposable database: exactly one neutral
  category, one neutral brand, one neutral model, and zero products.
- Migration `0005` is applied to `mobileshop_dev`; migration status is current.
- Development seed added only `Smartphones`, `Unbranded`, and
  `Generic smartphone`. It seeded no product, price, stock, or transaction.

### Backend

Implemented and live:

| Endpoint                              | Permission       |
| ------------------------------------- | ---------------- |
| `GET /api/v1/catalog/categories`      | `catalog.view`   |
| `POST /api/v1/catalog/categories`     | `catalog.create` |
| `GET /api/v1/catalog/brands`          | `catalog.view`   |
| `POST /api/v1/catalog/brands`         | `catalog.create` |
| `GET /api/v1/catalog/product-models`  | `catalog.view`   |
| `POST /api/v1/catalog/product-models` | `catalog.create` |
| `GET /api/v1/products`                | `catalog.view`   |
| `POST /api/v1/products`               | `catalog.create` |

Security and correctness evidence:

- A global PermissionGuard merges class and method metadata and requires every
  grant resolved by the authenticated server context.
- A global Origin guard protects all browser unsafe methods while keeping safe
  methods and Origin-less CLI/native calls usable.
- Every Catalog query is scoped by the authenticated organization; no client
  organization ID is accepted.
- Product, aliases, barcodes, and complete safe audit snapshot are written in
  one transaction.
- Actual Prisma 7 duplicate errors map to stable 409 SKU/barcode codes.
- Response selects and schemas exclude price, cost, stock, IMEI, aliases,
  barcodes, reorder fields, and organization identifiers.
- Response-contract corruption is treated as an opaque server fault, not a
  caller validation error.
- Lint, strict typecheck, and production build pass.
- **11 files / 53 unit tests pass.**
- Existing backend HTTP integration remains green: **3 files / 23 tests.**

### Frontend

The production build and live standalone server include:

- `/inventory` Product Catalog route
- server-backed search, filters, pagination, loading, error, empty, and no-
  result states
- permission-aware Product Catalog navigation and Add Product action
- accessible Add Product drawer using exact shared validation limits
- honest separation between catalog identity and later inventory/pricing data
- API response validation with no mock fallback

Evidence:

- Lint and strict typecheck pass.
- Production build passes; `/inventory` is generated and live.
- **7 files / 47 frontend tests pass.**
- Catalog Playwright flow passes and its screenshot was manually inspected.
- The owner created one real development product through the live UI
  (`PH-BRAND-VARIANT`, variant `256gb`); it was preserved. This row did not
  come from the seed or automated tests.

### Live API and browser checks

The final compiled API was also run against the disposable test database and
verified through real HTTP and PostgreSQL:

- health 200, login 200, logout 204, unauthenticated Catalog 401
- category/brand/model/product list responses 200
- product create 201 and search match
- duplicate SKU 409 `CATALOG_SKU_DUPLICATE`
- duplicate barcode 409 `CATALOG_BARCODE_DUPLICATE`
- duplicate reference 409 `CONFLICT`
- smuggled tenant/financial/stock fields 422 `VALIDATION_FAILED`
- untrusted browser Origin 403 with zero product/audit rows
- Unicode-expanding 200-character brand/alias inputs persist within DB widths
- duplicate child write rolls back product and audit rows
- complete product audit snapshot has all 15 expected identity fields and no
  forbidden financial/tenant/stock/IMEI fields

The complete live Playwright suite passes **4/4**:

- health liveness
- PostgreSQL readiness
- login → protected workspace → logout → denied reuse
- login → Product Catalog → real references/Add drawer → logout

No active headless-test session remains.

## Latest workspace gate

Executed after the final security fixes:

| Gate                                               | Result     |
| -------------------------------------------------- | ---------- |
| Prettier format check                              | Pass       |
| Workspace lint                                     | Pass       |
| Workspace strict typecheck                         | Pass       |
| Shared tests                                       | 190 passed |
| Backend unit tests                                 | 53 passed  |
| Frontend tests                                     | 47 passed  |
| Database integration                               | 16 passed  |
| Backend HTTP integration                           | 23 passed  |
| Live Playwright                                    | 4 passed   |
| Shared/database/backend/frontend production builds | Pass       |
| `git diff --check`                                 | Pass       |

The monolithic `pnpm verify` build phase was not rerun while the live Next
standalone process held `.next`; the equivalent component builds and all other
workspace gates above were run successfully.

## Database migrations

| Migration                                              | Development | Disposable test         | Production     |
| ------------------------------------------------------ | ----------- | ----------------------- | -------------- |
| `20260715164914_0001_identity_and_access`              | Applied     | Rehearsed               | Not configured |
| `20260715235500_0002_runtime_schema_privileges`        | Applied     | Rehearsed               | Not configured |
| `20260715235600_0003_runtime_object_privileges`        | Applied     | Rehearsed               | Not configured |
| `20260716003000_0004_auth_evidence_and_user_integrity` | Applied     | Rehearsed               | Not configured |
| `20260716014200_0005_catalog_core`                     | Applied     | Rehearsed from clean DB | Not configured |

No development or production database was reset.

## Remaining risks and scope

| ID       | Remaining item                                                      | Impact                                             |
| -------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| AUTH-001 | Password/change flow, user/role admin, and ScopeGuard absent        | Slice 1 remains incomplete                         |
| AUTH-002 | Trusted reverse-proxy/client-IP policy not configured               | Production proxy/rate-limit confidence pending     |
| CAT-001  | Product detail/update/deactivate and reference-management UI absent | Catalog core usable; full Slice 2 incomplete       |
| CAT-002  | Pricing is intentionally absent                                     | Must be built before POS                           |
| INV-001  | Physical inventory, IMEIs, batches, balances, and movements absent  | Next core module                                   |
| CON-008  | Docker unavailable locally                                          | Container/volume/proxy evidence must run elsewhere |
| ENV-002  | Local Node 25 is outside Prisma-supported release lines             | Repeat release gates on supported Node 24 LTS      |

## Next smallest executable work

1. Commit this Catalog checkpoint.
2. Begin Slice 3 Inventory foundation with contracts and migration first:
   serialized units/device identifiers, quantity batches, stock locations,
   immutable movements, and derived balances.
3. Add real inventory list/receiving surfaces only after their APIs exist.
4. Continue remaining Slice 1 authorization/admin work in parallel without
   weakening the Catalog checkpoint.
5. Add product detail/update/deactivation and pricing in later Catalog work.
