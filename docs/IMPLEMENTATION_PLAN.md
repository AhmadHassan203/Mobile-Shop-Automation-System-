# Implementation Plan

Derived from `13_PRODUCTION_MASTER_BUILD_PROMPT.md` §25 (implementation sequence) and §6 (vertical slices). Sequenced so each slice delivers a working end-to-end business capability, not a layer.

**Definition of done for every slice** (`13_` §6, `05_RULES.md` §10). A slice is complete only when all of the following are true and *executed*:

1. Database schema + reviewed migration
2. Backend domain rules and transaction boundaries
3. API endpoints with server-side authorization
4. Frontend pages wired to real APIs (no mock data)
5. Loading, empty, success and error states
6. Audit events
7. Unit + integration tests
8. E2E test coverage
9. Lint, typecheck, tests and production builds run and passing
10. `BUILD_STATUS.md` and `07_MEMORY.md` updated with verified facts only
11. Clean git commit

A feature with only UI, only an API, or only a schema is **not** done (`13_` §6).

---

## Architecture decisions carried into every slice

| Decision | Source |
|---|---|
| Flat root structure (`frontend/`, `backend/`, `database/`, `shared/`, …) | CON-001, `13_` §1 |
| Modular monolith — no microservices | `03_ARCHITECTURE.md` §1, `13_` §4 |
| Money as integer minor units, never float | `05_RULES.md` §7, `13_` §23.11 |
| Authorization enforced on the backend; UI gating is affordance only | `13_` §23.20 |
| Movements are the authoritative stock ledger; counters are never edited | `13_` §23.7-8 |
| Posted records are immutable; corrections use controlled workflows | `13_` §23.9-10 |
| No module mutates another module's tables | `13_` §7, `03_ARCHITECTURE.md` §4 |
| `organization_id` / `branch_id` / `location_id` present from day one; no branch selector in the launch UI | `13_` §8, ASM-017 |
| Serialized units locked inside the transaction (`SELECT … FOR UPDATE`) | `13_` §22, `03_ARCHITECTURE.md` §7 |
| Idempotency keys on retryable writes | `13_` §12, §20 |

---

## Slice status overview

| # | Slice | Status | Blocked by |
|---|---|---|---|
| 0 | Audit and repository foundation | **In progress** | — |
| 1 | Authentication and access | Not started | CON-009 (DB) |
| 2 | Catalog | Not started | CON-009 |
| 3 | Inventory foundation | Not started | CON-009 |
| 4 | Suppliers, purchasing, receiving | Not started | CON-009 |
| 5 | POS and sales | Not started | CON-009 |
| 6 | Returns and exchanges | Not started | CON-009 |
| 7 | External services | Not started | CON-009 |
| 8 | Cash sessions and expenses | Not started | CON-009 |
| 9 | Customer demand | Not started | CON-009 |
| 10 | Finance and reporting | Not started | CON-009 |
| 11 | Reorder intelligence | Not started | CON-009 |
| 12 | Dashboard and command center | Not started | CON-009 |
| 13 | Launch hardening | Not started | CON-008, CON-009 |
| 14 | Approved advanced modules | Not started | core stability |

**CON-009 (missing database credentials) blocks migrations, seeds and integration tests for every slice from 1 onward.** Schema authoring, backend/frontend code, unit tests, lint, typecheck and builds all proceed regardless; they are simply not *verified against a live database* until credentials arrive.

---

## Slice 0 — Audit and repository foundation

**Objective.** A verified baseline: clean structure, shared contracts, health/observability, and a green lint/typecheck/test pipeline.

**Done**
- Repository + prototype audit → `docs/CURRENT_REPOSITORY_AUDIT.md`
- Conflicts resolved → `docs/REQUIREMENT_CONFLICTS_AND_DECISIONS.md` (11 conflicts)
- Assumptions recorded → `docs/ASSUMPTIONS.md` (18)
- Git initialised on `main`; workspace root (`pnpm-workspace.yaml`, `package.json`, `.gitignore`, `.env.example`)
- `shared/` built and **verified green** — lint 0, typecheck 0, **153/153 tests**, build emits `dist/`

**Remaining**
- `backend/` NestJS skeleton: config, pino JSON logging, request/correlation IDs, `DomainError` → `ApiErrorBody` filter, OpenAPI, `/health` + `/ready`
- `frontend/` Next.js skeleton: App Router, Tailwind 4 carrying the prototype's design tokens, TanStack Query, API client
- `database/` Prisma project layout (schema authored in Slice 1)
- `e2e/` Playwright config; `infrastructure/` Compose + proxy; `scripts/` provisioning/backup/restore; `.github/workflows/` CI
- Root `verify` pipeline green across all packages

**Acceptance.** `pnpm verify` passes. `/health` and `/ready` respond. Every log line carries a request ID. Docker files exist but are marked **not executed** (CON-008).

---

## Slice 1 — Authentication and access

**Objective.** A real user can log in securely; every subsequent request is authorised and attributable.

**Database.** `organizations`, `branches`, `stock_locations`, `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_scope_access`, `sessions`, `audit_events`, `application_settings`, `number_sequences`.

**Backend.** `Auth` (login/logout/me, Argon2id per ASM-012, rate limiting), `Organizations`, `Branches`, `Locations`, `Users`, `RolesAndPermissions`, `Audit`, `Settings`. Guards: authentication → permission → scope.

**Frontend.** `/login`, app shell reproducing the prototype nav, permission-aware navigation, session expiry handling.

**Authorization.** Every endpoint carries a permission key from `shared/src/permissions.ts`. Scope guard enforces org/branch/location.

**Audit.** Login success/failure, logout, user create/update/deactivate, role and permission changes.

**Tests.** Unit: permission resolution (done in `shared`), password hashing, session expiry. Integration: login flow, rate limiting, inactive user rejection, cross-scope access blocked, audit written. E2E: login → dashboard; unauthorized action blocked.

**Acceptance.** Seeded owner logs in. A salesperson cannot reach cost/profit data — enforced by the API, verified by test, not merely hidden in the UI.

**Migration risk.** Low — first migration from empty.

---

## Slice 2 — Catalog

**Objective.** Products can be defined and found fast at the counter, including items with no barcode.

**Database.** `categories`, `brands`, `product_models`, `product_variants`, `product_aliases`, `product_barcodes`, `product_attributes`, `price_lists`, `price_entries`.

**Key rules.** A variant is not a physical phone (`04_DATA_MODEL.md` §3). Tracking type is locked once transactions exist (`05_RULES.md` §2). Products without a barcode remain searchable/sellable by SKU, model, brand, category and quick selection (`13_` §9). Aliases support local spellings and typos.

**Tests.** Unique SKU/barcode; search by SKU/model/brand/alias; tracking-type lock; search under the `01_PRD.md` §7 500 ms target.

---

## Slice 3 — Inventory foundation

**Objective.** Every physical phone is individually tracked and every stock change is a movement.

**Database.** `serialized_inventory_units`, `stock_batches`, `inventory_movements`, `stock_balances` (read model), `reservations`, `stock_counts`, `stock_adjustments`.

**Key rules.** Unique normalized IMEI1/IMEI2/serial per organization enforced **in the database**. No negative stock. No direct counter editing. Every change writes a movement. State transitions validated against `SERIALIZED_STATE_TRANSITIONS`. Bulk IMEI paste with pre-save duplicate validation (already implemented in `shared/src/imei.ts`).

**Tests.** Duplicate IMEI rejected at the DB level; state machine legality; balances rebuilt from movements match the read model; adjustment requires reason + permission.

---

## Slice 4 — Suppliers, purchasing and receiving

**Objective.** Stock enters the shop only through receiving, with true cost captured.

**Database.** `suppliers`, `supplier_contacts`, `supplier_products`, `supplier_quotes`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`, `purchase_returns`, `payables`, `supplier_payments`.

**Transaction** (`13_` §11, atomic): validate PO + permissions → validate quantities → validate each IMEI → create receipt → create units/batches → create movements → allocate landed cost (ASM-006) → update PO totals/status → update payable → audit.

**Tests.** A PO does **not** increase stock; partial receiving; **duplicate IMEI rolls the whole receipt back**; payable effect correct; landed cost sums exactly to the amount allocated.

---

## Slice 5 — POS and sales

**Objective.** The counter flow works: `Find → Select → Cart → Customer → Payment → Review → Complete → Receipt`.

**Transaction** (`13_` §12, atomic): revalidate user/session/branch → **lock and revalidate units** → create sale + immutable line snapshots → capture actual COGS → payments/allocations/receivable → movements → mark units sold → financial entries → audit → generate invoice after commit.

**Key rules.** Payment + approved receivable must equal sale total exactly. Idempotency keys prevent duplicate submission. Posted sales are immutable. Minimum-margin protection with authorised override + reason.

**Tests.** Serialized sale; accessory sale; split payment; payment mismatch rejected; **two concurrent sales of the same IMEI — exactly one wins**; duplicate submission is idempotent; posting under the 2 s target.

---

## Slice 6 — Returns and exchanges

**Objective.** Corrections happen through controlled workflows, never by editing history.

**Key rules.** Returned serialized units enter `returned_inspection` — **never** straight to `available` (`05_RULES.md` §3). Returns reference the original sale unless an authorised exception applies. Revenue and COGS reverse correctly.

---

## Slice 7 — External services

**Objective.** Send/withdrawal transactions are recorded for cash control, with correct fees and profit.

**Scope includes the prototype's richer model** (CON-006): provider float balances, low-float thresholds, commission, reconciliation, and the 5-status vocabulary.

**Key rules.** Principal is never revenue (`13_` §23.15). `service_profit = fee − provider_charge − other_direct_expense`. Cash direction is explicit and configurable. Fee engine already built and prototype-verified (`shared/src/fee-rules.ts`).

---

## Slice 8 — Cash sessions and expenses

**Objective.** Replace the manual WhatsApp check-and-balance with a real daily close.

**Flow.** open → record activity → system computes expected cash → cashier counts → variance + reason → submit → manager review (ASM-014).

**Key rule.** A mismatch is **recorded, never hidden** (`13_` §14, §23.16).

---

## Slice 9 — Customer demand

**Objective.** Capture what customers asked for and could not buy, in under 20 seconds.

**Key rules.** Demand is recordable with **no catalog match** (`13_` §23.17). Duplicates stay visible historically while forecast dedup prevents inflation. Staff cannot delete demand to improve their metrics (`05_RULES.md` §6).

---

## Slice 10 — Finance and reporting

**Objective.** The owner sees true profit, distinct from cash.

**Required distinctions** (`13_` §16): revenue ≠ cash; inventory purchase ≠ COGS; COGS on sale; owner withdrawal ≠ expense; owner capital ≠ revenue; external principal ≠ profit.

```text
sales_gross_profit = net_sales_revenue − COGS
service_profit     = service_fees − provider_charges − direct_service_expenses
operating_profit   = sales_gross_profit + service_profit + other_income
                     − operating_expenses − recorded_losses
```

Every ledger entry links to source type/ID with an idempotency key. Every report states "Tax excluded" (ASM-015).

---

## Slice 11 — Reorder intelligence

**Objective.** Deterministic, versioned, explainable buying recommendations.

**Key rules.** Deterministic **before** any LLM explanation. Store algorithm version, config snapshot, input window, feature values. Recommendations may create only a **draft** PO after owner action — never auto-approve (`13_` §23.19). Uses ASM-002's three-window ADS.

---

## Slice 12 — Dashboard and command center

**Objective.** The prototype's owner dashboard, with every metric drilling down to source records and showing its definition (`13_` §17).

**Fixes a known prototype defect:** its Recent-sales rows all navigate to the same page. Production needs real per-invoice drill-down (`/sales/:id`).

---

## Slice 13 — Launch hardening

Opening-stock import + dry run, migration rehearsal from zero, backup automation, **restore drill**, security review, monitoring, deployment, UAT, rollback runbook.

**Blocked by CON-008** for container/clean-environment verification.

---

## Slice 14 — Approved advanced modules

Used-device intake, warranty, repairs, notification adapters, optional LLM explanation, external compliance integrations. Behind feature flags, only after the core is stable (`13_` §7).

---

## Cross-cutting workstreams

| Workstream | Cadence |
|---|---|
| Audit events | Every state-changing endpoint, from Slice 1 |
| Tests | Written with the slice, never after |
| `BUILD_STATUS.md` | Updated per slice with **executed** results only |
| `07_MEMORY.md` | Verified facts only |
| ADRs | Any major architecture change |
| Commits | One clean commit per completed slice |
