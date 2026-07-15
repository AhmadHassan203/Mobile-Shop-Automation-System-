# API Module Map — Backend NestJS Modules to REST Endpoints

**Status of this document:** design map, not an implementation record.
**Generated:** 2026-07-15
**Authoritative sources read for this document:**

- `mobile-shop-automation-blueprint/13_PRODUCTION_MASTER_BUILD_PROMPT.md` (§1, §7, §8, §20, §22, §23, §25 — hereafter `13_`)
- `mobile-shop-automation-blueprint/03_ARCHITECTURE.md`
- `mobile-shop-automation-blueprint/01_PRD.md`
- `shared/src/permissions.ts` (implemented, verified green)
- `shared/src/errors.ts` (implemented, verified green)
- `shared/src/enums.ts`, `shared/src/constants.ts` (implemented, verified green)

---

## 0. How to read this document

### 0.1 Honesty rules applied here

No domain endpoint in this document is implemented. `backend/` **does exist on disk** as of 2026-07-15, containing the Slice 0 skeleton only: `main.ts`, `app.module.ts`, `config/` (`env.schema.ts` + `AppConfig`), `common/middleware/request-id.middleware.ts`, `common/filters/domain-exception.filter.ts`, `modules/health/` (controller + service + module), plus `vitest.config.ts` and unit/e2e test files. Verified by directory listing of the repository root: `.agents/`, `.claude/`, `.git/`, `backend/`, `docs/`, `mobile-shop-automation-blueprint/`, `node_modules/`, `prototype/`, `shared/`, `BUILD_STATUS.md`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.env.example`, `.gitattributes`, `.gitignore`. (`database/`, `frontend/`, `e2e/`, `infrastructure/`, `scripts/` and `.github/` are still absent, though `pnpm-workspace.yaml` already declares them.)

None of that Slice 0 code is **verified**: `backend/node_modules` is not installed, so `tsc -p backend/tsconfig.json --noEmit` currently fails at module resolution and no backend test has been executed (`BUILD_STATUS.md`: "The backend skeleton is in progress; no endpoint is live"). Per that file's rule, generated-but-unrun work is `In progress`, never `Complete`.

Every **Status** cell therefore reads `Not started`, except the foundation/Health concerns of Slice 0, which are `In progress`.

Three marks are used to separate what the blueprint states from what this map derives:

| Mark | Meaning |
| --- | --- |
| (no mark) | The base path is enumerated verbatim in `13_` §20. |
| ✱ | The path is **derived** by this document from a requirement stated elsewhere in the blueprint. `13_` §20 does not enumerate it. The Source column cites the requirement. |
| ⚠ GAP | A required decision has no source in the repository. Recorded as a gap, never invented. |

### 0.2 Column legend

| Column | Meaning |
| --- | --- |
| **Permission** | The exact key from `shared/src/permissions.ts`. No key is invented. `—` means no permission key is required (public or any-authenticated-user). Where the module needs a key that does not exist in `permissions.ts`, the cell says so and a ⚠ GAP is filed in §7. |
| **Txn** | `Yes` = the handler must run inside a single PostgreSQL transaction. `Yes §22` = the boundary is explicitly mandated by `13_` §22. |
| **Idem** | `Yes` = requires the `idempotency-key` header (`IDEMPOTENCY_KEY_HEADER` in `shared/src/constants.ts`). Cited to source where mandated; marked `Proposed` where this document recommends it without a source mandate. `—` = not applicable (safe/idempotent by method). |
| **Paging / filter / sort** | Support required by `13_` §20 ("pagination, filtering, searching, sorting"). Defaults are `PAGINATION` in `shared/src/constants.ts`: `DEFAULT_PAGE = 1`, `DEFAULT_PAGE_SIZE = 25`, `MAX_PAGE_SIZE = 100`. |

### 0.3 Global constants that bind every endpoint

Read from `shared/src/constants.ts` — these are already implemented and must not be re-declared in `backend/`:

| Constant | Value | Use |
| --- | --- | --- |
| `API_VERSION` | `'v1'` | The `/api/v1` prefix. |
| `REQUEST_ID_HEADER` | `'x-request-id'` | Correlation ID in/out on every request. |
| `IDEMPOTENCY_KEY_HEADER` | `'idempotency-key'` | Client-generated key on retryable writes. |
| `PAGINATION.DEFAULT_PAGE_SIZE` | `25` | List default. |
| `PAGINATION.MAX_PAGE_SIZE` | `100` | Hard cap; a client cannot request the whole table. |
| `LIMITS.MAX_SALE_LINES` | `200` | Rejects oversized carts. |
| `LIMITS.MAX_BULK_IMEI_ROWS` | `500` | Caps bulk IMEI paste. |
| `LIMITS.MAX_REASON_LENGTH` | `500` | Caps override/adjustment reasons. |
| `PERFORMANCE_TARGETS.PRODUCT_SEARCH_MS` | `500` | Product search budget (`01_PRD` §7). |
| `PERFORMANCE_TARGETS.SALE_POSTING_MS` | `2000` | Sale posting budget (`01_PRD` §7). |

---

## 1. Module structure under `backend/src/modules/`

`13_` §7 fixes the module list. `13_` §1 fixes the location (`backend/` at the repository root) and explicitly overrides `03_ARCHITECTURE.md` §3, which proposes a nested `mobile-shop-os/apps/api` monorepo — `13_` §1 rule 8 forbids "another duplicate `mobile-shop-os` root". `03_ARCHITECTURE.md` §4 lists a slightly different module set (`UsersAndRoles`, `Returns`, `Warranty`, `Repairs`, `Integrations`, and no `Locations`/`FinancialLedger`/`Settings`/`Health`); **`13_` §7 wins** under the precedence order in `13_` §2 (the master prompt is the latest explicit product-owner instruction, and `03_` sits below it).

### 1.1 Standard internal layout per module

Derived from `03_ARCHITECTURE.md` §4 ("Each module owns its application services, policies, repository interfaces and API endpoints") and `13_` §4 ("domain/application services", "Do not expose ORM models directly as public API contracts" — `13_` §20).

```text
backend/src/modules/<Module>/
├── <module>.module.ts          # NestJS module wiring
├── <module>.controller.ts      # HTTP boundary only: no business rules
├── application/                # use-case services, transaction orchestration
├── domain/                     # pure rules, state machines, invariants
├── dto/                        # request/response contracts (Zod, from shared/ where shared)
├── policies/                   # permission + scope decisions for this module
└── repositories/               # repository interfaces + Prisma implementations
```

### 1.2 Module list, base path, owning slice

Slice numbers are from `13_` §25. Where `13_` §25 does not name a slice for a module, the cell says so explicitly rather than guessing.

| # | Module | Base path(s) | Slice that builds it (`13_` §25) | Status |
| --- | --- | --- | --- | --- |
| 1 | `Auth` | `/api/v1/auth` | Slice 1 — Authentication and access | Not started |
| 2 | `Organizations` | `/api/v1/organizations` ✱ | Slice 1 ("organization") | Not started |
| 3 | `Branches` | `/api/v1/branches` ✱ | Slice 1 ("branch/location") | Not started |
| 4 | `Locations` | `/api/v1/locations` ✱ | Slice 1 ("branch/location") | Not started |
| 5 | `Users` | `/api/v1/users` | Slice 1 ("users") | Not started |
| 6 | `RolesAndPermissions` | `/api/v1/roles`, `/api/v1/permissions` | Slice 1 ("roles/permissions") | Not started |
| 7 | `Catalog` | `/api/v1/catalog`, `/api/v1/products` | Slice 2 — Catalog | Not started |
| 8 | `Pricing` | `/api/v1/pricing` ✱ | **`13_` §25 names no Pricing slice.** Price bands are catalog data (`01_PRD` §5.2 → Slice 2); minimum-margin enforcement is consumed by Slice 5 ("discounts"). Assigned: Slice 2 read model, Slice 5 enforcement. | Not started |
| 9 | `Customers` | `/api/v1/customers` | **`13_` §25 names no Customers slice.** Slice 5 requires "customer/walk-in"; Slice 9 requires demand linkage. Assigned: Slice 5. | Not started |
| 10 | `Demand` | `/api/v1/demand` | Slice 9 — Customer demand | Not started |
| 11 | `Suppliers` | `/api/v1/suppliers` | Slice 4 — Suppliers, purchasing and receiving | Not started |
| 12 | `Purchasing` | `/api/v1/purchases`, `/api/v1/goods-receipts` | Slice 4 | Not started |
| 13 | `Inventory` | `/api/v1/inventory`, `/api/v1/serialized-units` | Slice 3 — Inventory foundation | Not started |
| 14 | `Sales` | `/api/v1/sales` | Slice 5 — POS and sales | Not started |
| 15 | `Payments` | `/api/v1/payments` | Slice 5 ("payment/split payment") | Not started |
| 16 | `ReturnsAndExchanges` | `/api/v1/returns` | Slice 6 — Returns and exchanges | Not started |
| 17 | `ExternalServices` | `/api/v1/external-services`, `/api/v1/external-transactions` | Slice 7 — External services | Not started |
| 18 | `CashSessions` | `/api/v1/cash-sessions` | Slice 8 — Cash sessions and expenses | Not started |
| 19 | `Expenses` | `/api/v1/expenses` | Slice 8 | Not started |
| 20 | `Receivables` | `/api/v1/receivables` | Slice 10 — Finance and reporting | Not started |
| 21 | `Payables` | `/api/v1/payables` | Slice 4 ("payables") creates them; Slice 10 reports/settles them | Not started |
| 22 | `FinancialLedger` | `/api/v1/ledger` ✱ | Slice 10 ("financial ledger") | Not started |
| 23 | `Reporting` | `/api/v1/reports` | Slice 10; dashboard surface in Slice 12 | Not started |
| 24 | `Recommendations` | `/api/v1/recommendations` | Slice 11 — Reorder intelligence | Not started |
| 25 | `Notifications` | `/api/v1/notifications` ✱ | Slice 14 ("notification adapters"). `01_PRD` §6: "Initial notifications may be in-app." | Not started |
| 26 | `Documents` | `/api/v1/documents` ✱ | **`13_` §25 names no Documents slice.** `13_` §11 requires an "attachments adapter" for purchasing → assigned Slice 4. | Not started |
| 27 | `Audit` | `/api/v1/audit` | Slice 1 ("audit actor"); every subsequent slice writes events (`13_` §6 step 8) | Not started |
| 28 | `Settings` | `/api/v1/settings` | **`13_` §25 names no Settings slice.** Slice 7 requires fee-rule configuration; `application_settings` is required by `13_` §19. Assigned: Slice 0 (bootstrap read) / Slice 7 (write). | Not started |
| 29 | `Health` | `/api/v1/health` | Slice 0 — Audit and repository foundation ("logging, request IDs and health endpoints") | **In progress** |

**Deferred by `13_` §7:** used-device intake, warranty and repairs "may be implemented after the core operational system, behind feature flags". `03_ARCHITECTURE.md` §4 lists `Warranty` and `Repairs` as modules; they are **not** in `13_` §7 and are therefore **out of scope for this map** (Slice 14).

---

## 2. Endpoint tables per module

### 2.1 Auth — Slice 1

`13_` §8 requires: "secure password hashing", "secure HTTP-only session cookies or another approved secure session strategy", "logout and current-user endpoints", "session expiry", "rate limiting for authentication", "login-attempt audit", "reset-ready architecture".

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/v1/auth/login` | Authenticate; issue HTTP-only session cookie | — (public) | No | — | — | Not started |
| `POST /api/v1/auth/logout` | Destroy current session (`13_` §8) | — (authenticated) | No | — | — | Not started |
| `GET /api/v1/auth/me` | Current user + resolved permission keys + scope (`13_` §8) | — (authenticated) | No | — | — | Not started |
| `POST /api/v1/auth/password` ✱ | Change own password (`13_` §8 "reset-ready architecture"; the reset flow itself is not built) | — (authenticated) | No | — | — | Not started |

**Error codes owned** (all from `shared/src/errors.ts`, none invented): `AUTH_INVALID_CREDENTIALS` (401), `AUTH_SESSION_EXPIRED` (401), `AUTH_SESSION_INVALID` (401), `AUTH_USER_INACTIVE` (403), `AUTH_REQUIRED` (401), `AUTH_TOO_MANY_ATTEMPTS` (429). Statuses are the defaults in `DEFAULT_ERROR_STATUS`.

**Notes.** `POST /api/v1/auth/login` must return `AUTH_INVALID_CREDENTIALS` for both unknown-user and wrong-password so the endpoint does not enumerate accounts. Login attempts (success and failure) are appended to the audit log per `13_` §8; that append is a side effect of a non-transactional handler and must not be rolled back on a failed login. Password hashing uses `argon2 0.44.0` (verified pinned version).

### 2.2 Organizations — Slice 1

`13_` §3: "one business", "future multi-branch support in the data model". `01_PRD` §7 Scalability: include `organization_id` from the start.

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/organizations/current` ✱ | Read the operating organization | `settings.view` (⚠ GAP-01) | No | — | — | Not started |
| `PATCH /api/v1/organizations/current` ✱ | Update org profile/business settings | `settings.manage` (⚠ GAP-01) | No | Proposed | — | Not started |

### 2.3 Branches — Slice 1

`13_` §8: "The launch UI is single-branch. Do not add an unnecessary branch selector, but include branch/location keys in the correct database entities."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/branches` ✱ | List branches within the caller's scope | `settings.view` (⚠ GAP-01) | No | — | Page/size; filter `active`; sort `name` | Not started |
| `POST /api/v1/branches` ✱ | Create branch (multi-branch readiness) | `settings.manage` (⚠ GAP-01) | No | Proposed | — | Not started |
| `GET /api/v1/branches/{id}` ✱ | Branch detail | `settings.view` (⚠ GAP-01) | No | — | — | Not started |
| `PATCH /api/v1/branches/{id}` ✱ | Update branch | `settings.manage` (⚠ GAP-01) | No | Proposed | — | Not started |

### 2.4 Locations — Slice 1

`01_PRD` §5.4: "store, warehouse and virtual locations". `13_` §3: "one primary stock location at launch".

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/locations` ✱ | List stock locations in scope | `inventory.view` | No | — | Page/size; filter `branch_id`, `active`; sort `name` | Not started |
| `POST /api/v1/locations` ✱ | Create stock location | `settings.manage` (⚠ GAP-01) | No | Proposed | — | Not started |
| `GET /api/v1/locations/{id}` ✱ | Location detail | `inventory.view` | No | — | — | Not started |
| `PATCH /api/v1/locations/{id}` ✱ | Update location | `settings.manage` (⚠ GAP-01) | No | Proposed | — | Not started |

### 2.5 Users — Slice 1

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/users` | List users | `users.view` | No | — | Page/size; search `q` (name/email); filter `role`, `active`, `branch_id`; sort `name`, `created_at` | Not started |
| `POST /api/v1/users` | Create user + role + scope assignment | `users.create` | Yes (user + user_roles + user_scope_access + audit) | Proposed | — | Not started |
| `GET /api/v1/users/{id}` | User detail | `users.view` | No | — | — | Not started |
| `PATCH /api/v1/users/{id}` | Update user profile | `users.update` | No | Proposed | — | Not started |
| `POST /api/v1/users/{id}/deactivate` | Deactivate (never delete — history preserved) | `users.deactivate` | Yes (state + session revocation + audit) | Proposed | — | Not started |
| `POST /api/v1/users/{id}/activate` ✱ | Reactivate (`13_` §8 "user activation/deactivation") | `users.update` | No | Proposed | — | Not started |

**Notes.** `users.deactivate` must also invalidate live sessions, otherwise `AUTH_USER_INACTIVE` (403) is only enforced at next login — that would violate `13_` §8's intent. Password hashes are never returned by any endpoint (`13_` §27 "Do not expose ... secrets ... to normal users").

### 2.6 RolesAndPermissions — Slice 1

The role codes and default grants already exist in `shared/src/permissions.ts`: `ROLES` = `owner`, `manager`, `salesperson`, `cashier`, `purchaser`, `accountant`, `technician` (7 roles), and `DEFAULT_ROLE_PERMISSIONS` maps each to a frozen permission list. `13_` §8 lists six roles; `technician` is additionally required by `01_PRD` §4. The file comment records these as **seed defaults**, editable at runtime through this module.

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/roles` | List roles with grant counts | `roles.view` | No | — | Page/size; sort `code` | Not started |
| `GET /api/v1/roles/{code}` ✱ | Role detail with granted permission keys | `roles.view` | No | — | — | Not started |
| `POST /api/v1/roles` ✱ | Create a custom role | `roles.manage` | No | Proposed | — | Not started |
| `PUT /api/v1/roles/{code}/permissions` ✱ | Replace a role's permission grants | `roles.manage` | Yes (role_permissions rewrite + audit) | Proposed | — | Not started |
| `GET /api/v1/permissions` | List all permission keys (from `ALL_PERMISSIONS`) | `roles.view` | No | — | Filter `resource` prefix | Not started |
| `PUT /api/v1/users/{id}/roles` ✱ | Assign roles to a user | `roles.manage` | Yes (user_roles rewrite + audit) | Proposed | — | Not started |
| `PUT /api/v1/users/{id}/scopes` ✱ | Assign branch/location scope (`user_scope_access`, `13_` §19) | `roles.manage` | Yes (scope rewrite + audit) | Proposed | — | Not started |

**Notes.** `13_` §8 requires that the owner role retains full access; `DEFAULT_ROLE_PERMISSIONS[ROLES.OWNER]` is `ALL_PERMISSIONS`. Any role edit is a permission change and is therefore auditable per `03_ARCHITECTURE.md` §9. `PUT /api/v1/users/{id}/roles` and `.../scopes` are routed under the `users` path but are **owned by RolesAndPermissions**, which owns the `user_roles` and `user_scope_access` tables (see §6).

### 2.7 Catalog — Slice 2

`13_` §9: "A catalog variant is not a physical phone." Products without barcodes must remain searchable by SKU, model/name, brand, category and quick selection.

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/catalog/categories` ✱ | List categories/subcategories | `catalog.view` | No | — | Page/size; filter `parent_id`, `active`; sort `name` | Not started |
| `POST /api/v1/catalog/categories` ✱ | Create category | `catalog.create` | No | Proposed | — | Not started |
| `PATCH /api/v1/catalog/categories/{id}` ✱ | Update category | `catalog.update` | No | Proposed | — | Not started |
| `GET /api/v1/catalog/brands` ✱ | List brands | `catalog.view` | No | — | Page/size; search `q`; sort `name` | Not started |
| `POST /api/v1/catalog/brands` ✱ | Create brand | `catalog.create` | No | Proposed | — | Not started |
| `GET /api/v1/catalog/product-models` ✱ | List product models | `catalog.view` | No | — | Page/size; search `q`; filter `brand_id`, `category_id`; sort `name` | Not started |
| `POST /api/v1/catalog/product-models` ✱ | Create product model | `catalog.create` | No | Proposed | — | Not started |
| `GET /api/v1/products` | List/search variants (SKU, model, brand, category) | `catalog.view` | No | — | Page/size; search `q`; filter `brand_id`, `category_id`, `condition`, `tracking_type`, `active`, `pta_status`; sort `name`, `created_at` | Not started |
| `GET /api/v1/products/search` ✱ | Counter-speed lookup (`01_PRD` §7: <500 ms target) | `catalog.view` | No | — | Search `q`; `limit` capped by `PAGINATION.MAX_PAGE_SIZE` | Not started |
| `POST /api/v1/products` | Create variant (RAM/storage/color/region/warranty/PTA fields) | `catalog.create` | Yes (variant + barcodes + aliases + audit) | Proposed | — | Not started |
| `GET /api/v1/products/{id}` | Variant detail; cost fields only with `catalog.view_cost` | `catalog.view` | No | — | — | Not started |
| `PATCH /api/v1/products/{id}` | Update variant | `catalog.update` | No | Proposed | — | Not started |
| `POST /api/v1/products/{id}/deactivate` | Deactivate (never delete) | `catalog.deactivate` | No | Proposed | — | Not started |
| `POST /api/v1/products/{id}/barcodes` ✱ | Add a barcode (`13_` §9: "one or more barcodes") | `catalog.update` | No | Proposed | — | Not started |
| `DELETE /api/v1/products/{id}/barcodes/{barcodeId}` ✱ | Remove a barcode | `catalog.update` | No | — | — | Not started |
| `POST /api/v1/products/{id}/aliases` ✱ | Add alias/local spelling for demand matching | `catalog.update` | No | Proposed | — | Not started |

**Error codes owned:** `CATALOG_SKU_DUPLICATE` (409), `CATALOG_BARCODE_DUPLICATE` (409), `CATALOG_VARIANT_INACTIVE` (400), `CATALOG_TRACKING_TYPE_LOCKED` (400).

**Notes.** `tracking_type` is `serialized | quantity` (`TRACKING_TYPES` in `shared/src/enums.ts`) and the enums file records that it "Cannot change once transactions exist (05_RULES §2)" — `PATCH /api/v1/products/{id}` must therefore raise `CATALOG_TRACKING_TYPE_LOCKED` on any attempt to change it after movements exist. Cost visibility on `GET /api/v1/products/{id}` is field-level: `catalog.view_cost` is not granted to `salesperson` or `cashier` in `DEFAULT_ROLE_PERMISSIONS`, so the response shaper must strip cost, not merely hide it in the UI.

### 2.8 Pricing — Slice 2 (read model) / Slice 5 (enforcement)

`01_PRD` §5.2: "configurable price bands". `13_` §12: "minimum price/margin protection".

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/pricing/rules` ✱ | List price bands / min-margin rules | `pricing.view` | No | — | Page/size; filter `variant_id`, `category_id`, `active`; sort `effective_from` | Not started |
| `POST /api/v1/pricing/rules` ✱ | Create a price band / min-margin rule | `pricing.manage` | No | Proposed | — | Not started |
| `PATCH /api/v1/pricing/rules/{id}` ✱ | Update rule | `pricing.manage` | No | Proposed | — | Not started |
| `POST /api/v1/pricing/quote` ✱ | Server-side price/margin check for a prospective line | `pricing.view` | No | — | — | Not started |

**Error codes owned:** `SALE_BELOW_MIN_MARGIN` (400).

**Notes.** `pricing.override_min_margin` exists in `permissions.ts` and is granted **only to `owner`** in `DEFAULT_ROLE_PERMISSIONS` (it is absent from the manager, salesperson, cashier, purchaser, accountant and technician lists). It is consumed by Sales at posting time, not by a Pricing endpoint. `POST /api/v1/pricing/quote` is advisory only — `13_` §22 requires the authoritative recalculation to happen inside the sale-posting transaction ("Never rely on frontend totals").

### 2.9 Customers — Slice 5

`13_` §15: "Avoid unnecessary personal data and restrict sensitive fields."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/customers` | List/search customers | `customers.view` | No | — | Page/size; search `q` (name/phone); filter `has_receivable`, `active`; sort `name`, `created_at` | Not started |
| `POST /api/v1/customers` | Register a customer | `customers.manage` | No | Proposed | — | Not started |
| `GET /api/v1/customers/{id}` | Detail; CNIC/reference only with `customers.view_sensitive` | `customers.view` | No | — | — | Not started |
| `PATCH /api/v1/customers/{id}` | Update customer | `customers.manage` | No | Proposed | — | Not started |
| `GET /api/v1/customers/{id}/sales` ✱ | Sales history (`13_` §15) | `sales.view` | No | — | Page/size; filter date range; sort `posted_at` | Not started |
| `GET /api/v1/customers/{id}/external-transactions` ✱ | External transaction history (`13_` §15) | `external_services.view` | No | — | Page/size; filter date range; sort `created_at` | Not started |
| `GET /api/v1/customers/{id}/demand` ✱ | Demand requests (`13_` §15) | `demand.view` | No | — | Page/size; filter `status`; sort `created_at` | Not started |
| `GET /api/v1/customers/{id}/receivables` ✱ | Credit balance (`13_` §15) | `receivables.view` | No | — | Page/size; sort `due_date` | Not started |

**Notes.** Phone numbers are normalised via the implemented `shared/src/phone.ts` (PK E.164). `customers.view_sensitive` is granted **only to `owner`** in `DEFAULT_ROLE_PERMISSIONS`; reading a sensitive field is a sensitive data export and is auditable per `03_ARCHITECTURE.md` §9 ("data exports of sensitive information"). Walk-in sales carry no customer record (`13_` §12).

### 2.10 Demand — Slice 9

`13_` §15: capture in under 20 seconds; "Demand must remain usable even without a catalog match" (also `13_` §23 rule 17).

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/demand` | List demand requests | `demand.view` | No | — | Page/size; search `q` (raw request text); filter `status`, `outcome`, `urgency`, `channel`, `variant_id`, `matched`, date range; sort `created_at`, `follow_up_at` | Not started |
| `POST /api/v1/demand` | Quick capture — catalog match optional | `demand.create` | No | Proposed | — | Not started |
| `GET /api/v1/demand/{id}` | Demand detail + follow-up history | `demand.view` | No | — | — | Not started |
| `PATCH /api/v1/demand/{id}` | Update request / attach catalog match | `demand.manage` | No | Proposed | — | Not started |
| `POST /api/v1/demand/{id}/status` ✱ | Advance pipeline status | `demand.manage` | No | Proposed | — | Not started |
| `POST /api/v1/demand/{id}/follow-ups` ✱ | Record a follow-up (`13_` §15) | `demand.manage` | No | Proposed | — | Not started |
| `POST /api/v1/demand/{id}/convert` ✱ | Convert to catalog entry / quotation / reservation / supplier inquiry / sale (`13_` §15) | `demand.manage` | Yes (demand status + created target + audit) | Proposed | — | Not started |

**Notes.** Statuses come from `DEMAND_STATUSES` in `shared/src/enums.ts`: `new`, `contacted`, `sourcing`, `available`, `customer_notified`, `converted_to_sale`, `not_interested`, `closed`. Outcomes come from `DEMAND_OUTCOMES` (10 values incl. `unavailable`, `price_too_high`, `bought_elsewhere`). `13_` §15: "Duplicate requests must remain visible historically while forecast deduplication prevents artificial inflation" — deduplication is a **Reporting/Recommendations read-model concern**, never a delete or merge in this module. `DEMAND_CONVERSION_WEIGHTS` in `shared/src/constants.ts` (incl. `DUPLICATE_SAME_CUSTOMER: 0.15`) is the deduplication weighting input.

### 2.11 Suppliers — Slice 4

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/suppliers` | List/search suppliers | `suppliers.view` | No | — | Page/size; search `q`; filter `active`; sort `name`, `lead_time_days` | Not started |
| `POST /api/v1/suppliers` | Create supplier + contacts + payment terms | `suppliers.manage` | No | Proposed | — | Not started |
| `GET /api/v1/suppliers/{id}` | Supplier detail incl. lead time/reliability | `suppliers.view` | No | — | — | Not started |
| `PATCH /api/v1/suppliers/{id}` | Update supplier | `suppliers.manage` | No | Proposed | — | Not started |
| `GET /api/v1/suppliers/{id}/products` ✱ | Supplier product list + price history (`13_` §11) | `suppliers.view` | No | — | Page/size; filter `variant_id`; sort `last_quoted_at` | Not started |
| `POST /api/v1/suppliers/{id}/products` ✱ | Link a variant to a supplier with a price | `suppliers.manage` | No | Proposed | — | Not started |
| `GET /api/v1/suppliers/{id}/quotes` ✱ | Supplier quotations (`13_` §11 "where practical") | `suppliers.view` | No | — | Page/size; filter `variant_id`, date range; sort `quoted_at` | Not started |
| `POST /api/v1/suppliers/{id}/quotes` ✱ | Record a supplier quotation | `suppliers.manage` | No | Proposed | — | Not started |

### 2.12 Purchasing — Slice 4

`13_` §23 rule 5: "A PO does not create available stock." Rule 6: "Receiving creates available or controlled stock."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/purchases` | List purchase orders | `purchases.view` | No | — | Page/size; search `q` (PO number); filter `status`, `supplier_id`, `branch_id`, date range; sort `created_at`, `expected_at` | Not started |
| `POST /api/v1/purchases` | Create draft PO (does **not** touch stock) | `purchases.create` | Yes (PO + lines + audit) | Proposed | — | Not started |
| `GET /api/v1/purchases/{id}` | PO detail + received progress | `purchases.view` | No | — | — | Not started |
| `PATCH /api/v1/purchases/{id}` | Edit a `draft` PO (optimistic `version`) | `purchases.create` | No | Proposed | — | Not started |
| `POST /api/v1/purchases/{id}/approve` | Approval workflow (`13_` §11) | `purchases.approve` | Yes (status + audit) | Proposed | — | Not started |
| `POST /api/v1/purchases/{id}/order` ✱ | `approved` → `ordered` | `purchases.create` | Yes (status + audit) | Proposed | — | Not started |
| `POST /api/v1/purchases/{id}/cancel` ✱ | Cancel a PO (`01_PRD` §5.3 lifecycle) | `purchases.approve` | Yes (status + audit) | Proposed | — | Not started |
| `POST /api/v1/purchases/{id}/close` ✱ | Close a PO (`01_PRD` §5.3 lifecycle) | `purchases.approve` | Yes (status + audit) | Proposed | — | Not started |
| `GET /api/v1/goods-receipts` | List goods receipts | `purchases.view` | No | — | Page/size; filter `purchase_order_id`, `supplier_id`, date range; sort `received_at` | Not started |
| **`POST /api/v1/goods-receipts`** | **Receive stock — owns TXN-1 (§4)** | `purchases.receive` | **Yes §22** | **Proposed** (see §4 note) | — | Not started |
| `GET /api/v1/goods-receipts/{id}` | Receipt detail incl. landed-cost allocation | `purchases.view` | No | — | — | Not started |
| `POST /api/v1/purchases/{id}/returns` ✱ | Purchase return to supplier (`13_` §11) | `purchases.return` | Yes (unit/batch state + movement + payable + audit) | Proposed | — | Not started |

**Error codes owned:** `PURCHASE_ORDER_NOT_APPROVED`, `PURCHASE_ORDER_INVALID_STATUS`, `PURCHASE_RECEIVE_EXCEEDS_ORDERED`, `PURCHASE_SERIAL_COUNT_MISMATCH`, `PURCHASE_NEGATIVE_AMOUNT` (all 400 by default — none appear in `DEFAULT_ERROR_STATUS`, so they fall back to 400 per `DomainError`'s constructor). Receiving also surfaces `IMEI_DUPLICATE` (409) and `IMEI_INVALID` (400) raised by Inventory.

**Notes.** PO statuses are `PURCHASE_ORDER_STATUSES` in `shared/src/enums.ts`: `draft`, `approved`, `ordered`, `partially_received`, `received`, `closed`, `cancelled` — matching `01_PRD` §5.3. The receipt creates movements of type `purchase_receive` (`MOVEMENT_TYPES`, sign `+1` in `MOVEMENT_ON_HAND_SIGN`). `13_` §11: "Duplicate IMEI or another critical validation failure must safely roll back the affected receiving transaction" — the whole receipt rolls back, not the offending line.

### 2.13 Inventory — Slice 3

`13_` §23 rules 1–8. `13_` §10: bulk IMEI entry with pre-save duplicate validation.

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/inventory` | Stock balances read model (available/reserved/inbound/sold/returned/defective/written-off views, `13_` §10) | `inventory.view` | No | — | Page/size; search `q`; filter `variant_id`, `location_id`, `branch_id`, `state`, `low_stock`, `out_of_stock`, `aging_days`; sort `available_qty`, `days_in_stock` | Not started |
| `GET /api/v1/inventory/valuation` ✱ | Stock value (`13_` §10) | `inventory.view_cost` | No | — | Filter `location_id`, `category_id`, `as_of` | Not started |
| `GET /api/v1/inventory/movements` ✱ | Append-only movement ledger / timeline (`13_` §10) | `inventory.view` | No | — | Page/size; filter `variant_id`, `serialized_unit_id`, `movement_type`, date range; sort `created_at` | Not started |
| `GET /api/v1/serialized-units` | List/search serialized units | `inventory.view` | No | — | Page/size; search `q` (IMEI/serial); filter `state`, `variant_id`, `location_id`, `condition`, `pta_status`; sort `received_at` | Not started |
| `GET /api/v1/serialized-units/{id}` | Unit detail; actual/landed cost only with `inventory.view_cost` | `inventory.view` | No | — | — | Not started |
| `GET /api/v1/serialized-units/{id}/movements` ✱ | Full movement history of one unit (`13_` §10) | `inventory.view` | No | — | Page/size; sort `created_at` | Not started |
| `POST /api/v1/serialized-units/validate-bulk` ✱ | Pre-save bulk IMEI paste validation (`13_` §10) | `inventory.view` | No | — | Body capped at `LIMITS.MAX_BULK_IMEI_ROWS` = 500 | Not started |
| `POST /api/v1/inventory/reservations` ✱ | Reserve a unit/quantity with expiry (`01_PRD` §5.4) | `inventory.reserve` | Yes (state + `reserve` movement + audit) | Proposed | — | Not started |
| `DELETE /api/v1/inventory/reservations/{id}` ✱ | Release a reservation | `inventory.reserve` | Yes (state + `release` movement + audit) | — | — | Not started |
| `POST /api/v1/inventory/transfers` ✱ | Transfer between locations (`01_PRD` §5.4) | `inventory.transfer` | Yes (`transfer_out` + `transfer_in` + audit) | Proposed | — | Not started |
| `GET /api/v1/inventory/counts` ✱ | List stock counts | `inventory.count` | No | — | Page/size; filter `location_id`, `status`; sort `created_at` | Not started |
| `POST /api/v1/inventory/counts` ✱ | Start a stock count | `inventory.count` | No | Proposed | — | Not started |
| `POST /api/v1/inventory/counts/{id}/submit` ✱ | Submit counted lines → proposed adjustments | `inventory.count` | Yes (count + proposed adjustments + audit) | Proposed | — | Not started |
| `POST /api/v1/inventory/adjustments` ✱ | Adjust stock — reason mandatory (`13_` §10) | `inventory.adjust` | Yes (state/qty + movement + audit) | Proposed | — | Not started |
| `POST /api/v1/inventory/adjustments/{id}/approve` ✱ | Approve an adjustment (`01_PRD` §5.4) | `inventory.approve_adjustment` | Yes (status + movement + audit) | Proposed | — | Not started |

**Error codes owned:** `IMEI_INVALID`, `IMEI_DUPLICATE` (409), `SERIAL_DUPLICATE` (409), `INVENTORY_UNIT_NOT_AVAILABLE` (409), `INVENTORY_UNIT_ALREADY_SOLD` (409), `INVENTORY_INVALID_STATE_TRANSITION`, `INVENTORY_INSUFFICIENT_STOCK`, `INVENTORY_NEGATIVE_STOCK_BLOCKED`, `INVENTORY_DIRECT_EDIT_BLOCKED`, `INVENTORY_UNIT_HAS_HISTORY`, `INVENTORY_ADJUSTMENT_REASON_REQUIRED`.

**Notes.**

- **There is deliberately no `PATCH /api/v1/inventory/{id}/quantity`.** `13_` §23 rule 8 prohibits direct stock-counter editing; `INVENTORY_DIRECT_EDIT_BLOCKED` exists to reject any such attempt. Quantity changes only ever arrive via a movement.
- State transitions are validated by the implemented `isTransitionAllowed(from, to)` in `shared/src/enums.ts` against `SERIALIZED_STATE_TRANSITIONS`. Note `sold: ['returned_inspection']` — a sold unit can go **only** to inspection, never directly back to `available` (`13_` §12).
- `SALEABLE_STOCK_STATES` is `['available']` only.
- IMEI normalisation and Luhn validation use the implemented `shared/src/imei.ts` (153 shared unit tests pass).
- `13_` §22: "Use safe row locks, atomic updates or unique constraints to prevent two users from selling/reserving the same IMEI" — the reservation endpoint and the sale-posting transaction must both take the row lock.

### 2.14 Sales — Slice 5

`13_` §12 counter flow: `Find → Select Product/IMEI → Cart → Customer → Payment → Review → Complete → Receipt`.

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/sales` | Sales history | `sales.view` | No | — | Page/size; search `q` (invoice no./IMEI/customer); filter `status`, `branch_id`, `cashier_id`, `salesperson_id`, `payment_method`, date range; sort `posted_at`, `total` | Not started |
| `POST /api/v1/sales` | Create/replace a draft cart | `sales.create` | Yes (sale + lines) | Proposed | — | Not started |
| `GET /api/v1/sales/{id}` | Sale detail; COGS/profit only with `sales.view_profit` | `sales.view` | No | — | — | Not started |
| `PATCH /api/v1/sales/{id}` | Edit a **draft** sale only | `sales.create` | Yes (lines rewrite) | Proposed | — | Not started |
| `POST /api/v1/sales/{id}/review` ✱ | Server-computed review: totals, stock effects, margin (`13_` §12 "review screen showing transaction effects") | `sales.create` | No | — | — | Not started |
| **`POST /api/v1/sales/{id}/post`** | **Post the sale — owns TXN-2 (§4)** | `sales.post` | **Yes §22** | **Yes (`13_` §12)** | — | Not started |
| `POST /api/v1/sales/{id}/cancel` | Cancel **before posting only** (`13_` §12) | `sales.create` | Yes (status + reservation release + audit) | Proposed | — | Not started |
| `GET /api/v1/sales/{id}/receipt` ✱ | A4 / thermal-friendly receipt payload (`13_` §12) | `sales.view` | No | — | Query `format=a4\|thermal` | Not started |

**Error codes owned:** `SALE_EMPTY_CART`, `SALE_ALREADY_POSTED` (409), `SALE_POSTED_IMMUTABLE` (409), `SALE_PAYMENT_MISMATCH`, `SALE_SERIALIZED_UNIT_REQUIRED`, `SALE_BELOW_MIN_MARGIN`, `SALE_DISCOUNT_NOT_AUTHORIZED`, `SALE_CREDIT_NOT_AUTHORIZED`, `SALE_CASH_SESSION_REQUIRED`, plus `IDEMPOTENCY_KEY_REUSED` (409) and `OPTIMISTIC_LOCK_FAILED` (409).

**Notes.**

- **There is deliberately no `PUT`/`DELETE` on a posted sale.** `13_` §23 rule 9: posted sales cannot be silently edited or deleted; `SALE_POSTED_IMMUTABLE` rejects the attempt. Corrections go through ReturnsAndExchanges.
- Permission interaction at posting: `sales.discount` allows a permitted discount; `sales.discount_override` (owner + manager only) allows exceeding it; `pricing.override_min_margin` (**owner only**) is required to breach minimum margin; `sales.credit` (owner + manager only — **not** cashier or salesperson) is required for a receivable/credit sale; `sales.manual_line` (**owner only** in `DEFAULT_ROLE_PERMISSIONS`) is required for a manual/custom line and, per `13_` §9, additionally requires an audit reason → `REASON_REQUIRED` otherwise.
- `sales.view_profit` is absent from the salesperson and cashier grants — COGS and gross profit must be stripped from `GET /api/v1/sales/{id}` for those roles (`13_` §8).
- `13_` §12: "sequential invoice/receipt number" and "generate the final invoice after successful posting" — the number is drawn from `number_sequences` (`SEQUENCE_KEYS.SALE_INVOICE = 'sale_invoice'`) **inside** the posting transaction so no gap or duplicate can occur.

### 2.15 Payments — Slice 5

`01_PRD` §7: "Idempotency is required for payment and integration callbacks."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/payments` | List payments and allocations | `sales.view` | No | — | Page/size; filter `sale_id`, `customer_id`, `method`, `cash_session_id`, date range; sort `created_at` | Not started |
| `POST /api/v1/payments` | Collect a payment / split payment leg against a sale | `payments.collect` | Yes (payment + allocation + ledger + cash session) | **Yes (`01_PRD` §7)** | — | Not started |
| `GET /api/v1/payments/{id}` | Payment detail | `sales.view` | No | — | — | Not started |

**Notes.** Methods are `PAYMENT_METHODS` in `shared/src/enums.ts`: `cash`, `bank_transfer`, `card`, `digital_wallet`, `credit`. `13_` §23 rule 14: "Payment plus receivable must reconcile to the sale total" → `SALE_PAYMENT_MISMATCH` when they do not. A `credit` leg requires `sales.credit` and creates a Receivables record **through the Receivables domain service**, never by direct table write (§6). In the normal counter flow, payment legs are submitted as part of `POST /api/v1/sales/{id}/post` and share that transaction; this standalone endpoint covers post-hoc collection.

### 2.16 ReturnsAndExchanges — Slice 6

`13_` §12: "Returned serialized units must enter inspection or another controlled state. Do not automatically make them saleable."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/returns` | List returns | `returns.view` | No | — | Page/size; search `q` (return/invoice no.); filter `status`, `outcome`, `sale_id`, date range; sort `created_at` | Not started |
| `POST /api/v1/returns` | Create a draft return against an original sale | `returns.create` | Yes (return + lines) | Proposed | — | Not started |
| `GET /api/v1/returns/{id}` | Return detail | `returns.view` | No | — | — | Not started |
| **`POST /api/v1/returns/{id}/post`** | **Post return/refund — owns TXN-3 (§4)** | `returns.approve` | **Yes §22** | **Proposed** | — | Not started |
| `POST /api/v1/returns/{id}/exchange` ✱ | Exchange: return + replacement sale (`13_` §12) | `returns.approve` + `sales.post` | **Yes §22** (shares TXN-3) | **Proposed** | — | Not started |
| `GET /api/v1/returns/eligibility` ✱ | Policy/window check before capture (`13_` §25 Slice 6 "return eligibility") | `returns.view` | No | — | Query `sale_id`, `line_id` | Not started |

**Error codes owned:** `RETURN_ORIGINAL_SALE_REQUIRED`, `RETURN_QUANTITY_EXCEEDS_SOLD`, `RETURN_WINDOW_EXPIRED`, `RETURN_UNIT_MISMATCH`.

**Notes.** Outcomes are `RETURN_OUTCOMES` in `shared/src/enums.ts`: `restock`, `quarantine`, `supplier_warranty`, `write_off`, `repair`. A returned serialized unit transitions `sold → returned_inspection` — the only transition permitted out of `sold` by `SERIALIZED_STATE_TRANSITIONS`. `returns.create` is granted to cashier; `returns.approve` is **not** (owner and manager only) — so a cashier can capture a return but cannot post it. This is the enforcement of `13_` §8 "permitted returns".

### 2.17 ExternalServices — Slice 7

`13_` §13: the system **records** the transaction; it does not execute the provider transaction. "The principal amount is never service revenue or profit" (also `13_` §23 rule 15).

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/external-services/providers` ✱ | List providers (`13_` §19 `external_service_providers`) | `external_services.view` | No | — | Page/size; filter `active`; sort `name` | Not started |
| `POST /api/v1/external-services/providers` ✱ | Create provider | `settings.manage` (⚠ GAP-02) | No | Proposed | — | Not started |
| `GET /api/v1/external-services/types` ✱ | List service types (`13_` §13 "configurable additional service types") | `external_services.view` | No | — | Page/size; filter `active` | Not started |
| `GET /api/v1/external-services/fee-rules` | List fee rules | `external_fee_rules.view` | No | — | Page/size; filter `provider_id`, `service_type`, `branch_id`, `active`, `effective_on`; sort `effective_from` | Not started |
| `POST /api/v1/external-services/fee-rules` | Create fee rule | `external_fee_rules.manage` | No | Proposed | — | Not started |
| `PATCH /api/v1/external-services/fee-rules/{id}` | Update fee rule (effective-dating; never retro-edit posted snapshots) | `external_fee_rules.manage` | No | Proposed | — | Not started |
| `POST /api/v1/external-services/fee-preview` ✱ | Calculate the fee for a prospective amount (`13_` §13) | `external_services.view` | No | — | — | Not started |
| `GET /api/v1/external-transactions` | List external transactions | `external_services.view` | No | — | Page/size; search `q` (external ref/phone); filter `provider_id`, `service_type`, `status`, `cash_session_id`, `branch_id`, date range; sort `created_at` | Not started |
| **`POST /api/v1/external-transactions`** | **Record/post an external transaction — owns TXN-4 (§4)** | `external_services.record` | **Yes §22** | **Yes (`13_` §13)** | — | Not started |
| `GET /api/v1/external-transactions/{id}` | Detail incl. fee snapshot and computed service profit | `external_services.view` | No | — | — | Not started |
| `POST /api/v1/external-transactions/{id}/reverse` ✱ | Reverse a posted transaction (`13_` §13 status `REVERSED`) | `external_services.reverse` | **Yes §22** (shares TXN-4 shape) | Proposed | — | Not started |
| `GET /api/v1/external-services/balances` ✱ | Per-provider float balances + low thresholds (verified in `prototype/assets/digital.js`) | `external_services.view` | No | — | Filter `branch_id` | Not started |

**Error codes owned:** `EXTERNAL_FEE_RULE_NOT_FOUND`, `EXTERNAL_REFERENCE_DUPLICATE` (409), `EXTERNAL_PRINCIPAL_INVALID`, `EXTERNAL_TRANSACTION_POSTED_IMMUTABLE`.

**Notes.**

- Fee calculation is already implemented and verified in `shared/src/fee-rules.ts` with 4 modes from `FEE_CALCULATION_MODES`: `fixed`, `proportional_block`, `per_started_block`, `percentage`.
- Verified prototype defaults (`prototype/assets/digital.js`): SENT `{blockSize: 1000, feePerBlock: 10, minimumFee: 10}`; RECEIVED `{blockSize: 1000, feePerBlock: 20, minimumFee: 20}` — matching `13_` §13 ("Send: PKR 10 per PKR 1,000", "Withdrawal: PKR 20 per PKR 1,000"). `13_` §13: "Do not permanently hardcode these rules" — they are seeded as fee-rule rows, and the API reads rules, never constants.
- `EXTERNAL_SERVICE_TYPES` is `['send', 'withdrawal']`; `EXTERNAL_DIRECTION_BY_SERVICE_TYPE` maps them to the prototype's `SENT_FROM_SHOP` / `RECEIVED_INTO_SHOP`.
- Statuses are `EXTERNAL_TRANSACTION_STATUSES`: `draft`, `successful`, `pending`, `failed`, `reversed`, `disputed`. Only `successful` counts toward reported service revenue (`EXTERNAL_REVENUE_STATUSES`).
- Cash direction is `CASH_DIRECTIONS` = `in | out | none` and is **read from the rule, never inferred** — `13_` §13: "Do not assume every send or withdrawal affects physical cash the same way."
- `external_services.reverse` is granted **only to `owner`** in `DEFAULT_ROLE_PERMISSIONS`.
- The posted transaction stores a **fee snapshot** (`13_` §22 "fee calculation snapshot"), so a later fee-rule edit cannot alter historical service profit.

### 2.18 CashSessions — Slice 8

`13_` §14. `13_` §23 rule 16: "Cash mismatch is recorded, not hidden."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/cash-sessions` | List sessions | `cash_sessions.view` | No | — | Page/size; filter `status`, `user_id`, `branch_id`, date range; sort `opened_at` | Not started |
| `POST /api/v1/cash-sessions` | Open a session with opening cash (`13_` §14 step 1–2) | `cash_sessions.open` | Yes (session + opening entry + audit) | Proposed | — | Not started |
| `GET /api/v1/cash-sessions/{id}` | Session detail | `cash_sessions.view` | No | — | — | Not started |
| `GET /api/v1/cash-sessions/{id}/expected` ✱ | Server-calculated expected cash (`13_` §14 step 4) | `cash_sessions.view` | No | — | — | Not started |
| `POST /api/v1/cash-sessions/{id}/movements` ✱ | Deposit/removal/drawer expense (`13_` §14) | `cash_sessions.open` | Yes (movement + ledger + audit) | Proposed | — | Not started |
| **`POST /api/v1/cash-sessions/{id}/close`** | **Submit counted cash — owns TXN-5 (§4)** | `cash_sessions.close` | **Yes §22** | **Proposed** | — | Not started |
| `POST /api/v1/cash-sessions/{id}/review` | Manager review/approve (`13_` §14 step 8) | `cash_sessions.review` | **Yes §22** (shares TXN-5) | Proposed | — | Not started |
| `POST /api/v1/cash-sessions/{id}/reopen` | Reopen with authorization + reason | `cash_sessions.reopen` | **Yes §22** (shares TXN-5) | Proposed | — | Not started |
| `GET /api/v1/cash-sessions/{id}/closing-report` ✱ | End-of-day report replacing the manual WhatsApp check (`13_` §14) | `cash_sessions.view` | No | — | — | Not started |

**Error codes owned:** `CASH_SESSION_ALREADY_OPEN` (409), `CASH_SESSION_NOT_OPEN`, `CASH_SESSION_INVALID_STATUS`, `CASH_SESSION_VARIANCE_REASON_REQUIRED`, `CASH_SESSION_REOPEN_NOT_AUTHORIZED`. Sales raise `SALE_CASH_SESSION_REQUIRED` when no session is open.

**Notes.** Statuses are `CASH_SESSION_STATUSES` in `shared/src/enums.ts`: `open`, `closing_pending`, `closed`, `reviewed`, `reopened_with_authorization` — exactly the five in `13_` §14. `cash_sessions.reopen` is granted **only to `owner`**; `cash_sessions.review` is granted to owner and manager, **not** to cashier — a cashier cannot approve their own variance. Expected cash is always recomputed server-side (`13_` §22: "Never rely on frontend totals"). A non-zero variance without an explanation is rejected with `CASH_SESSION_VARIANCE_REASON_REQUIRED`; the shortage/excess is stored, never absorbed into a sale.

### 2.19 Expenses — Slice 8

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/expenses/categories` ✱ | List expense categories | `expenses.view` | No | — | Page/size; sort `name` | Not started |
| `POST /api/v1/expenses/categories` ✱ | Create category | `settings.manage` (⚠ GAP-02) | No | Proposed | — | Not started |
| `GET /api/v1/expenses` | List expenses | `expenses.view` | No | — | Page/size; search `q`; filter `category_id`, `payment_source`, `cash_session_id`, `status`, date range; sort `incurred_at`, `amount` | Not started |
| `POST /api/v1/expenses` | Record an expense with payment source + evidence | `expenses.create` | Yes (expense + ledger + cash session impact + audit) | Proposed | — | Not started |
| `GET /api/v1/expenses/{id}` | Expense detail | `expenses.view` | No | — | — | Not started |
| `POST /api/v1/expenses/{id}/approve` | Approve where required (`13_` §16) | `expenses.approve` | Yes (status + ledger + audit) | Proposed | — | Not started |

**Notes.** An expense paid from the drawer must impact the open cash session (`13_` §14 "expenses paid from drawer") — done via the CashSessions domain service, not a direct write (§6). `expenses.create` is granted to `accountant` in `DEFAULT_ROLE_PERMISSIONS`, which is the one operational write the read-only finance role holds; `expenses.approve` is not granted to the accountant.

### 2.20 Receivables — Slice 10

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/receivables` | List customer receivables | `receivables.view` | No | — | Page/size; filter `customer_id`, `status`, `overdue`, date range; sort `due_date`, `balance` | Not started |
| `GET /api/v1/receivables/{id}` | Receivable detail + payment history | `receivables.view` | No | — | — | Not started |
| `POST /api/v1/receivables/{id}/payments` ✱ | Record a receivable payment (`13_` §16) | `receivables.manage` | Yes (payment + balance + ledger + cash session + audit) | **Yes (`01_PRD` §7)** | — | Not started |

**Error codes owned:** `RECEIVABLE_OVERPAYMENT`.

**Notes.** Receivables are **created** by Sales (credit sale) and by ReturnsAndExchanges (credit note) via this module's domain service — there is no `POST /api/v1/receivables`, because a receivable with no source transaction would break `13_` §16 ("Every ledger entry must link to source type/source ID"). `receivables.manage` is not granted to `accountant` (read-only finance).

### 2.21 Payables — Slice 4 (created) / Slice 10 (settled)

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/payables` | List supplier payables | `payables.view` | No | — | Page/size; filter `supplier_id`, `status`, `overdue`, date range; sort `due_date`, `balance` | Not started |
| `GET /api/v1/payables/{id}` | Payable detail + payment history | `payables.view` | No | — | — | Not started |
| `POST /api/v1/payables/{id}/payments` ✱ | Record a supplier payment (`13_` §16) | `payables.manage` | Yes (payment + balance + ledger + cash session + audit) | **Yes (`01_PRD` §7)** | — | Not started |

**Error codes owned:** `PAYABLE_OVERPAYMENT`.

**Notes.** Payables are **created/updated** by Purchasing at goods receipt (TXN-1 step "payable effect") through this module's domain service. `01_PRD` §4 (Purchaser): "Cannot finalize payment without permission" — reflected in `DEFAULT_ROLE_PERMISSIONS`, where `purchaser` holds `payables.view` but not `payables.manage`.

### 2.22 FinancialLedger — Slice 10

`13_` §16. `13_` §20 does **not** enumerate a ledger path, hence ✱.

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/ledger/entries` ✱ | Immutable financial entries, each linked to its source | `ledger.view` | No | — | Page/size; filter `source_type`, `source_id`, `account_id`, `direction`, `branch_id`, date range; sort `entry_date` | Not started |
| `GET /api/v1/ledger/accounts` ✱ | Financial accounts/categories (`13_` §19 `financial_accounts`) | `ledger.view` | No | — | Page/size; sort `code` | Not started |
| `POST /api/v1/ledger/owner-capital` ✱ | Owner capital injection (`13_` §16) | `owner_equity.manage` | Yes (entry + cash/bank movement + audit) | Proposed | — | Not started |
| `POST /api/v1/ledger/owner-withdrawals` ✱ | Owner withdrawal — **not an expense** (`13_` §16) | `owner_equity.manage` | Yes (entry + cash/bank movement + audit) | Proposed | — | Not started |

**Error codes owned:** `LEDGER_DUPLICATE_POSTING` (409), `LEDGER_UNBALANCED`.

**Notes.** There is **no** generic `POST /api/v1/ledger/entries`. Entries are written only by owning-module transactions through this module's domain service, each carrying `source_type` (from `LEDGER_SOURCE_TYPES` in `shared/src/enums.ts` — 15 values incl. `sale`, `external_transaction`, `owner_withdrawal`) plus source ID and an idempotency/source key; a repeat key raises `LEDGER_DUPLICATE_POSTING` (`13_` §16 "Prevent duplicate posting"). `owner_equity.manage` is granted **only to `owner`**. Directions are `LEDGER_DIRECTIONS` = `debit | credit`.

### 2.23 Reporting — Slice 10 (data) / Slice 12 (dashboard)

`13_` §17: "Every dashboard metric must drill down to source records and show its definition."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/reports/dashboard` ✱ | Owner command-centre KPIs + alerts with drill-down links | `reports.view` | No | — | Filter `business_date`, `branch_id` | Not started |
| `GET /api/v1/reports/sales` ✱ | Daily/weekly/monthly sales (`13_` §17) | `reports.view` | No | — | Page/size; filter `granularity`, date range, `branch_id`, `salesperson_id`; sort `period` | Not started |
| `GET /api/v1/reports/gross-profit` ✱ | Gross profit and margin | `reports.view_financial` | No | — | Page/size; filter date range, `category_id`, `brand_id` | Not started |
| `GET /api/v1/reports/service-profit` ✱ | Service transactions and service profit | `reports.view_financial` | No | — | Page/size; filter date range, `provider_id` | Not started |
| `GET /api/v1/reports/expenses` ✱ | Expense report | `reports.view_financial` | No | — | Page/size; filter date range, `category_id` | Not started |
| `GET /api/v1/reports/profit-and-loss` ✱ | Management P&L (`13_` §17) | `reports.view_financial` | No | — | Filter date range, `branch_id` | Not started |
| `GET /api/v1/reports/cash-flow` ✱ | Cash flow and reconciliation | `reports.view_financial` | No | — | Filter date range | Not started |
| `GET /api/v1/reports/inventory-valuation` ✱ | Inventory valuation | `reports.view_financial` | No | — | Page/size; filter `as_of`, `location_id` | Not started |
| `GET /api/v1/reports/inventory-aging` ✱ | Inventory aging | `reports.view` | No | — | Page/size; filter `bucket`, `location_id`; sort `days_in_stock` | Not started |
| `GET /api/v1/reports/stock-movement` ✱ | Stock movement | `reports.view` | No | — | Page/size; filter date range, `movement_type` | Not started |
| `GET /api/v1/reports/low-stock` ✱ | Low/out-of-stock | `reports.view` | No | — | Page/size; sort `available_qty` | Not started |
| `GET /api/v1/reports/product-profitability` ✱ | Product profitability | `reports.view_financial` | No | — | Page/size; filter date range; sort `gross_profit` | Not started |
| `GET /api/v1/reports/demand` ✱ | Customer demand and lost sales | `reports.view` | No | — | Page/size; filter date range, `outcome` | Not started |
| `GET /api/v1/reports/suppliers` ✱ | Supplier/purchase performance | `reports.view` | No | — | Page/size; filter date range, `supplier_id` | Not started |
| `GET /api/v1/reports/receivables-payables` ✱ | Receivables and payables ageing | `reports.view_financial` | No | — | Page/size; filter `as_of` | Not started |
| `GET /api/v1/reports/returns` ✱ | Returns and exchanges | `reports.view` | No | — | Page/size; filter date range | Not started |
| `GET /api/v1/reports/cashier-variance` ✱ | Cashier variance | `reports.view_financial` | No | — | Page/size; filter date range, `user_id` | Not started |
| `GET /api/v1/reports/data-quality` ✱ | Audit and data-quality exceptions | `reports.view` | No | — | Page/size; filter `exception_type` | Not started |
| `POST /api/v1/reports/{report}/export` ✱ | CSV/XLSX/PDF export (`01_PRD` §5.11) | `reports.export` | No | Proposed | — | Not started |

**Notes.** Financial reports require `reports.view_financial`, which is **not** granted to `salesperson`, `cashier`, `purchaser` or `technician` in `DEFAULT_ROLE_PERMISSIONS`. `13_` §17: "Do not confuse sales, cash and profit" — the three are separate fields, never one number. `13_` §16 formulas that Reporting must implement verbatim: `sales_gross_profit = net_sales_revenue - COGS`; `service_profit = service_fees - provider_charges - direct_service_expenses`; `operating_profit = sales_gross_profit + service_profit + other_income - operating_expenses - recorded_losses`. Every export of sensitive information is an audit event (`03_ARCHITECTURE.md` §9). Reporting is **read-only across module boundaries** and must query read models/views, not mutate anything (§6). Business-day boundaries use the implemented `shared/src/datetime.ts` (Asia/Karachi).

### 2.24 Recommendations — Slice 11

`13_` §23 rule 19: "No recommendation auto-approves a PO."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/recommendations/runs` ✱ | List recommendation runs with algorithm version + config snapshot | `recommendations.view` | No | — | Page/size; filter date range; sort `generated_at` | Not started |
| `POST /api/v1/recommendations/runs` ✱ | Generate a deterministic run | `recommendations.view` | Yes (run + recommendations + feature snapshot) | Proposed | — | Not started |
| `GET /api/v1/recommendations` | List recommendations for a run | `recommendations.view` | No | — | Page/size; filter `run_id`, `variant_id`, `confidence`; sort `score`, `estimated_investment` | Not started |
| `GET /api/v1/recommendations/{id}` | Detail: quantity, investment, expected GP, score, confidence, reasons, risks, suggested supplier | `recommendations.view` | No | — | — | Not started |
| `POST /api/v1/recommendations/{id}/decision` ✱ | Owner decision (`13_` §18) | `recommendations.decide` | Yes (decision + audit) | Proposed | — | Not started |
| `POST /api/v1/recommendations/{id}/draft-purchase-order` ✱ | Create a **draft** PO after owner action (`13_` §18) | `recommendations.decide` + `purchases.create` | Yes (decision link + draft PO + audit) | Proposed | — | Not started |

**Error codes owned:** `RECOMMENDATION_RUN_NOT_FOUND`, `RECOMMENDATION_AUTO_ORDER_BLOCKED`, `RECOMMENDATION_ALREADY_DECIDED`.

**Notes.** `recommendations.decide` is granted **only to `owner`** in `DEFAULT_ROLE_PERMISSIONS` — this is the enforcement of `13_` §18 "Do not auto-approve or auto-order". The draft-PO endpoint must create status `draft` only; any attempt to produce an approved/ordered PO from this path raises `RECOMMENDATION_AUTO_ORDER_BLOCKED`. Every run stores `RECOMMENDATION_ALGORITHM_VERSION` (`'v1.0.0'` in `shared/src/constants.ts`), the config snapshot, the input window and the feature values (`13_` §18). Scoring weights are `RECOMMENDATION_SCORE_WEIGHTS`; confidence bands come from `confidenceLabelFor(score)` (`high` ≥ 75, `medium` ≥ 50, else `low`). `13_` §18: an optional LLM "must not invent or alter quantities or financial numbers" — no LLM call is in this map.

### 2.25 Notifications — Slice 14

`01_PRD` §6: "Initial notifications may be in-app."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/notifications` ✱ | Current user's in-app notifications | — (authenticated, own only) ⚠ GAP-03 | No | — | Page/size; filter `read`, `type`; sort `created_at` | Not started |
| `POST /api/v1/notifications/{id}/read` ✱ | Mark read | — (authenticated, own only) ⚠ GAP-03 | No | — | — | Not started |

### 2.26 Documents — Slice 4

`13_` §4: "private object storage adapter for future documents and images". `13_` §11: "attachments adapter".

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/v1/documents` ✱ | Upload an attachment (proof, invoice, photo) | ⚠ GAP-04 — no key exists | No | Proposed | — | Not started |
| `GET /api/v1/documents/{id}` ✱ | Private, access-checked fetch (`13_` §27 "private document access") | ⚠ GAP-04 — no key exists | No | — | — | Not started |

**Notes.** `13_` §27 requires "safe file validation" and "private document access"; `03_ARCHITECTURE.md` §16 forbids "storing sensitive documents in a public bucket". Storage is behind an adapter, never a hard-coded provider call (`03_ARCHITECTURE.md` §13).

### 2.27 Audit — Slice 1 (actor) / every slice (events)

`03_ARCHITECTURE.md` §9 lists the auditable event classes. `13_` §23 rule 22: "Sensitive overrides require reason and audit."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/audit` | Append-only audit event log | `audit.view` | No | — | Page/size; search `q`; filter `actor_id`, `event_type`, `entity_type`, `entity_id`, `branch_id`, date range; sort `created_at` | Not started |
| `GET /api/v1/audit/{id}` ✱ | Audit event detail | `audit.view` | No | — | — | Not started |

**Notes.** There is **no** write endpoint. Audit events are appended only by owning-module transactions through the Audit domain service (`13_` §6 step 8). `audit.view` is granted **only to `owner`** in `DEFAULT_ROLE_PERMISSIONS`, matching `13_` §8 ("audit log access" listed under Owner only). `REASON_REQUIRED` (from `shared/src/errors.ts`) is raised when an override arrives without a reason; reason length is capped at `LIMITS.MAX_REASON_LENGTH` = 500.

### 2.28 Settings — Slice 0 (read) / Slice 7 (write)

`13_` §19 `application_settings`. `shared/src/constants.ts` records the rule: values the owner must change at runtime "live in `application_settings` in the database — these are only the structural defaults and hard limits."

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/settings` | List application settings | `settings.view` | No | — | Page/size; filter `namespace`; sort `key` | Not started |
| `GET /api/v1/settings/{key}` ✱ | Read one setting | `settings.view` | No | — | — | Not started |
| `PUT /api/v1/settings/{key}` ✱ | Update a setting — configuration change is auditable | `settings.manage` | Yes (setting + audit) | Proposed | — | Not started |

**Notes.** `settings.manage` is granted **only to `owner`**; `manager` holds `settings.view` only. Configuration changes are auditable per `03_ARCHITECTURE.md` §9. Settings must never hold secrets (`13_` §23 rule 23: "Secrets do not enter Git"; `13_` §27: secrets via environment/secret manager).

### 2.29 Health — Slice 0 — **In progress**

`13_` §4: "health and readiness endpoints". `13_` §27: "health/readiness checks".

| Method + path | Purpose | Permission | Txn | Idem | Paging / filter / sort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/health` | Liveness — process is up | — (public) | No | — | — | In progress |
| `GET /api/v1/health/ready` ✱ | Readiness — DB reachable, migrations applied | — (public) | No | — | — | In progress |

**Notes.** Neither endpoint may leak version detail, credentials or connection strings to an unauthenticated caller (`13_` §27: "Do not expose stack traces, secrets, tokens, database credentials"). Readiness depends on PostgreSQL 18.4 on port 5432 (verified running locally); **DB credentials are not available**, which is a recorded blocker for anything requiring migrations, seeds or integration tests — including a green readiness check.

---

## 3. Cross-cutting concerns

Applied globally in `backend/src/common/`, wired in `backend/src/app.module.ts`. Execution order for an inbound request: **RequestId middleware → Rate limiter → AuthGuard → PermissionGuard → ScopeGuard → ValidationPipe → Controller → Service (transaction) → Interceptor (logging) → ErrorFilter**.

| Concern | Implementation | Source requirement | Status |
| --- | --- | --- | --- |
| **Auth guard** | Global `APP_GUARD`; validates the HTTP-only session cookie, loads the actor, rejects inactive users. Opt out per route with an `@Public()` decorator (used only by `POST /api/v1/auth/login` and both Health routes). Emits `AUTH_REQUIRED` (401), `AUTH_SESSION_EXPIRED` (401), `AUTH_SESSION_INVALID` (401), `AUTH_USER_INACTIVE` (403). | `13_` §8; §23 rule 20 | Not started |
| **Permission guard** | Global `APP_GUARD` reading a `@RequirePermissions(...PermissionKey[])` decorator. Resolves the actor's grants from `user_roles` + `role_permissions` (runtime source of truth; `DEFAULT_ROLE_PERMISSIONS` in `shared/src/permissions.ts` is the **seed**, not the runtime authority). Emits `FORBIDDEN_PERMISSION` (403). Uses the shared `hasPermission()` helper so backend and frontend never diverge. | `13_` §8; §23 rule 20 | Not started |
| **Scope guard** | Global `APP_GUARD`; constrains every query and mutation to the actor's `user_scope_access` (organization/branch/location). Emits `FORBIDDEN_SCOPE` (403). Applies even when the launch UI is single-branch, because `13_` §8 requires the keys to exist in the data from day one. | `13_` §8; §23 rule 21 ("Cross-scope data access is blocked") | Not started |
| **Validation pipe** | Global pipe over Zod schemas from `shared/` (Zod 4.4.3 pinned). Whitelists/strips unknown fields. Emits `VALIDATION_FAILED` (422) with `details` keyed by dotted field path — matching `ApiErrorBody.details: Readonly<Record<string, readonly string[]>>` in `shared/src/errors.ts`. Enforces `LIMITS` and `PAGINATION.MAX_PAGE_SIZE`. **Note:** `main.ts` currently registers Nest's built-in `ValidationPipe` (`whitelist`/`forbidNonWhitelisted`/`transform`), which is class-validator-based, not the Zod pipe described here; the `ZodError` → `VALIDATION_FAILED` (422) translation already exists in `DomainExceptionFilter`. The Zod pipe itself is still to be written. | `13_` §20; §27 | Not started |
| **Error filter** | Global `APP_FILTER`. `isDomainError(err)` → `err.toBody(requestId)` with `err.status` (already resolved from `DEFAULT_ERROR_STATUS`, fallback 400). Prisma unique-violation (`P2002`) → the specific domain code (e.g. `IMEI_DUPLICATE`, `CATALOG_SKU_DUPLICATE`), never a raw driver error. Anything unrecognised → `INTERNAL_ERROR` (500) with a generic message; the stack goes to the log, never the response. **Scaffolded** as `DomainExceptionFilter` in `backend/src/common/filters/domain-exception.filter.ts`, registered globally via `APP_FILTER` in `app.module.ts`; it handles `DomainError`, `ZodError` and `HttpException` today. The Prisma `P2002` mapping awaits the Prisma client (Slice 1). | `13_` §4; §27 | **In progress** |
| **Request/correlation IDs** | Middleware reads or generates `x-request-id` (`REQUEST_ID_HEADER`), echoes it on the response, and stamps it on every log line and on `ApiErrorBody.requestId` — so a user can quote one value that finds the exact log line. **Scaffolded** in `backend/src/common/middleware/request-id.middleware.ts` (inbound value length-capped at 128 and character-restricted), applied to all routes in `app.module.ts`. It assigns `req.requestId` rather than using `AsyncLocalStorage`; an ALS store is still needed to reach non-request-scoped code. | `13_` §4; `shared/src/errors.ts` comment on `requestId` | **In progress** |
| **Structured logging** | `pino 10.3.1` (pinned) as a Nest logger, JSON output. Redaction of credentials, session cookies, password fields, and restricted personal fields (CNIC). Logs the request ID, actor ID, route, status and duration. **Scaffolded** via `nestjs-pino` `LoggerModule.forRootAsync` in `backend/src/app.module.ts`, with the redaction path list and health-probe log suppression in place; actor ID awaits Slice 1. | `13_` §4; §27 ("log redaction"); `03_ARCHITECTURE.md` §14 | **In progress** |
| **Idempotency** | Interceptor on writes carrying `idempotency-key` (`IDEMPOTENCY_KEY_HEADER`). Stores key + actor + route + request hash + response; a replay with the same key returns the stored response; the same key with a **different** payload raises `IDEMPOTENCY_KEY_REUSED` (409). The key record is written inside the same transaction as the operation, so a rolled-back operation does not burn the key. | `13_` §12; §13; `01_PRD` §7 | Not started |
| **Optimistic concurrency** | `version` column on mutable drafts (PO, draft sale). Mismatch → `OPTIMISTIC_LOCK_FAILED` (409). | `13_` §19; `03_ARCHITECTURE.md` §7 | Not started |
| **OpenAPI** | `@nestjs/swagger`; schemas derived from the shared Zod contracts, not from Prisma models — `13_` §20: "Do not expose ORM models directly as public API contracts." Documents every error code per route. Disabled or auth-gated in production (`13_` §27: "production debug disabled"). **Scaffolded** in `backend/src/main.ts`: `DocumentBuilder` + `SwaggerModule.setup` at `/api/docs`, guarded by `if (!config.isProduction)`, with cookie auth declared. Per-route error-code documentation awaits the domain modules. | `13_` §4; §20 | **In progress** |
| **Rate limiting on auth** | Throttler scoped to `POST /api/v1/auth/login` and `POST /api/v1/auth/password`, keyed by IP **and** by username, so distributed guessing against one account is caught. Emits `AUTH_TOO_MANY_ATTEMPTS` (429). Every attempt, allowed or blocked, is written to the login-attempt audit. Generic `RATE_LIMITED` (429) is available for other routes. A global `ThrottlerModule` (300 requests per `AUTH_RATE_LIMIT_TTL_SECONDS`) is already wired in `backend/src/app.module.ts`, but no auth route exists to scope it to. **No blueprint document specifies attempt counts or lockout duration.** The scaffold defaults to `AUTH_RATE_LIMIT_TTL_SECONDS=60` and `AUTH_RATE_LIMIT_MAX_ATTEMPTS=10` (`backend/src/config/env.schema.ts`, `.env.example`) — implementation placeholders, not an owner decision, and lockout duration remains unspecified (see GAP-06). They must be confirmed by the owner and configured via `application_settings`. | `13_` §8; §27; `03_ARCHITECTURE.md` §14 | Not started |
| **CSRF** | Required "where applicable" alongside cookie sessions. | `13_` §27; `03_ARCHITECTURE.md` §14 | Not started |

---

## 4. Transaction boundaries (`13_` §22) and the endpoint that owns each

`13_` §22 mandates exactly five boundaries. Every one is owned by **one** endpoint in **one** module. `13_` §22: "Never rely on frontend totals for these operations. Recalculate and validate on the server inside the transaction."

| ID | Boundary (`13_` §22) | Owning endpoint | Owning module | Idempotency | Status |
| --- | --- | --- | --- | --- | --- |
| TXN-1 | Purchase receiving | `POST /api/v1/goods-receipts` | `Purchasing` | Proposed — `13_` does not mandate it here | Not started |
| TXN-2 | Sale posting | `POST /api/v1/sales/{id}/post` | `Sales` | **Mandated** — `13_` §12 | Not started |
| TXN-3 | Return / refund / exchange | `POST /api/v1/returns/{id}/post` (exchange: `POST /api/v1/returns/{id}/exchange`) | `ReturnsAndExchanges` | Proposed | Not started |
| TXN-4 | External service posting | `POST /api/v1/external-transactions` (reversal: `POST /api/v1/external-transactions/{id}/reverse`) | `ExternalServices` | **Mandated** — `13_` §13 | Not started |
| TXN-5 | Cash-session closing | `POST /api/v1/cash-sessions/{id}/close` (review: `.../review`; reopen: `.../reopen`) | `CashSessions` | Proposed | Not started |

### TXN-1 — Purchase receiving → `POST /api/v1/goods-receipts`

Steps, in the order `13_` §11 requires (§22 lists the same set):

1. validate PO and permissions (`purchases.receive`; PO must be `approved`/`ordered`/`partially_received` → else `PURCHASE_ORDER_NOT_APPROVED` / `PURCHASE_ORDER_INVALID_STATUS`);
2. validate received quantities (→ `PURCHASE_RECEIVE_EXCEEDS_ORDERED`);
3. validate each IMEI/serial (→ `IMEI_INVALID`, `IMEI_DUPLICATE`, `SERIAL_DUPLICATE`, `PURCHASE_SERIAL_COUNT_MISMATCH`);
4. create goods receipt (number from `SEQUENCE_KEYS.GOODS_RECEIPT`);
5. create inventory units or stock batches — **via the Inventory domain service**;
6. create inventory movements (`purchase_receive`, sign `+1`);
7. preserve actual and landed cost;
8. update received quantities/status (`partially_received` / `received`);
9. update payable impact — **via the Payables domain service**;
10. create audit events.

Cross-module writes at steps 5, 6, 9 and 10 go through the owning modules' services inside the same transaction (§6). Rollback is whole-receipt (`13_` §11).

### TXN-2 — Sale posting → `POST /api/v1/sales/{id}/post`

Steps per `13_` §12 (§22 restates them; `03_ARCHITECTURE.md` §6 adds "enqueue receipt/notification **after commit**"):

1. revalidate user, session and branch (→ `SALE_CASH_SESSION_REQUIRED`);
2. revalidate stock and unit state **under row lock** (→ `INVENTORY_UNIT_NOT_AVAILABLE`, `INVENTORY_UNIT_ALREADY_SOLD`, `INVENTORY_INSUFFICIENT_STOCK`);
3. create sale and immutable line snapshots;
4. preserve actual COGS (never recomputed later from an edited supplier cost — `03_ARCHITECTURE.md` §8);
5. create payment allocations / receivable (→ `SALE_PAYMENT_MISMATCH` if payment + receivable ≠ total, `13_` §23 rule 14);
6. create stock movements (`sale`, sign `-1`);
7. mark serialized units `sold`;
8. create financial entries — via the FinancialLedger service, with a source key (→ `LEDGER_DUPLICATE_POSTING`);
9. create audit events;
10. generate the final invoice **after successful posting** (`SEQUENCE_KEYS.SALE_INVOICE`).

Receipt rendering and notification dispatch happen **after commit**, so a printer or notification failure can never roll back a posted sale (`03_ARCHITECTURE.md` §6, §13). Budget: `PERFORMANCE_TARGETS.SALE_POSTING_MS` = 2000.

### TXN-3 — Return / refund / exchange → `POST /api/v1/returns/{id}/post`

Per `13_` §22: return records; unit state or stock quantity; refund/credit; revenue and COGS adjustment; financial entries; audit. The unit transitions `sold → returned_inspection` — never straight to `available` (`13_` §12; enforced by `SERIALIZED_STATE_TRANSITIONS`). An exchange posts the return and the replacement sale in **one** transaction, so a customer can never end up with a refund and no replacement, or vice versa.

### TXN-4 — External service posting → `POST /api/v1/external-transactions`

Per `13_` §22: fee calculation snapshot; provider/customer amounts; cash-session impact; financial entries; audit. The fee is recalculated server-side from the effective fee rule using `shared/src/fee-rules.ts` and **snapshotted onto the row**; the client-supplied fee is never trusted. The cash leg is read from the rule's `CASH_DIRECTIONS` value. Principal is recorded but is **never** posted as revenue or profit (`13_` §23 rule 15). Duplicate provider references → `EXTERNAL_REFERENCE_DUPLICATE` (409) via a unique constraint (`13_` §13).

### TXN-5 — Cash-session closing → `POST /api/v1/cash-sessions/{id}/close`

Per `13_` §22: expected totals; counted amount; variance; status transition; review metadata; audit. Expected cash is recomputed inside the transaction from sales, refunds, external-service cash legs, drawer expenses, deposits and removals — never accepted from the client. Variance is stored with its reason (`13_` §23 rule 16: "Cash mismatch is recorded, not hidden"); `13_` §14: "Never manipulate sales records to hide a cash mismatch." Status moves through `CASH_SESSION_STATUSES`. `.../review` and `.../reopen` reuse the same boundary shape for their own status transitions plus review metadata and audit.

---

## 5. Endpoints deliberately **not** offered

Each absence is an enforced rule, not an oversight.

| Endpoint that does not exist | Rule it would break |
| --- | --- |
| `PATCH`/`PUT` on a posted sale | `13_` §23 rule 9; `SALE_POSTED_IMMUTABLE` |
| `DELETE` on a posted sale, return, payment or ledger entry | `13_` §23 rules 9–10; `03_ARCHITECTURE.md` §16 ("no deleting posted transactions") |
| `PATCH /api/v1/inventory/{id}/quantity` (direct counter edit) | `13_` §23 rule 8; `INVENTORY_DIRECT_EDIT_BLOCKED` |
| `DELETE /api/v1/serialized-units/{id}` where history exists | `13_` §10; `INVENTORY_UNIT_HAS_HISTORY` |
| `POST /api/v1/ledger/entries` (generic manual posting) | `13_` §16 — every entry links to a source type and ID |
| `POST /api/v1/audit` (manual audit write) | `03_ARCHITECTURE.md` §9 — append-only, system-written |
| `POST /api/v1/receivables` (standalone receivable) | `13_` §16 — a receivable must originate in a sale or credit note |
| Any endpoint that approves/orders a PO from a recommendation | `13_` §23 rule 19; `RECOMMENDATION_AUTO_ORDER_BLOCKED` |
| `DELETE /api/v1/users/{id}` | `13_` §8 — activation/deactivation, so history keeps its actor |
| Stock increase on PO creation | `13_` §23 rule 5 — "A PO does not create available stock" |

---

## 6. Module ownership rule

**`13_` §7:** "Modules may share one PostgreSQL database, but one module must not bypass another module's domain service to mutate its tables."
**`03_ARCHITECTURE.md` §4:** "Modules may share a PostgreSQL database but must not bypass another module's rules by directly mutating its tables."

### 6.1 The rule as implemented

1. **One module owns each table.** Only the owning module's repository holds a Prisma write client for it.
2. **Cross-module writes go through the owning module's domain service**, which is injected and called **inside the caller's transaction** (Prisma interactive transaction; the transaction client is passed down). Atomicity per `13_` §22 is preserved without breaking encapsulation.
3. **Cross-module reads** may use a published read model or the owning module's query service. Reporting is read-only everywhere (§2.23).
4. **No module imports another module's Prisma repository.** Only its public service interface.
5. **Shared vocabulary lives in `shared/`**, never duplicated per module — the enums, permission keys, error codes, money, IMEI, phone, datetime and fee-rule helpers are already implemented and verified there.
6. **No circular dependencies** (`13_` §1 rule 10). Where two modules would need each other, the dependency inverts through an interface owned by the lower-level module.

### 6.2 Table ownership and the legal cross-module write paths

| Table group (`13_` §19) | Owning module | Who else writes, and only via that module's service |
| --- | --- | --- |
| `organizations` | `Organizations` | — |
| `branches` | `Branches` | — |
| `stock_locations` | `Locations` | — |
| `users` | `Users` | `Auth` (last-login/session metadata) |
| `roles`, `permissions`, `role_permissions`, `user_roles`, `user_scope_access` | `RolesAndPermissions` | `Users` (role/scope assignment at creation) |
| `categories`, `brands`, `product_models`, `product_variants`, `product_aliases`, `product_barcodes` | `Catalog` | `Demand` (convert-to-catalog-entry) |
| `customers` | `Customers` | `Sales`, `Demand` |
| `customer_demand_requests`, demand items/follow-ups | `Demand` | `Sales` (`converted_to_sale`) |
| `suppliers`, `supplier_products`, `supplier_quotes` | `Suppliers` | `Purchasing` (price history on receipt) |
| `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines` | `Purchasing` | `Recommendations` (draft PO only) |
| `serialized_inventory_units`, `stock_batches`, `inventory_movements`, `stock_balances`, `reservations`, `stock_counts`, `stock_adjustments` | `Inventory` | `Purchasing` (TXN-1), `Sales` (TXN-2), `ReturnsAndExchanges` (TXN-3) |
| `sales`, `sale_lines` | `Sales` | `ReturnsAndExchanges` (status → `partially_returned`/`returned`) |
| `payments`, `payment_allocations` | `Payments` | `Sales` (TXN-2), `Receivables`, `Payables` |
| `returns`, `return_lines`, `refunds` | `ReturnsAndExchanges` | — |
| `external_service_providers`, `external_service_types`, `external_fee_rules`, `external_transactions` | `ExternalServices` | — |
| `cash_sessions`, cash movements, `cash_reconciliations` | `CashSessions` | `Sales`, `Payments`, `ExternalServices`, `Expenses` (drawer impact) |
| `expense_categories`, `expenses` | `Expenses` | — |
| `receivables` | `Receivables` | `Sales` (credit sale), `ReturnsAndExchanges` (credit note) |
| `payables` | `Payables` | `Purchasing` (TXN-1 payable effect, purchase return) |
| `financial_accounts`, `financial_entries` | `FinancialLedger` | `Sales`, `Payments`, `ReturnsAndExchanges`, `ExternalServices`, `Expenses`, `Receivables`, `Payables`, `Purchasing` — all with a source type from `LEDGER_SOURCE_TYPES` + source ID + idempotency key |
| `daily_product_metrics`, `recommendation_runs`, `purchase_recommendations`, `recommendation_decisions` | `Recommendations` | — |
| `notifications`, `tasks` | `Notifications` | any module, post-commit only |
| `documents`/attachments | `Documents` | `Purchasing`, `ExternalServices`, `Expenses`, `ReturnsAndExchanges` |
| `number_sequences` | **⚠ GAP-05** — `13_` §7 lists no owning module | `Sales`, `Purchasing`, `ReturnsAndExchanges`, `ExternalServices`, `Expenses`, `CashSessions` (all consume `SEQUENCE_KEYS`) |
| `application_settings` | `Settings` | — |
| `audit_events` | `Audit` | every module (append-only, in-transaction) |
| `outbox_events` (where justified) | **UNKNOWN — not determinable from the repository.** `13_` §19 says "outbox_events where justified"; no document names an owner. | — |

---

## 7. Open gaps — decisions with no source in the repository

Recorded, not invented. Each needs a product-owner decision before the relevant slice.

| ID | Gap | Affected endpoints | Interim position in this map |
| --- | --- | --- | --- |
| GAP-01 | **No permission key exists for organization/branch/location administration.** `shared/src/permissions.ts` has no `organizations.*`, `branches.*` or `locations.*` key. `13_` §8 assigns "user and permission management" and "fee and system configuration" to Owner but never names branch administration. | §2.2, §2.3, §2.4 | Reuse `settings.view` / `settings.manage` (owner-only for manage). Adding keys is a change to a verified-green shared package and must be a deliberate decision, not a silent edit. |
| GAP-02 | **No permission key for creating external-service providers or expense categories.** These are reference data; `external_fee_rules.manage` covers rules only, `expenses.create` covers expenses only. | §2.17, §2.19 | Reuse `settings.manage`. |
| GAP-03 | **No permission key for notifications.** | §2.25 | Authenticated user, own notifications only, enforced by the scope guard. |
| GAP-04 | **No permission key for documents/attachments.** `13_` §27 requires "private document access" but names no key. | §2.26 | UNKNOWN — not determinable from the repository. Proposal: inherit the permission of the entity the document is attached to. Needs a decision. |
| GAP-05 | **No module owns `number_sequences`.** It is required by `13_` §19 and consumed by six modules; `13_` §7 lists no home for it. | Sales, Purchasing, Returns, ExternalServices, Expenses, CashSessions | UNKNOWN — not determinable from the repository. Proposal: a shared infrastructure service under `backend/src/common/sequences/`, not a §7 domain module, since adding a 30th module would contradict §7's fixed list. |
| GAP-06 | **No auth rate-limit thresholds are mandated.** `13_` §8 and §27 require rate limiting; no blueprint document gives attempt counts, window or lockout duration. | `POST /api/v1/auth/login`, `POST /api/v1/auth/password` | The Slice 0 scaffold defaults to 60 s / 10 attempts (`backend/src/config/env.schema.ts`, `.env.example`) — a placeholder chosen by the implementation, not an owner decision. Lockout duration is still UNKNOWN — not determinable from the repository. Must be owner-decided and stored in `application_settings`. |
| GAP-07 | **No permission key for quotations/reservations as a distinct action.** `01_PRD` §5.6 and `13_` §8 give the salesperson "quotations, demand, reservations and sales"; `permissions.ts` has `inventory.reserve` but no `quotations.*`. | Quotation endpoints (not enumerated in this map) | `inventory.reserve` covers reservations. Quotations are UNKNOWN — not determinable from the repository; no quotation endpoints are proposed here. |
| GAP-08 | **Return window/policy is unspecified.** `RETURN_WINDOW_EXPIRED` exists in `errors.ts`, but no document states the window. | §2.16 | UNKNOWN — not determinable from the repository. Must be configurable in `application_settings`. |
| GAP-09 | **Idempotency is mandated only for sale posting (`13_` §12), external transactions (`13_` §13) and payment/integration callbacks (`01_PRD` §7).** Every other `Idem: Proposed` cell is this document's recommendation, not a blueprint requirement. | All `Proposed` cells | Proposed, pending decision. |

---

## 8. Blocked work

| Blocker | Verified status | What it blocks in this map |
| --- | --- | --- |
| **Database credentials unavailable** | Verified: PostgreSQL 18.4 is running on port 5432 (service `postgresql-x64-18`); `psql` client at `D:\postgresql\bin\psql.exe`; credentials not available | Migrations, seeds, integration tests, and a genuinely green `GET /api/v1/health/ready`. Every module below Slice 0 depends on this. |
| **Docker not installed** | Verified | `13_` §25 Slice 0 "Docker PostgreSQL"; `13_` §31 step 3 ("start PostgreSQL and required services through Docker Compose"). Local PostgreSQL 18.4 is the interim path. |

---

## 9. Summary counts

| Metric | Count |
| --- | --- |
| Modules in `13_` §7 mapped here | 29 |
| Modules with status `In progress` | 1 (`Health`, Slice 0 foundation) |
| Modules with status `Not started` | 28 |
| Base paths enumerated verbatim in `13_` §20 | 27 |
| Transaction boundaries mandated by `13_` §22 | 5 (TXN-1 … TXN-5), each owned by exactly one endpoint |
| Permission keys available in `shared/src/permissions.ts` | 73 (`ALL_PERMISSIONS`) across 7 role codes (`ROLES`) |
| Error codes available in `shared/src/errors.ts` | 65 (`ERROR_CODES`); 26 have a non-400 default in `DEFAULT_ERROR_STATUS`, the rest fall back to 400 |
| Permission keys invented by this document | **0** |
| Error codes invented by this document | **0** |
| Endpoints implemented and verified | **0** — `backend/node_modules` is not installed, so the backend does not currently typecheck and no backend test has been run |
| Endpoints scaffolded but unverified | **2** — `GET /api/v1/health`, `GET /api/v1/health/ready` (`backend/src/modules/health/`) |
| Open gaps requiring an owner decision | 9 (GAP-01 … GAP-09) |
