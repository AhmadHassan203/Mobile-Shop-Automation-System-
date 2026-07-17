# Handoff — `all-modules-sprint` (breadth-first module sprint)

_Last updated by Claude. Branch `all-modules-sprint`, pushed to `origin/all-modules-sprint`._

> **SPRINT 2 — Dashboard + Finance command centre COMPLETE (browser-verified, reconciled).**
> The Dashboard and the Finance & Cash page are now genuinely live — no misleading "pending"/"not built" placeholders remain for sources that exist.
>
> **Architecture.** The Dashboard stays a single read-model endpoint (`GET /reports/dashboard`); the page makes one request. `DashboardService` is a read-model **orchestrator** that reuses each owning module's own logic (no duplicated business math):
> - Money KPIs (sales/gross/expenses/net-operating) + P&L come from the finance summary (`DashboardService.summary`, i.e. `GET /reports/dashboard/summary`).
> - Digital sent/received/fees/**provider charges**/net-earnings reuse `ExternalService.balances` + `commission`.
> - Cash position reuses a new `CashService.position` (the expected-drawer formula was extracted and is now shared with `close()` — single source of truth for cash).
> - Recent sales reuse `SalesService.list`; demand top-unmet is a new tenant/branch-safe `DemandService.topUnmet` aggregation (the one place no reusable read existed); reorder budget reuses `DashboardService.reorderSuggestions`.
> - Each snapshot section loads independently (`safe()` wrapper): one failing source degrades only its own card to *temporarily unavailable*, never a false "coming soon".
> - `DashboardModule` now imports Sales/External/Cash/Demand modules; `DashboardActorContext` carries the fields needed to build each sub-context.
>
> **Finance read model extended (reused by Dashboard + Reports + Finance):** `DailyFinancialSummary` gained `discountsMinor`, `returnsMinor`, `netSalesMinor` (Σ posted `sale.discount_minor`, Σ posted `returns.total_refund_minor`, revenue−returns). Schema refine enforces `netSales === revenue − returns`. The verified fields (revenue/cogs/grossProfit/serviceProfit/expenses/estimatedNetProfit) are unchanged, so the P&L waterfall stays exact and identical to the Dashboard; discounts/returns/net-sales render as a clearly-labelled **contra-revenue memo**.
>
> **State semantics (frontend):** `source_not_built → "Coming soon"`, `source_not_configured → "Not configured"` (e.g. no open cash session), `temporarily_unavailable → "Temporarily unavailable"`, and an implemented source with no data → **PKR 0.00** (never "—"/"Unavailable"). Only genuinely-unbuilt sources (Tasks) read "Coming soon".
>
> **Verification (all green):** backend + frontend + shared typecheck; backend 314 unit + frontend 359 + shared 569 tests; backend/frontend/shared eslint clean. Authenticated Playwright smokes on a fresh `mobileshop_test` stack: `dashboard-workspace.spec.ts`, `finance-command-centre.spec.ts`, plus the existing `finance-closing`, `digital-workspace`, `readmodels-runtime` all pass. **Reconciled live:** Dashboard KPIs == `/summary` == raw Postgres aggregates; digital sent/received/fees/charges/net == `/external/balances`+`/external/commission` == raw rows; discounts/returns/netSales == raw rows. Finance reuses the same `/summary` + snapshot, so Dashboard == Finance == Reports == Digital by construction for the same business date.
>
> **New/changed files:** `shared/src/dashboard-summary.ts`; `backend/.../dashboard.{service,controller,module}.ts` (+specs), `cash/cash.service.ts`, `demand/demand.service.ts`; `frontend/.../dashboard/workspace-dashboard.tsx` (+spec), `finance/finance-workspace.tsx` (+new spec); `e2e/tests/dashboard-workspace.spec.ts`, `e2e/tests/finance-command-centre.spec.ts`.
>
> **Notes for next session:** (1) The **sidebar `ModuleStatus` in `app-shell.tsx` is a static hand-set flag**, not derived from runtime — Finance/Dashboard `"ready"` is now backed by the verification above, but the flag itself won't auto-reflect regressions. (2) Pre-existing e2e lint debt: `e2e/tests/readmodels-runtime.spec.ts` has 37 `no-unsafe-member-access` errors from a prior commit (not touched this sprint). (3) A `mobileshop_test` stack may still be running (backend `node dist/main` :4000 with test `DATABASE_URL`, frontend `next dev` :3000). Restart the backend against the root `.env` (dev) URL before resuming normal dev work.

> **UPDATE — runtime gate COMPLETE (commit a649c7b).** The runtime + browser gate described below has now PASSED, and these five modules are **READY**: Transaction History, Service Balances, Commission, Reports, Reorder Intelligence. Verified on a fresh stack against **mobileshop_test** (backend `node dist/main` on :4000, rebuilt frontend `next start` on :3000) via `e2e/tests/readmodels-runtime.spec.ts` (2 passed): live routes 200+shape; `/external/<well-formed-ghost-uuid>` → 404; independent money cross-check (commission `grossFeeMinor==Σ feeChargedMinor`, `providerCostMinor==Σ providerChargeMinor`, `count==rows`; balances `netMovementMinor==received−sent`); and all five pages render real authenticated data. The live NestJS router registration confirms `/external/:id` is the **last** GET (static routes not shadowed). ⚠️ **The currently-running backend is on `mobileshop_test`, not dev** — if you resume normal dev work, restart it against the root `.env` (dev) URL. Still `building` (unverified): Reconciliation (needs backend), Repairs/Warranty/Used-Intake (foundation in `stash@{0}`, needs a migration), Tasks/Settings (need new tables).

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
