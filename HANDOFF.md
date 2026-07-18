# MobileShop OS — Session Handoff

**Written:** 2026-07-16 03:35 PKT
**For:** the next session continuing this build.
**Authoritative companions:** `BUILD_STATUS.md` (verified state), `docs/API_MODULE_MAP.md`
(endpoint design + status). Read both. This file only adds what they do not say.

---

## 1. Read this first — honest scope position

The owner's stated goal is the complete system (25+ modules: dashboard, employees,
customers, suppliers, inventory, purchases, POS, returns, repairs, digital services,
accounting, reports, notifications, settings, roles, audit, AI/Intellogene, analytics).

**That is not achievable in one session at the quality bar this repository holds**, and
the bar is the point: every shipped module has tenant isolation, permission enforcement,
Origin/CSRF protection, transaction boundaries, audit evidence, database constraint
backstops, response-contract validation, and real tests at every layer. Slice 2 (Catalog)
alone is ~6,000 lines and 700+ tests.

Do **not** "catch up" by lowering that bar. A fast module that leaks a tenant boundary or
fabricates a stock number is worth less than nothing here — the blueprint's central rule
(`13_` §23) is that the system must never show a number it cannot prove. Build fewer
modules properly and hand off cleanly.

**Recommended order (dependency-forced, do not reorder):**
`Inventory (3) → Pricing → Purchasing (4) → POS/Sales (5) → Returns (6) → the rest.`
POS cannot exist before real stock and real prices. Dashboard/analytics/AI cannot exist
before there is real data to aggregate — building them earlier forces fake KPIs, which is
explicitly forbidden.

---

## 2. Current state

### Committed checkpoints

```text
0d5346c Slice 2: complete the product catalog management workflow   <-- HEAD
e390642 Slice 2: ship authenticated product catalog core
4366145 Slice 0/1: ship authenticated workspace foundation
```

### Live services (both are PRODUCTION builds, not dev servers)

| Service  | Port | Process                                    |
| -------- | ---- | ------------------------------------------ |
| Backend  | 4000 | `node dist/main.js` (cwd `backend/`)       |
| Frontend | 3000 | `node .next/standalone/frontend/server.js` |

**Consequence:** source edits do NOT appear in the browser until you rebuild and restart.
The Next build **cannot run while the standalone server holds `.next`** — stop it first.

```bash
# verify the port owner BEFORE stopping anything
netstat -ano | grep -E ":3000\s" | grep LISTENING
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=<PID>' | Select -Expand CommandLine"
powershell -NoProfile -Command "Stop-Process -Id <PID> -Force"

# rebuild + restart frontend
NEXT_TELEMETRY_DISABLED=1 pnpm --filter ./frontend build
cd frontend && cp -r public .next/standalone/frontend/ ; cp -r .next/static .next/standalone/frontend/.next/
cd .next/standalone/frontend && PORT=3000 HOSTNAME=127.0.0.1 nohup node server.js > /tmp/frontend.log 2>&1 &

# rebuild + restart backend
pnpm --filter ./database build && pnpm --filter ./backend build
cd backend && nohup node dist/main.js > /tmp/backend.log 2>&1 &
```

### Verified test counts at HEAD

| Suite                    | Count |
| ------------------------ | ----- |
| Shared contracts         | 290   |
| Backend unit             | 83    |
| Backend HTTP integration | 150   |
| Frontend                 | 146   |
| Database real-PostgreSQL | 32    |
| Live Playwright          | 2/2   |

Gate command set (all currently green):

```bash
pnpm run format:check && pnpm run lint && pnpm run typecheck
pnpm run test && pnpm run test:integration
pnpm --filter ./shared build && pnpm --filter ./database build && pnpm --filter ./backend build
# frontend build only with :3000 stopped
```

---

## 3. What is DONE

- **Slice 0** — workspace, logging, request IDs, error contracts, health/readiness, CI.
- **Slice 1 (partial)** — real Argon2id login, signed HTTP-only opaque session cookie,
  server-side expiry/revocation, login throttling, append-only login/audit evidence,
  global AuthGuard, global PermissionGuard, global Origin/CSRF guard, permission-aware nav.
- **Slice 2 (COMPLETE)** — Product Catalog. 21 endpoints. Categories, brands, product
  models, products/variants: list/search/filter/paginate/create/edit/deactivate/reactivate,
  product detail, aliases, barcodes, inline reference creation, URL-backed tabs at
  `/inventory`. Nothing hard-deletes. No fake stock/price/IMEI/KPI anywhere.

## 4. Slice 3 Inventory — DONE at the API layer, NO UI yet

Committed and verified: `eb5ca2c` (contracts + migration 0007), `44e7918` (real-
PostgreSQL constraint tests), `d8cb357` (the module, 15 routes, live on :4000).
Migration 0007 is applied to the disposable test DB and to `mobileshop_dev`.

**What Slice 3 still needs — this is the next work:**

1. **A backend HTTP integration spec** — `backend/test/inventory.e2e-spec.ts` does
   not exist. Copy `backend/test/catalog.e2e-spec.ts` and prove over real HTTP:
   401 unauthenticated; 403 without `inventory.adjust`/`reserve`/`transfer` with
   NO write reaching the DB; cross-tenant id ⇒ 404; untrusted Origin ⇒ 403;
   smuggled `organizationId`/`costMinor`/`quantityOnHand` ⇒ 422; stale version ⇒
   409; and a deep key-scan proving no cost/price/org field leaks.
2. **A frontend inventory surface.** There is none. `/inventory` is the CATALOG
   workspace — do NOT overload that route; stock belongs on its own route (e.g.
   `/stock`) with its own nav entry. Until then the APIs are headless.
3. **Receiving.** Nothing creates a serialized unit or a batch yet — that is
   Purchasing (Slice 4) goods-receipt, which owns TXN-1. Today inventory is
   correctly empty; do not seed fake units to make a UI look alive.

### Inventory decisions already made (do not reverse)

- **Quantity endpoints serve quantity-tracked variants only.** A serialized
  variant sent to `/inventory/adjustments|reservations|transfers` returns
  `INVENTORY_DIRECT_EDIT_BLOCKED` — its count is derived from unit rows, so
  writing a counter would invent stock with no handset behind it.
- **Serialized stock is addressed by unit id**, which is why reserve/release and
  transition/transfer for units live on `/serialized-units/:id/...` — that is the
  only place a `SELECT ... FOR UPDATE` lock on the contended row is meaningful.
- **Balances are derived** from the ledger + unit/batch rows. There is no stored
  rollup table, deliberately. Do not add one "for performance" without a proven
  need; a rollup that drifts is exactly the prototype's `DB.stock` bug.
- `AdjustStockInputSchema.movementType` is restricted to
  `adjustment_in|adjustment_out` so a sale cannot be posted as an adjustment.
- `stock_locations` came from migration 0001 and already had a `kind` enum and a
  `VARCHAR(20)` code — 0007 extended it rather than duplicating it. Contract
  limits are pinned to the applied column widths: a wider contract would accept
  values the database rejects and turn a caller error into a 500.

---

## 5. Hard-won knowledge — read before touching the database

1. **Never reset any database.** `mobileshop_dev` holds real owner data:
   the product `PH-BRAND-VARIANT` / variant `256gb`, plus seeded `Smartphones` /
   `Unbranded` / `Generic smartphone`. Use `migrate deploy` (additive). Test on the
   disposable DB (`TEST_MIGRATION_DATABASE_URL`) first, always.
2. **Never edit an applied migration.** 0001–0007 are applied. Correct forward only.
3. **Prisma 7 CLI:** `--shadow-database-url` is NOT a flag; the shadow URL comes from
   `database/prisma.config.ts`. Use `--to-schema` (not `--to-schema-datamodel`).
4. **Prisma cannot express partial indexes or CHECK constraints.** `migrate diff` ignores
   them. So a partial unique index MUST be left out of `schema.prisma` or diff reports
   drift. This is why `ProductAlias`/`ProductBarcode` have no `@@unique` — the rule lives
   only in SQL and is documented inline. Follow that pattern.
5. **`prisma.config.ts` env precedence:** process env overrides the file
   (`{...loadBackendRuntimeEnvironment(), ...environment}`), so
   `DATABASE_URL=<test> node dist/main.js` cleanly re-points the API at the test DB.
6. **The runtime role's REVOKE masks the no-hard-delete triggers** (you get `42501`, not
   `55000`). Both layers exist; only a privileged role can observe the trigger.
7. **Retiring a primary barcode must clear `is_primary` in the SAME statement** — the
   `product_barcodes_primary_requires_active` CHECK rejects a two-step update.
8. **Partial unique indexes count only active rows**, so retire-before-insert ordering
   matters inside the update transaction.

## 6. Architectural decisions already made (do not silently reverse)

- **Optimistic locking everywhere:** every update/deactivate/activate carries the `version`
  the editor saw, applied as an ATOMIC `updateMany({where:{id, organizationId, version},
data:{version:{increment:1}}})`; `count === 0` ⇒ `OPTIMISTIC_LOCK_FAILED`. Never
  read-then-write.
- **Cross-tenant id ⇒ `NOT_FOUND`**, never 403 — existence elsewhere is not leaked.
- **Replace semantics on updates**, not partial patch, so an omitted key can never mean
  "unchanged" to one side and "clear" to the other.
- **Response-contract failure ⇒ opaque 500**, never a caller-blaming 422 (`catalogResponse()`).
- **`tracking_type` is locked on update unconditionally** — Inventory does not exist to
  answer "do transactions exist?", so an "allow now, block later" path would silently
  become wrong. Revisit ONLY when the movement ledger is real.
- **Barcode/alias maintenance lives inside `PATCH /products/{id}`** (end-state diffing),
  not separate routes — one atomic auditable event, and `DELETE` is impossible anyway.
- **Deactivation never cascades** (no source specifies one). Reactivation requires an
  active parent/brand/category/model, mirroring create-time checks.
- **Nothing is ever hard-deleted.** Master data deactivates; ledgers are append-only.

## 7. Testing rules that matter

- **Automated test data goes in the disposable DB only.** The Playwright mutation flow in
  `e2e/tests/catalog-workspace.spec.ts` is guarded by `E2E_ALLOW_MUTATIONS=1` precisely so
  it cannot pollute `mobileshop_dev`. To run it: point the backend at the test DB
  (`DATABASE_URL=<TEST_DATABASE_URL> node dist/main.js`), then run playwright with
  `E2E_ALLOW_MUTATIONS=1` and `E2E_OWNER_EMAIL`/`E2E_OWNER_PASSWORD` (= the `SEED_OWNER_*`
  values; the test DB is seeded with the same owner). Restore the backend afterwards.
  **This flow is written but has NOT yet been executed end-to-end** — the UI selectors in
  the management test are best-effort and will likely need adjusting against the real DOM.
- DB integration tests create a fresh organization per fixture via `randomUUID`, so they
  are concurrency-safe. Never truncate.
- Backend HTTP integration tests mock Prisma; they do not touch a database.

## 8. Known gaps / risks

| ID       | Item                                                                    |
| -------- | ----------------------------------------------------------------------- |
| AUTH-001 | Slice 1 incomplete: password change, user/role admin, ScopeGuard        |
| AUTH-002 | Trusted reverse-proxy / client-IP policy not configured                 |
| CAT-002  | Pricing absent — REQUIRED before POS                                    |
| CAT-003  | `GET /products/search` counter-speed lookup not built (POS needs)       |
| E2E-001  | Catalog management Playwright flow written but never executed           |
| INV-001  | Inventory in flight — see §4                                            |
| CON-008  | Docker unavailable locally                                              |
| ENV-002  | Local Node 25 is outside Prisma-supported lines; re-gate on Node 24 LTS |

## 9. How to work in this repo effectively

- Fan out non-overlapping work (shared / backend / database / frontend own different
  directories) with parallel agents; give each an exact file list and the agreed export
  names, because they cannot see each other's work.
- Write the shared Zod contracts FIRST — backend and frontend both block on them.
- The frontend's strict response schemas mean a backend contract change **breaks the live
  UI until the frontend is rebuilt** ("Catalog could not be loaded" = schema mismatch, and
  is the honest-failure design working, not a bug).
- Copy `backend/src/modules/catalog/catalog.service.ts` as the reference implementation for
  any new module. It encodes every invariant above.
