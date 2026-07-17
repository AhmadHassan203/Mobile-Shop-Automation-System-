# Handoff — `all-modules-sprint` (breadth-first module sprint)

_Last updated by Claude before context handoff. Branch `all-modules-sprint`, HEAD `1097f3e`, pushed to `origin/all-modules-sprint`._

## Safety state (do not violate)
- **Branch:** work only on `all-modules-sprint`. Do NOT merge into `main` or `mvp-integrated-checkpoint`.
- **Backup tag:** `verified-mvp-before-all-modules` @ `a93b153` (pre-sprint MVP).
- **Never** force-push, `reset --hard`, `clean -fd`, rebase, or rewrite history.
- **DB:** destructive/seed/migrate/write ops **only** against `mobileshop_test`. **Never** touch `mobileshop_dev`.
  - ⚠️ Root `.env` `DATABASE_URL` points at **`mobileshop_dev`**. The test-DB stack must be launched with an explicit `mobileshop_test` `DATABASE_URL` override. Confirm the DB target **before any write** (e.g. before recording a transaction for a cross-check).
- **Repairs foundation** is in `git stash@{0}` ("repairs-foundation-wip-deferred: schema+shared contracts, no migration"). Apply with `git stash apply` (NEVER `pop`), and only on this branch.
- Only the orchestrator edits `shared/`, `database/` (schema/migrations/seeds), `backend/src/app.module.ts`, and sidebar nav (`frontend/src/components/app-shell/app-shell.tsx`).

## Done + verified (READY, browser-smoked, committed 7bc10ad)
- External-service **accounting fix** (full `feeChargedMinor` → SERVICE-REVENUE, `providerChargeMinor` → SERVICE-COST, principal in SERVICE-FLOAT; ledger balances) and **retry-safe idempotency** — committed `2588f83`, runtime-verified.
- Sidebar **READY**: **Finance** (`/finance`), **Daily Closing** (`/closing`), **New Transaction** (`/digital/new`).
- Inherited from MVP checkpoint (already working): Sales/POS, Customers, Demand, Returns, Product Catalog, Dashboard summary.

## Implemented + CODE-verified, RUNTIME/BROWSER PENDING (committed 1097f3e)
Two agents delivered; all **code-level** gates pass (backend+frontend `tsc` exit 0; new specs green; no forbidden edits; permissions pre-exist; route order correct; Karachi date + tenant isolation + money cross-check unit tests green). **Sidebar nav for these is still `status:"building"` — do NOT flip to `"ready"` until the runtime + browser gates below pass (rule 13).**

**Agent A — Digital (backend `modules/external`, frontend `components/digital` + `lib/api/external.ts` + `lib/query/external-query.ts`):**
- `GET /external/balances` (perm `external.view`) → `{ businessDate, providers:[{ provider, amountSentTodayMinor≥0, amountReceivedTodayMinor≥0, netMovementMinor(signed), transactionCount, lastTransactionAt|null, openingBalanceMinor:null, currentBalanceMinor:null, lowBalanceThresholdMinor:null }] }`. Only providers with activity today appear.
  - **Formula (documented + tested): `netMovementMinor = amountReceivedTodayMinor − amountSentTodayMinor`** (received − sent; cash-in-heavy provider shows negative). `sent = Σ principal where direction=cash_in`, `received = Σ principal where direction=cash_out`.
- `GET /external/commission?period=day|week|month` (perm `external.view`) → `{ period, from, to, totals:T, byProvider:[T&{provider}], byType:[T&{transactionType}] }`, `T={ grossFeeMinor≥0, providerCostMinor≥0, netCommissionMinor(=gross−cost), transactionCount }`.
- Route order: `@Get()` → `@Get("balances")` → `@Get("commission")` → `@Post()` → `@Get(":id")` (`:id` LAST — static routes never shadowed).
- Pages wired: **history** (real list + filters mapped to API params + detail drawer via `GET /external/:id`), **balances**, **commission**. Honestly-disabled: history status/direction filters + status-change/reversal actions (backend has no such workflow — external txns are immutable). Frontend permission gate switched to `external.view` (matches API guard) via `externalCapabilities`.

**Agent C — Reports/Intelligence (backend `modules/dashboard`, frontend `components/reports` + `components/intelligence` + `lib/api/reports.ts` + `lib/query/reports-query.ts`):**
- `GET /reports/dashboard/sales-trend?days=1..31` (perm `reports.view_financial`) → `{ from,to,days, points:[{businessDate, salesRevenueMinor, cogsMinor, grossProfitMinor, salesCount}] }` (missing days as explicit zeros; `points.length===days`).
- `GET /reports/dashboard/top-products?period&limit` (perm `reports.view_financial`).
- `GET /reports/dashboard/reorder-suggestions?windowDays&limit` (perm `recommendations.view`).
- All static routes (no `:id` on dashboard controller). Reports panels REAL: P&L (reuses `/summary`), sales trend, top products. Intelligence REAL: reorder plan summary + recommendations table. Honestly unavailable: inbound-on-order, supplier lead time, purchase budget/liquidity, PO-create buttons (no schema/workflow).

## OPEN — runtime gate (blocks READY flip). Do these next:
1. **Clean-restart the stack on `mobileshop_test`** (explicit test `DATABASE_URL`). Backend dev cmd: `nest start --watch` (`pnpm --filter ./backend dev`), port 4000, **global prefix `api/v1`**. Frontend: `next dev` (`pnpm --filter ./frontend dev`), port 3000.
   - ⚠️ On the currently-running :4000, `GET /api/v1/external/balances` → **401 (live+guarded, good)** but `GET /api/v1/reports/dashboard/sales-trend` → **404** — Agent C's routes did NOT hot-reload. A clean restart is required; then confirm all 6 new routes resolve.
2. **Live route checks** (authenticated): balances / commission / sales-trend / top-products / reorder-suggestions → **200 + shape**; `GET /external/<real-id>` → 200; `GET /external/<well-formed-but-nonexistent-UUID>` → **404** (NOTE: a *malformed* id like `not-a-real-id` → **400** from the uuid pipe, not 404 — use a valid-format random UUID to observe 404).
3. **Independent money cross-check vs raw DB** (real Postgres SQL, not the unit-test fake): reduce raw `external_transactions` rows for the scoped tenant and assert `commission.totals.grossFeeMinor == Σ feeChargedMinor`, `providerCostMinor == Σ providerChargeMinor`, `netCommissionMinor == gross−cost`; balances `netMovementMinor == received − sent`. (A clean read-only variant: reduce the `GET /external` list rows within `[from,to]` and compare to the aggregate endpoint.)
4. **Live tenant isolation** (both agents proved this only at unit level with a WHERE-honoring fake — the DB-seeded 2-tenant version was outside their allowed paths). Recommended: insert a few `external_transactions` under a *different* org id into `mobileshop_test`, query as the demo tenant, assert those amounts never appear in balances/commission.
5. **Authenticated browser smokes** (Playwright, pattern in `e2e/tests/digital-workspace.spec.ts` / `finance-closing-workspace.spec.ts`): `/digital/history`, `/digital/balances`, `/digital/commission`, `/reports`, `/intelligence` — assert the GET fires 200 and REAL data renders (not the "unavailable" notice).
6. **Only then** flip the matching sidebar entries in `app-shell.tsx` from `status:"building"` → `"ready"`, commit that module group, and push.

## Remaining modules (not started / deferred)
- **Reconciliation** (`/digital/reconciliation`, page exists ~316 lines) — needs backend; deferred.
- **Repairs / Warranty / Used-Intake** — foundation (schema + shared contracts) in `stash@{0}`, **no migration**. Needs: `git stash apply` → orchestrator forward-only migration → `migrate diff` must report "No difference detected" (raw-SQL blocks are invisible to diff) → backend module (+ `app.module.ts` registration) → frontend → smoke. Large; treat as its own domain.
- **Tasks**, **Settings** — not started (Tasks needs a new table → migration).

## Verification quick-reference
- Combined typecheck: `pnpm --filter ./backend typecheck && pnpm --filter ./frontend typecheck` (both exit 0 now).
- Backend proving specs: `pnpm --filter ./backend exec vitest run src/modules/external/external.controller.spec.ts src/modules/external/external.reads.spec.ts src/modules/dashboard/dashboard.service.spec.ts` (currently 24/24 green — mock-based, no DB).
- Money is integer minor units (paisa); BigInt at DB boundary; business date = Asia/Karachi via `toBusinessDate` (`@mobileshop/shared`, `shared/src/datetime.ts`); filter the stored `business_date` column, never `toISOString().slice(0,10)` on a wall-clock instant.
