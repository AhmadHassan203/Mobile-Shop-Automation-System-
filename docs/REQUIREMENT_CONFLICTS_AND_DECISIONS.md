# Requirement Conflicts and Decisions

Conflicts found between approved documents, and how each was resolved.

Resolution follows the precedence order in `13_PRODUCTION_MASTER_BUILD_PROMPT.md` §2:

1. Latest explicit product-owner instruction
2. Non-negotiable rules in `05_RULES.md`
3. Product scope in `01_PRD.md`
4. Architecture in `03_ARCHITECTURE.md`
5. Data integrity in `04_DATA_MODEL.md`
6. Testing/release gates in `10_TESTING_AND_RELEASE.md`
7. Analytics formulas in `09_ANALYTICS_AND_REORDERING.md`
8. Approved UX in `02_DESIGN.md` and the prototype
9. Delivery guidance in `06_PHASES.md`
10. Execution history in `07_MEMORY.md`
11. Research notes in `12_RESEARCH_NOTES.md`

Status legend: **Resolved** (decided, implemented or scheduled) · **Open** (needs product-owner input, non-blocking) · **Blocked** (cannot proceed).

---

## CON-001 — Repository structure: flat root vs nested monorepo

| | |
|---|---|
| **Status** | Resolved |
| **Severity** | High — governs every file path in the build |

**Conflict.** `03_ARCHITECTURE.md` §3 specifies a nested monorepo:

```text
mobile-shop-os/
  apps/{web,api,worker}/
  packages/{database,domain,validation,ui,config,testing}/
```

`13_PRODUCTION_MASTER_BUILD_PROMPT.md` §1 specifies flat root folders (`frontend/`, `backend/`, `database/`, `shared/`, `e2e/`, `infrastructure/`, `scripts/`, `docs/`) and explicitly forbids the other shape: *"Do not create another nested repository or another duplicate `mobile-shop-os` root."*

**Decision.** Use the flat root structure from `13_` §1.

**Rationale.** Precedence rule 1 (latest explicit product-owner instruction) beats rule 4 (architecture). The prohibition is explicit and unambiguous. The product owner's message reinforces it by naming the eight required root folders.

**What is preserved from `03_ARCHITECTURE.md`.** Only the *layout* is overridden. Every architectural principle it states still governs: modular monolith, domain services, transaction boundaries (§6), concurrency/stock safety (§7), money/costing (§8), audit strategy (§9), reporting architecture (§10), guardrails (§16). `apps/worker` is deferred exactly as §3 permits ("can remain absent until background jobs are introduced"), matching `13_` §4's "Redis/BullMQ only when a real background-job requirement exists".

---

## CON-002 — Average daily sales formula names the same window twice

| | |
|---|---|
| **Status** | Resolved (assumption recorded — see ASM-002) |
| **Severity** | High — silently corrupts every reorder quantity |

**Conflict.** `09_ANALYTICS_AND_REORDERING.md` §3 gives:

```text
ADS =
  0.50 * units_sold_last_30 / 30
+ 0.30 * units_sold_previous_30 / 30
+ 0.20 * units_sold_previous_30 / 30
```

The second and third terms use the identical variable `units_sold_previous_30`. Read literally, days 31–60 are counted twice at a combined 0.50 weight and days 61–90 are never counted — despite the same document (§2) and `01_PRD.md` §5.10 both requiring 7/30/90-day sales metrics.

**Decision.** Implement three distinct consecutive 30-day windows:

```text
ADS = 0.50 * units_sold_days_1_30  / 30
    + 0.30 * units_sold_days_31_60 / 30
    + 0.20 * units_sold_days_61_90 / 30
```

**Rationale.** Weights (0.50/0.30/0.20) sum to 1.0 and decay with age, which only makes sense across three *different* windows. A 90-day span matches the required metrics. The literal reading contradicts the document's own stated intent ("Use recency weighting"). Treated as a typo, not a specification.

**Implementation.** `shared/src/constants.ts` → `ADS_WINDOW_WEIGHTS` (`LAST_30` / `PREVIOUS_30` / `PRIOR_30`), documented inline. Confirm with the product owner before the Slice 11 reorder engine goes live; changing weights later requires an algorithm-version bump (`05_RULES.md` §8: "Do not change formulas without versioning").

---

## CON-003 — External service fee: partial-block behavior unstated

| | |
|---|---|
| **Status** | Resolved (confirmed against the approved prototype) |
| **Severity** | Medium — affects every send/withdrawal fee |

**Conflict.** `13_` §13 gives defaults (Send: PKR 10 per PKR 1,000; Withdrawal: PKR 20 per PKR 1,000) but does not state what happens to a partial thousand, and instructs: *"If partial-thousand behavior is not already approved, record the assumption and make it configurable."*

**Decision.** Default to `per_started_block` (every started block charged in full). **This is not an assumption — the approved prototype already implements it.**

**Evidence.** `prototype/assets/digital.js` line 87:

```js
if (r.calculationMethod === "SLAB")
  fee = Math.ceil(amount / (r.blockSize || 1000)) * (r.feePerBlock || 0);
```

`Math.ceil` is per-started-block. Seeded rules (lines 73–74) are `SENT {blockSize:1000, feePerBlock:10, minimumFee:10}` and `RECEIVED {blockSize:1000, feePerBlock:20, minimumFee:20}` — exactly the `13_` §13 defaults. So PKR 1,500 sent is charged 2 blocks = PKR 20.

**Implementation.** `shared/src/fee-rules.ts`. Remains fully configurable per provider/type/branch with effective dates. Parity tests in `shared/src/fee-rules.spec.ts` assert the production engine reproduces the prototype's fee across 1 / 500 / 999 / 1,000 / 1,001 / 1,500 / 2,000 / 4,999 / 5,000 / 25,000 / 100,000 rupees for both directions.

---

## CON-004 — Fee calculation mode names collide between prototype and master prompt

| | |
|---|---|
| **Status** | Resolved |
| **Severity** | Medium — a naive name-match would silently mis-charge customers |

**Conflict.** `13_` §13 requires four modes: `fixed`, `proportional per block`, `per started block`, `percentage`. The prototype implements three: `SLAB`, `PROPORTIONAL`, `FLAT`.

The trap: the prototype's `PROPORTIONAL` is **not** "proportional per block". `digital.js` line 88 computes `fee = amount * (ratePct / 100)` — a straight percentage of principal. Mapping `PROPORTIONAL → proportional_block` by name would produce wrong fees.

**Decision.** Map by behavior, not by name:

| Prototype mode | Behavior in `digital.js` | Production mode |
|---|---|---|
| `SLAB` | `ceil(amount / blockSize) * feePerBlock` | `per_started_block` |
| `PROPORTIONAL` | `amount * ratePct / 100` | `percentage` |
| `FLAT` | `flatFee` | `fixed` |
| *(none)* | — | `proportional_block` (new; required by `13_` §13) |

**Implementation.** `shared/src/fee-rules.ts` → `PROTOTYPE_FEE_MODE_MAP`, asserted by test.

---

## CON-005 — Backend module lists differ between architecture and master prompt

| | |
|---|---|
| **Status** | Resolved |
| **Severity** | Low |

**Conflict.** `03_ARCHITECTURE.md` §4 lists 24 modules (including `Warranty`, `Repairs`, `Integrations`; combines `UsersAndRoles`). `13_` §7 lists 29 (splits `Users` / `RolesAndPermissions`, adds `Locations`, `Organizations`, `Branches`, `FinancialLedger`, `Settings`, `Health`; omits `Warranty`/`Repairs`/`Integrations` from the core set).

**Decision.** Use the `13_` §7 list (precedence rule 1). `Warranty`, `Repairs` and used-device intake move to Slice 14 behind feature flags, as `13_` §7 explicitly permits. `Integrations` is realised as adapter interfaces inside the modules that need them rather than a standalone module, per `03_ARCHITECTURE.md` §13 ("Design adapters, not hard-coded calls").

---

## CON-006 — Prototype digital services exceed the master prompt's scope

| | |
|---|---|
| **Status** | Resolved |
| **Severity** | Medium — scope of Slice 7 |

**Conflict.** `13_` §13 describes send/withdrawal recording with fee rules and cash direction. The approved prototype implements materially more: per-provider **float balance** tracking (`digital-balances.html`), low-float thresholds, **commission** tracking (`digital-commission.html`), a **reconciliation** workflow (`digital-reconciliation.html`), and a richer status vocabulary (`SUCCESSFUL, PENDING, FAILED, REVERSED, DISPUTED` vs the prompt's implied posted/failed).

**Decision.** Build to the prototype's richer model. `13_` §21 requires preserving the approved experience and forbids replacing it with a generic dashboard; `13_` §13 anticipates extension ("configurable additional service types").

**Consequence.** Slice 7 includes provider float accounts, float thresholds/alerts, provider commission, and a reconciliation workflow. Statuses adopt the prototype vocabulary plus `draft`. Only `successful` transactions count toward reported service revenue (`shared/src/enums.ts` → `EXTERNAL_REVENUE_STATUSES`).

---

## CON-007 — Roles: seven in the PRD, six in the master prompt

| | |
|---|---|
| **Status** | Resolved |
| **Severity** | Low |

**Conflict.** `01_PRD.md` §4 defines seven roles (adds **Technician**). `13_` §8 defines six and omits Technician — consistent with repairs being deferred to Slice 14.

**Decision.** Model all seven role codes now; grant Technician a minimal read-only set until Slice 14. `01_PRD.md` §4 requires permissions be "modeled from the beginning", and adding a role later is a data migration.

**Implementation.** `shared/src/permissions.ts` → `ROLES` + `DEFAULT_ROLE_PERMISSIONS`, asserted by test (Technician cannot view financial data, cost or profit).

---

## CON-008 — Docker Compose is mandated but Docker is not installed

| | |
|---|---|
| **Status** | Open (non-blocking for development) |
| **Severity** | Medium — blocks the §31 clean-environment verification |

**Conflict.** `13_` §4/§31 require Docker Compose for PostgreSQL and clean-environment verification. **Docker is not installed on this machine** (`docker: command not found`). PostgreSQL 18.4 *is* running locally on port 5432.

**Decision.** Author `docker-compose.yml` and `infrastructure/` as required deliverables, but develop against the local PostgreSQL instance. Mark every Docker-dependent verification step as **not executed** in `BUILD_STATUS.md` rather than claiming it passed (`13_` §23.26: "Do not claim completion without executed evidence").

**Needed from the product owner.** Install Docker Desktop, or accept that clean-environment/container verification is deferred to a machine that has it.

---

## CON-009 — Database credentials unavailable

| | |
|---|---|
| **Status** | **Blocked** |
| **Severity** | High — blocks migrations, seeds and all integration tests |

**Problem.** PostgreSQL 18.4 is running on `localhost:5432`, but no credentials exist anywhere in the repository or environment (no `DATABASE_URL`, no `PG*` variables, no `pgpass.conf`). The server requires password authentication.

**Not attempted.** Guessing or brute-forcing the password. That is inappropriate regardless of intent, and was correctly blocked by the environment.

**Decision.** Continue every workstream that does not need a live database (shared contracts, Prisma schema authoring, backend/frontend code, unit tests, lint, typecheck, builds). Migrations, seeds and integration tests remain unrun until credentials are supplied.

**Needed from the product owner.** Either the local `postgres` superuser password (a least-privilege `mobileshop_app` role and `mobileshop_dev`/`mobileshop_test` databases will then be provisioned by `scripts/`, with the secret kept in `.env`, never in Git), or a ready-made `DATABASE_URL` for a database that may be migrated and seeded freely.

---

## CON-010 — Git repository was not initialised

| | |
|---|---|
| **Status** | Resolved |
| **Severity** | Low |

**Problem.** The session context reported "Is a git repository: true" and the root contained a `.git/` directory, but that directory was **completely empty** — no `HEAD`, no `config`, no objects. Every git command failed with *"not a git repository"*.

**Decision.** Ran `git init` on branch `main`. Safe: there was no history, no refs and no uncommitted work to endanger — nothing could be overwritten. Author identity set from the session context (`AhmadHassan203` / `haseeb.shahid.developer@gmail.com`).

**Consequence.** `13_` §5.9 ("do not overwrite unrelated uncommitted work") is satisfied vacuously — there was none. The prototype and blueprint were untracked files on disk and remain byte-for-byte unmodified.

---

## CON-011 — `07_MEMORY.md` scope vs the current instruction

| | |
|---|---|
| **Status** | Resolved |
| **Severity** | Low |

**Note.** `13_` §2 warns: *"Do not allow an outdated scope statement in [`07_MEMORY.md`] to override a newer direct product-owner instruction."* `07_MEMORY.md` is an execution record and ranks 10th in precedence.

**Decision.** Treat `07_MEMORY.md` as history only. Update it **only** with work that has actually been implemented and verified (product-owner instruction 15), never with intentions.

---

## Open items requiring product-owner input

| ID | Item | Blocking? |
|---|---|---|
| CON-009 | Database credentials | **Yes** — migrations, seeds, integration tests |
| CON-008 | Docker installation | No — blocks §31 clean-environment verification only |
| CON-002 | Confirm the three-window ADS reading before Slice 11 | No — not needed until the reorder engine |
| ASM-001..n | See `docs/ASSUMPTIONS.md` | No — safe defaults applied |
