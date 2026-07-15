# Build Status

**Last updated:** 2026-07-15
**Rule:** this file records only work that has been **executed and verified**. Generated-but-unrun work is "In progress", never "Complete" (`13_` §28, §23.26).

---

## Current Slice

**Slice 0 — Audit and repository foundation.** Audit complete; `shared/` complete and verified; backend/frontend/database scaffolding in progress.

---

## Completed and Verified

### Audit (Slice 0)

| Deliverable | Evidence |
|---|---|
| Full repository tree inspected | `docs/CURRENT_REPOSITORY_AUDIT.md` §1 |
| All 13 blueprint documents read | 5 rule-bearing docs read in full directly; rest mapped in parallel |
| Prototype inspected (25 pages + 4 assets + 3 docs) | `docs/PROTOTYPE_SCREEN_AND_FLOW_MAP.md` |
| Prototype fee algorithm **verified by re-execution** | `digital.js:87` algorithm extracted and cross-checked against the production engine at 11 amounts × 2 directions — exact agreement |
| 11 requirement conflicts found and resolved | `docs/REQUIREMENT_CONFLICTS_AND_DECISIONS.md` |
| 18 assumptions recorded | `docs/ASSUMPTIONS.md` |
| Git repository initialised (`.git/` was **empty**) | branch `main`, no work endangered |
| Dependency versions pinned to **verified published** versions | npm registry queried; none guessed |

### `shared/` package — **verified green**

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm exec eslint src --max-warnings=0` | **0 errors** |
| Typecheck | `pnpm exec tsc -p tsconfig.json --noEmit` | **0 errors** |
| Unit tests | `pnpm exec vitest run` | **153 passed / 153** (7 files) |
| Build | `pnpm exec tsc -p tsconfig.build.json` | **Success** — `dist/` emitted |

Modules: `money`, `imei`, `phone`, `enums`, `permissions`, `errors`, `datetime`, `fee-rules`, `constants`.

Required unit tests from `13_` §24 already covered: IMEI normalization · duplicate IMEI rules · inventory state transitions · fee calculation (send/withdrawal) · service profit · permission decisions.

---

## In Progress

- `backend/` NestJS skeleton — config, logging, request IDs, error filter, health/readiness
- `frontend/` Next.js skeleton — App Router, Tailwind tokens from the prototype, API client
- `database/` Prisma project layout
- `e2e/`, `infrastructure/`, `scripts/`, `.github/workflows/`

---

## Remaining

Slices 1–14 — see `docs/IMPLEMENTATION_PLAN.md`. None started.

---

## Database Migrations

**None generated. None applied.**

Blocked by CON-009 (no database credentials). PostgreSQL 18.4 is running on `localhost:5432`, but no credential exists in the repository or environment. Schema authoring proceeds; migration and seeding cannot.

---

## APIs Added

**None yet.** The backend skeleton is in progress; no endpoint is live.

---

## Frontend Routes Added

**None yet.**

---

## Tests Run and Exact Results

| Suite | Command | Result | Date |
|---|---|---|---|
| `shared` unit | `pnpm exec vitest run` | **153 passed, 0 failed** (7 files, 1.98 s) | 2026-07-15 |
| `shared` lint | `pnpm exec eslint src --max-warnings=0` | **0 errors, 0 warnings** | 2026-07-15 |
| `shared` typecheck | `pnpm exec tsc --noEmit` | **0 errors** | 2026-07-15 |
| `shared` build | `pnpm exec tsc -p tsconfig.build.json` | **Success** | 2026-07-15 |
| Backend unit | — | **Not run** (no backend yet) | — |
| Integration (PostgreSQL) | — | **Not run** (CON-009) | — |
| E2E (Playwright) | — | **Not run** (no app yet) | — |
| Migration-from-clean-DB | — | **Not run** (CON-009) | — |
| Frontend production build | — | **Not run** (no frontend yet) | — |
| Backend production build | — | **Not run** (no backend yet) | — |

Two test failures were found and fixed during Slice 0 (both were incorrect *test expectations*, not code defects): `fromMajor('1.')` — a trailing decimal point is correctly rejected as malformed; and a Lahore landline fixture was too short to reach the prefix rule it was meant to exercise.

---

## Known Issues

| ID | Issue | Severity | Status |
|---|---|---|---|
| CON-009 | Database credentials unavailable | **High** | **Blocked** — awaiting product owner |
| CON-008 | Docker not installed | Medium | Open — blocks §31 clean-environment verification only |
| — | Prototype defect: Recent-sales rows all link to `finance.html`; no per-invoice drill-down | Low | To fix in Slice 12 (`/sales/:id`) |
| — | Prototype defect: global search is a non-functional stub | Low | To build for real |

---

## Assumptions

18 recorded in `docs/ASSUMPTIONS.md`. Highest-impact:

- **ASM-002** — ADS uses three distinct 30-day windows (the source formula names one window twice). Confirm before Slice 11.
- **ASM-003** — partial fee blocks charged per started block. **Confirmed** against the approved prototype.
- **ASM-006** — landed cost allocates by line value. Recorded per receipt.
- **ASM-015** — tax excluded at launch; reports must say so.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| DB credentials stay unavailable | Nothing DB-backed can be verified; the build cannot honestly claim completion | Continue non-DB work; escalated to the product owner |
| Docker absent | `13_` §31 clean-environment verification cannot run here | Author Compose files; verify on a Docker-capable machine |
| Scope is very large (14 slices, ~60 tables, ~29 modules) | Cannot be completed in one session | Strict vertical slices; honest per-slice status; no fabricated results |
| Prototype fidelity vs production rigor | Preserving approved UX while removing mock data | Screen map + gap analysis map every screen to real APIs |
| ADS typo (CON-002) | Wrong reorder quantities | Assumption recorded; versioned algorithm; confirm before Slice 11 |

---

## Next Smallest Executable Step

Scaffold the `backend/` NestJS application with configuration, pino JSON logging, request/correlation IDs, the `DomainError` → `ApiErrorBody` exception filter, OpenAPI, and `/health` + `/ready` endpoints — then run lint, typecheck, unit tests and the production build, and record the exact results here.

This requires **no database** and is therefore not blocked by CON-009.
