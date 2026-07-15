# Project Memory

> Execution source of truth for coding agents. Record only repository facts and executed evidence. A schema, UI, test file, or configuration that has not passed its applicable gate remains “implemented; verification pending,” never complete.

## 1. Current objective

Convert the approved MobileShop OS blueprint and static prototype into a secure, traceable, tested production modular monolith while preserving the approved counter-speed experience.

- Current slice: **Slice 1 — authentication and access (in progress)**
- Production status: **not deployed**
- Staging status: **not configured**
- Last evidence update: **2026-07-16**
- Last verified commit at this checkpoint: **`edac0e6`**
- Working tree: contains intentional, uncommitted Slice 0/1 work; preserve it during agent handoff

The verified checkpoint is a real owner login against local PostgreSQL, a live API, and a live Next.js login/workspace. It is not a completed Slice 1 or a production release.

## 2. Verified repository state

### Committed baseline

```text
125c0ea  Slice 0: repository audit, shared contracts, workspace foundation
f21078d  Slice 0: backend NestJS foundation (config, logging, request IDs, health)
edac0e6  Slice 0/1: database package + Prisma schema for access, audit and system
```

### Executed evidence

- Repository/prototype audit, conflict register, assumptions register, screen/flow map, API map, database map, and implementation plan exist.
- The prototype map covers 24 business screens and 29 overlays and identifies mock/static/fabricated behavior that cannot ship.
- Shared package lint, strict typecheck, and production build passed; **155/155 tests passed**.
- Backend lint, strict typecheck, and production build passed; **36 unit tests** and **23 HTTP integration tests** passed.
- Live backend liveness and readiness returned HTTP 200; readiness reported PostgreSQL up.
- Live real-PostgreSQL authentication passed: login **200** → current user **200** → logout **204** → current user **401**.
- Frontend lint, strict typecheck, and production build pass after credential-cache and exact-expiry hardening; **6 files/42 tests passed**.
- Frontend provides public `/login`, a session-protected root workspace, ended-session redirect, private-cache purge, credential-mutation invalidation, and exact-expiry handling. The hardened standalone preview is live; `/login` returns HTTP 200 and the root static response exposes no signed-in user data.
- PostgreSQL 18.4 is reachable with separate runtime/migration roles and development/test/shadow databases.
- All four reviewed migrations are applied to development and rehearsed on the disposable test database.
- The real PostgreSQL suite passed **1 file/10 tests**, including runtime DDL denial, append-only login evidence, and no hard deletion of users.
- The deterministic development seed passed twice; the second run verified idempotence.
- The post-seed baseline remained **1 organization, 1 branch, 1 user, 7 roles, and 73 permissions**.
- E2E package lint, typecheck, and build gates pass; the real-service health smoke passed **1 file/2 tests** and browser authentication passed **1 file/1 test**. The browser sequence was login → protected workspace → `me` 200 → logout 204 → `me` 401 → root redirects to login; the captured authenticated workspace was manually inspected and rendered real session/API state cleanly.

No credential value belongs in this file, documentation, Git history, committed commands, logs, or tests. Local credentials live only in ignored environment configuration.

## 3. Authentication checkpoint

### Backend

The following routes exist and are verified:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/health`
- `GET /api/v1/health/ready`

Verified behavior includes:

- Argon2id password verification and the same response for unknown-user and wrong-password failures;
- a signed, HTTP-only opaque session cookie restricted to `/api/v1`, with only a SHA-256 digest persisted;
- absolute session expiry, revocation, inactive organization/user checks, and active branch checks;
- a global authentication guard with explicit public health/login routes;
- configured-Origin checking on Auth controller requests and `Cache-Control: no-store` on auth responses;
- generic API throttling plus a bounded, TTL-evicting login limiter keyed first by IP and then normalized email;
- append-only login-attempt and audit evidence with bounded request metadata; and
- a backend environment allow-list that excludes migration, shadow, test, seed, frontend, and PostgreSQL-admin values.

Live inspection also passed the expected local cookie flags and credentialed CORS allow-list behavior.

### Frontend

- `/login` calls the real API using shared login/current-user contracts.
- `/` is a session-protected workspace/readiness surface, not the finished owner dashboard.
- The browser stores no session token in JavaScript storage and uses credentialed cookie requests.
- Ended sessions redirect to `/login`; authentication-dependent cache purging, credential-mutation invalidation, and exact-expiry timing pass their current static gates.
- The frontend does not load the combined root `.env`; public frontend overrides belong in `frontend/.env.local`.

### Explicitly incomplete Slice 1 work

- password/change flow and `mustChangePassword` enforcement;
- user, role, permission, organization/branch/location administration APIs;
- server-side `PermissionGuard` and `ScopeGuard` plus cross-scope tests;
- permission-aware operational navigation;
- trusted reverse-proxy/client-IP policy;
- system-wide CSRF policy for future cookie-authenticated mutations; and
- unauthorized-action E2E after PermissionGuard, ScopeGuard, and administration APIs exist.

## 4. Confirmed decisions

- Architecture: modular monolith, not microservices.
- Production structure: separate `frontend/`, `backend/`, `database/`, `shared/`, `e2e/`, and `infrastructure/` roots. The blueprint and prototype remain reference-only.
- Frontend: Next.js App Router PWA with strict TypeScript; it communicates with PostgreSQL only through the NestJS API.
- Backend: NestJS with versioned REST, shared Zod contracts, stable errors, request IDs, structured logs, and OpenAPI outside production.
- Database: PostgreSQL + Prisma. Migration and runtime roles are separate; the runtime role is least privilege.
- Money: integer minor units; never floating point for persisted money.
- Currency/time: PKR and `Asia/Karachi`; store real timestamps and format at the boundary.
- Inventory: serialized phones as individual units; accessories by batch; movements are authoritative; direct counter edits are prohibited.
- Posted sales, receipts, payments, and financial history are immutable; corrections use controlled workflows.
- Authorization: server-side permission plus organization/branch/location scope. UI hiding is an affordance only.
- Launch UI: one organization, branch, and stock location; data remains future multi-branch ready without a launch branch selector.
- Authentication: Argon2id and a secure HTTP-only opaque session cookie; a 12-hour session remains an assumption pending owner confirmation.
- Reordering: deterministic, versioned, and explainable before any AI layer. No recommendation auto-approves a purchase order.
- Used-device, warranty, repairs, notification adapters, and optional AI explanation are deferred behind feature flags until the core is stable.
- Redis/BullMQ, native apps, microservices, autonomous purchasing, payroll, and a full statutory general ledger are outside the initial core.
- Tax is excluded from launch calculations until legal/FBR requirements are confirmed; reports must state that limitation.

## 5. Assumptions and owner decisions still needed

The engineering assumptions are maintained in `docs/ASSUMPTIONS.md`. Highest-impact unresolved items include:

- confirm the three distinct 30-day windows for average daily sales before Slice 11;
- confirm FBR/tax obligations before financial acceptance;
- confirm the actual return window; the prototype contradicts itself between three and seven days;
- confirm receipt printer/scanner hardware and WhatsApp delivery expectations before Slice 5 launch verification;
- confirm opening inventory source and approve the import/dry-run before launch hardening;
- confirm whether repairs and used-phone intake are enabled at launch; both remain deferred by default; and
- confirm price-band boundaries and the used-device classification policy.

Safe documented defaults may support implementation, but unresolved legal, hardware, and data-owner decisions block production acceptance where applicable.

## 6. Completed and verified

- [x] Product blueprint, PRD, UX specification, architecture, data model, rules, phases, catalog strategy, analytics specification, testing/release plan, and production master prompt exist.
- [x] Repository and prototype audit completed.
- [x] Shared contracts/invariants package passes lint, typecheck, 155 tests, and production build.
- [x] Local least-privilege database topology provisioned and connection-tested.
- [x] Four forward-only migrations applied to development and rehearsed on the disposable test database.
- [x] Prisma-managed schema and migration history reconcile with an empty diff.
- [x] Real PostgreSQL integration suite passes 10 tests.
- [x] Development seed passes twice and preserves existing owner password/edited grants.
- [x] Backend authentication checkpoint passes lint, typecheck, 36 unit tests, 23 integration tests, build, live health/readiness, and the real-PG auth flow.
- [x] Current protected-workspace frontend passes lint, strict typecheck, 42 tests, production build, and hardened standalone delivery.
- [x] Existing Playwright health smoke passes 2 tests against real services.
- [x] Real Playwright browser auth flow passes 1 test against the live frontend/API/PostgreSQL stack.

## 7. Implemented; verification pending

- [ ] Docker Compose, split-role PostgreSQL provisioning, and optional Caddy proxy are implemented/statically checked but unexecuted because Docker is unavailable locally.
- [ ] GitHub Actions workflow exists but has not run on GitHub.
- [ ] Broader manual responsive/theme/accessibility review remains.
- [ ] Unauthorized-action browser E2E awaits the authorization APIs.
- [ ] A complete root workspace gate on a Prisma-supported Node line remains release evidence to collect.
- [ ] A coherent checkpoint commit remains to be made after review; current work after `edac0e6` is intentional and uncommitted.

## 8. Product work not started

No business vertical after authentication is complete. Remaining work includes:

1. Finish authentication/access administration and authorization guards.
2. Catalog and pricing.
3. Serialized and batch inventory plus movement ledger.
4. Suppliers, purchase orders, goods receiving, landed costs, and payables.
5. Customers, POS, split payments, receipts, immutable sale posting, and inventory/financial effects.
6. Returns, exchanges, and refunds.
7. External/digital services and reconciled provider balances.
8. Cash sessions and expenses.
9. Customer demand, reservations, quotations, and follow-ups.
10. Financial ledger, receivables/payables, and reports.
11. Deterministic reorder recommendations and draft-PO decisions.
12. Production owner dashboard with source drill-down.
13. Opening-stock import, backup/restore, monitoring, deployment, UAT, and rollback evidence.
14. Feature-flagged used intake, warranty, repairs, notification adapters, and optional AI explanation.

## 9. Next executable tasks

1. Implement password/change handling and enforce `mustChangePassword`.
2. Implement user/role/admin APIs with `PermissionGuard`, `ScopeGuard`, and cross-scope PostgreSQL tests.
3. Add permission-aware operational navigation.
4. Add unauthorized-action E2E with the authorization APIs.
5. Define trusted-proxy/client-IP and system-wide CSRF policies before adding business mutations.
6. Run the complete workspace gate, Docker Compose, and GitHub Actions on supported environments.
7. Review and commit the coherent checkpoint before another agent continues.

## 10. Known risks and issues

| ID        | Severity                    | Area                 | Status and consequence                                                                                                                       |
| --------- | --------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-008   | Medium                      | Environment          | Docker is unavailable locally; container/clean-environment verification cannot be claimed.                                                   |
| ENV-002   | High for repeatability      | Runtime              | Local Node.js 25.2.1 is outside Prisma-supported lines. Repeat release gates on Node 24.x or another supported line.                         |
| AUTH-001  | Critical for Slice 1        | Authorization        | Password/change, admin APIs, `PermissionGuard`, and `ScopeGuard` are absent.                                                                 |
| AUTH-002  | High for production         | Proxy/rate limiting  | Trusted reverse-proxy/client-IP policy is not configured.                                                                                    |
| SEC-001   | High before business writes | CSRF                 | Origin checking is Auth-controller-specific, not a system-wide CSRF policy.                                                                  |
| E2E-001   | High for acceptance         | Browser E2E          | Unauthorized-action coverage awaits PermissionGuard, ScopeGuard, and administration APIs.                                                    |
| UI-001    | Critical if ignored         | Prototype conversion | Static `DB.*`, `localStorage`, fake identifiers/evidence, in-memory updates, and toast-only actions must never become production behavior.   |
| DATA-001  | High                        | Prototype data       | Prototype KPIs, finance, margins, return windows, and dates contradict each other. Use canonical entities/settings and reconciliation tests. |
| LEGAL-001 | High for release            | FBR/PTA/CNIC         | Legal requirements and sensitive-document policy require owner/legal confirmation.                                                           |
| OPS-001   | High for release            | Backup/restore       | No backup or restore drill has run. A backup is untrusted until restored and checked.                                                        |

The former missing-database-credentials blocker is resolved. Never copy the local credential into documentation or source.

## 11. Environment status

### Local

- API: verified live at `localhost:4000`; health/readiness are HTTP 200 and database is up.
- Web: hardened protected-workspace standalone preview is live at `localhost:3000`; browser auth flow passes end to end.
- PostgreSQL: 18.4 reachable; runtime/migrator roles and development/test/shadow databases are provisioned.
- Docker: unavailable.
- Redis/BullMQ: deferred.
- Object storage: not configured.

The combined root `.env` is a local development convenience only. Each process parses only an explicit allow-list. Frontend public values belong in `frontend/.env.local`; production should inject per-process secrets directly.

### Staging

Not configured.

### Production

Not configured and no production migration is applied.

## 12. Data and migrations

| Migration                                              | Development | Disposable test   | Production     |
| ------------------------------------------------------ | ----------- | ----------------- | -------------- |
| `20260715164914_0001_identity_and_access`              | Applied     | Applied/rehearsed | Not configured |
| `20260715235500_0002_runtime_schema_privileges`        | Applied     | Applied/rehearsed | Not configured |
| `20260715235600_0003_runtime_object_privileges`        | Applied     | Applied/rehearsed | Not configured |
| `20260716003000_0004_auth_evidence_and_user_integrity` | Applied     | Applied/rehearsed | Not configured |

- Seed version: deterministic Slice 1 development/test seed; verified twice and idempotent.
- Development owner: synthetic local owner account seeded from ignored environment settings; no credential is documented.
- Opening-stock import: not prepared.
- Backup/restore drill: not run.
- Runtime role: DML-only least privilege; runtime DDL denial verified.
- Evidence integrity: login attempts are append-only and users cannot be hard-deleted, enforced in PostgreSQL and verified by integration tests.

## 13. Test status

| Layer                    | Exact verified result                                                             | Pending                               |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------- |
| Shared                   | Lint/typecheck/build **pass**; **155 passed, 0 failed**                           | Extend with each slice                |
| Backend                  | Lint/typecheck/build **pass**; unit **36 passed**; HTTP integration **23 passed** | Remaining Slice 1 APIs and guards     |
| Live backend             | Health **200**; readiness **200/DB up**; auth **200 → 200 → 204 → 401**           | Production/proxy evidence             |
| Database package         | Format/validate/generate/typecheck/build/diff **pass**                            | Repeat release gate on supported Node |
| Database PostgreSQL      | **1 file, 10 passed, 0 failed**; four migrations applied/rehearsed                | Production deploy                     |
| Database seed            | **Pass twice; idempotent**                                                        | Production bootstrap/rotation policy  |
| Frontend                 | Lint/typecheck/build **pass**; **6 files, 42 passed**; hardened preview live      | Broader manual UX review              |
| Playwright E2E           | Package gates **pass**; health **2 passed**; browser auth **1 passed**            | Authorization and later golden flows  |
| Docker/clean environment | No executed result                                                                | Docker-capable machine                |
| GitHub Actions           | No executed result                                                                | Execute workflow                      |
| Backup/restore           | No executed result                                                                | Launch-hardening drill                |

## 14. Release checklist

- [ ] all required migrations reviewed and applied safely in the target environment
- [ ] secrets configured outside Git and secret scan clean
- [x] synthetic development owner account seeded without exposing its credential
- [ ] production owner bootstrap and password-rotation policy approved
- [ ] server-side permissions and scope tested
- [ ] opening inventory imported and approved
- [ ] receipt format/hardware approved
- [ ] cash opening and closing verified
- [ ] backup succeeds
- [ ] restore drill succeeds with recorded evidence
- [ ] monitoring and alerting active
- [ ] critical E2E golden flows pass
- [ ] rollback plan tested/documented
- [ ] known issues disclosed
- [ ] owner acceptance completed
- [ ] staff/owner training completed

## 15. Agent handoff protocol

After every meaningful implementation:

1. Inspect the working tree before editing and preserve unrelated work.
2. Keep secrets in ignored environment configuration only.
3. Record files and migrations changed.
4. Record commands executed and exact pass/fail counts.
5. Label unexecuted work “implemented; verification pending.”
6. Update `BUILD_STATUS.md`, this memory file, and the applicable traceability map only after verification.
7. Add discovered risks/issues and the next smallest executable task.
8. Never reset a non-disposable database or delete user work without explicit approval.
9. Commit coherent checkpoints so another coding agent can continue safely.
10. Never remove historical decisions without an ADR or explicit product-owner instruction.
