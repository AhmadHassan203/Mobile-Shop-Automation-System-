# Build Status

**Last updated:** 2026-07-16
**Evidence rule:** Only executed checks appear under “Completed and verified.” Generated or partially verified work remains explicitly incomplete.

## Current slice

**Slice 1 — Authentication and access: in progress.**

The local foundation now supports a real owner login against PostgreSQL: the database is migrated and seeded, the API exposes login/logout/current-user endpoints, and the hardened Next.js preview exposes `/login` and the protected `/` workspace at `localhost:3000`. The real browser login/workspace/logout flow passes. This is an authentication checkpoint, not a completed Slice 1 or a deployment.

Slice 1 remains incomplete until password/change handling, user/role/admin APIs, server PermissionGuard and ScopeGuard, permission-aware operational navigation, trusted-proxy policy, broader CSRF protection, and authorization E2E pass.

## Completed and verified

### Repository and prototype audit

| Deliverable                                         | Evidence                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| Repository tree and production boundaries inspected | `docs/CURRENT_REPOSITORY_AUDIT.md`                                   |
| Blueprint conflicts and assumptions recorded        | `docs/REQUIREMENT_CONFLICTS_AND_DECISIONS.md`, `docs/ASSUMPTIONS.md` |
| All 24 prototype screens and 29 overlays mapped     | `docs/PROTOTYPE_SCREEN_AND_FLOW_MAP.md`                              |
| Prototype-to-production traceability completed      | `docs/PROTOTYPE_TO_PRODUCTION_GAP_ANALYSIS.md`                       |
| Git repository established on `main`                | Verified commits listed below                                        |

Verified commits currently at `HEAD`:

```text
125c0ea  Slice 0: repository audit, shared contracts, workspace foundation
f21078d  Slice 0: backend NestJS foundation (config, logging, request IDs, health)
edac0e6  Slice 0/1: database package + Prisma schema for access, audit and system
```

Work after `edac0e6` is intentional but not yet committed. Do not discard it when handing off between coding agents.

### Shared package

| Check                     | Executed result          |
| ------------------------- | ------------------------ |
| Lint and strict typecheck | **Pass**                 |
| Unit tests                | **155 passed, 0 failed** |
| Production build          | **Pass**                 |

The verified package includes the canonical login/current-auth Zod contracts as well as the existing money, IMEI, phone, permissions, errors, time, and fee rules.

### Backend authentication checkpoint

| Check                          | Executed result                                                         |
| ------------------------------ | ----------------------------------------------------------------------- |
| Lint and strict typecheck      | **Pass**                                                                |
| Unit tests                     | **36 passed, 0 failed**                                                 |
| HTTP integration tests         | **23 passed, 0 failed**                                                 |
| Production build               | **Pass**                                                                |
| Live liveness                  | `GET /api/v1/health` → **HTTP 200**                                     |
| Live readiness                 | `GET /api/v1/health/ready` → **HTTP 200**, database **up**              |
| Live real-PostgreSQL auth flow | login **200** → me **200** → logout **204** → me **401**                |
| Live browser boundary          | Expected local cookie flags and credentialed allow-listed CORS **pass** |

Verified behavior includes:

- Argon2id password verification with a non-enumerating unknown/wrong-password response;
- a signed, HTTP-only opaque session cookie restricted to `/api/v1`, with only its SHA-256 digest stored;
- absolute expiry, revocation, inactive organization/user checks, and active branch checks;
- a global authentication guard with explicit public health/login routes;
- configured-Origin checks for the Auth controller and `Cache-Control: no-store` on auth successes and failures;
- generic API throttling plus a bounded, TTL-evicting login limiter keyed by IP then normalized email; and
- append-only login-attempt/audit evidence with bounded request metadata.

The backend parses only an explicit runtime allow-list from the local root environment file; migration, shadow, test, seed, frontend, and PostgreSQL-admin values are not loaded into the API process.

### Frontend authentication checkpoint

| Check                      | Recorded result                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current static gates       | Lint and strict typecheck **pass**; **6 files, 42 tests passed, 0 failed** after credential-cache and exact-expiry hardening                                   |
| Production build           | **Pass** after the latest hardening                                                                                                                            |
| Routes implemented         | Public `/login`; session-protected `/` workspace with ended-session redirect, private-cache purge, credential-mutation invalidation, and exact-expiry handling |
| Current standalone preview | Live at `localhost:3000`; `/login` → **HTTP 200** and the root static response contains no signed-in user data                                                 |

The browser uses the shared login/current-auth contracts, sends credentials only to the configured API, stores no session token in JavaScript storage, and presents non-enumerating authentication errors. The frontend no longer loads the combined root `.env`; public overrides belong in `frontend/.env.local`.

### Local PostgreSQL, migrations, and seed

| Check                        | Executed result                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| PostgreSQL availability      | PostgreSQL 18.4 reachable on localhost                                               |
| Least-privilege topology     | Separate runtime and migration roles plus development/test/shadow databases verified |
| Runtime DDL denial           | **Pass**; runtime role could not create the attempted table                          |
| Prisma/package gates         | Format, validate, generate, typecheck, build, and migration/schema diff **pass**     |
| Development migration deploy | All four reviewed migrations applied without reset                                   |
| PostgreSQL integration       | **1 file, 10 tests passed, 0 failed**                                                |
| Development seed             | **Pass twice**; second run verified idempotence                                      |

The seed creates the synthetic Lahore organization, default branch/location, permission catalogue, system roles, and owner account from ignored local settings. It accepts only `NODE_ENV=development` or `NODE_ENV=test`, preserves an existing owner password and edited role grants, and prints no credential.

After both seed runs, the verified baseline remained **1 organization, 1 branch, 1 user, 7 roles, and 73 permissions**.

Migration `0004` makes `login_attempts` append-only for runtime and migration roles and enforces user deactivation instead of hard deletion. Both rules are covered by the real PostgreSQL suite.

No credential is recorded in Git or this document.

### End-to-end checkpoint

The E2E package lint, typecheck, and build gates pass. The real-service Playwright health smoke passed **1 file, 2 tests**. The credential-safe browser authentication flow passed **1 file, 1 test**: login → protected workspace → authenticated `me` **200** → logout **204** → `me` **401** → root redirects to login. Its captured workspace was manually inspected and rendered the real user, organization, branch, session, and API state cleanly.

## Implemented; verification pending

| Area                        | What exists                                                                                                                                      | Still required                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Slice 1 authorization/admin | Authenticated actor context, roles, permissions, scopes, owner seed                                                                              | Password/change flow; user/role/admin APIs; PermissionGuard; ScopeGuard; permission-aware navigation; cross-scope authorization tests |
| Frontend UX                 | Public `/login`, protected `/`, ended-session/cache/credential-mutation purge and exact-expiry handling; lint/typecheck/42 tests/build/live pass | Broader manual responsive/theme/accessibility review                                                                                  |
| Security hardening          | Auth Origin guard, signed cookie, bounded login limiter, process-level secret allow-lists                                                        | Trusted reverse-proxy/client-IP policy and system-wide CSRF policy before business mutations ship                                     |
| Browser E2E                 | Real login → protected workspace → logout → denied reuse **passes 1/1**                                                                          | Add broader unauthorized-action coverage after the authorization APIs exist                                                           |
| Infrastructure              | Docker Compose, split-role provisioning, optional Caddy proxy                                                                                    | Execute on a Docker-capable machine and verify volumes, roles, proxy behavior, and restart                                            |
| CI                          | GitHub Actions workflow exists                                                                                                                   | Execute on GitHub Actions; local checks are not workflow evidence                                                                     |

## Database migrations

| Migration                                              | Development | Disposable test       | Production     |
| ------------------------------------------------------ | ----------- | --------------------- | -------------- |
| `20260715164914_0001_identity_and_access`              | **Applied** | **Applied/rehearsed** | Not configured |
| `20260715235500_0002_runtime_schema_privileges`        | **Applied** | **Applied/rehearsed** | Not configured |
| `20260715235600_0003_runtime_object_privileges`        | **Applied** | **Applied/rehearsed** | Not configured |
| `20260716003000_0004_auth_evidence_and_user_integrity` | **Applied** | **Applied/rehearsed** | Not configured |

These migrations establish identity/access/system tables and database-enforced security invariants. They do not implement the remaining Slice 1 APIs or later business models.

## APIs present

| Endpoint                   | Purpose                                                | Verified status                                                 |
| -------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `GET /api/v1/health`       | Process liveness                                       | Tests pass; live **HTTP 200**                                   |
| `GET /api/v1/health/ready` | PostgreSQL readiness                                   | Tests pass; live **HTTP 200**, database **up**                  |
| `POST /api/v1/auth/login`  | Verify credentials and issue server session            | Tests pass; live real-PG **HTTP 200**                           |
| `POST /api/v1/auth/logout` | Revoke current session and clear cookie                | Tests pass; live real-PG **HTTP 204**                           |
| `GET /api/v1/auth/me`      | Current user, roles, permissions, branch/scope, expiry | Tests pass; live **200** authenticated and **401** after logout |

No catalog, inventory, purchasing, POS, finance, reporting, or recommendation API exists yet.

## Frontend routes present

| Route                              | Purpose                                              | Status                                                                                            |
| ---------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/login`                           | Real API-backed owner sign-in                        | Lint/typecheck/42 tests/build pass; live **HTTP 200**                                             |
| `/`                                | Session-protected system workspace/readiness surface | Cache/expiry hardening and real browser auth flow pass; static response exposes no signed-in data |
| Error/loading/not-found boundaries | Honest application states                            | Type verification and production build pass                                                       |

The root route is not the production dashboard, and no prototype business page is production-ready.

## Tests and checks run

| Suite/check                     | Exact result                                                                                 | Date       |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| Shared unit                     | **155 passed, 0 failed**                                                                     | 2026-07-16 |
| Shared lint/typecheck/build     | **Pass**                                                                                     | 2026-07-16 |
| Backend unit                    | **36 passed, 0 failed**                                                                      | 2026-07-16 |
| Backend HTTP integration        | **23 passed, 0 failed**                                                                      | 2026-07-16 |
| Backend lint/typecheck/build    | **Pass**                                                                                     | 2026-07-16 |
| Live health/readiness           | **200 / 200**, database up                                                                   | 2026-07-16 |
| Live real-PG auth flow          | **200 / 200 / 204 / 401**                                                                    | 2026-07-16 |
| Database PostgreSQL integration | **10 passed, 0 failed**                                                                      | 2026-07-16 |
| Development seed                | **Pass twice; idempotent**                                                                   | 2026-07-16 |
| Frontend current gates          | Lint/typecheck/build **pass**; **6 files, 42 passed, 0 failed** after cache/expiry hardening | 2026-07-16 |
| Frontend current live delivery  | Standalone `/login` **200**; protected root static response contains no signed-in data       | 2026-07-16 |
| Playwright health smoke         | **1 file, 2 passed, 0 failed**                                                               | 2026-07-15 |
| Docker Compose                  | **Not run; Docker unavailable locally**                                                      | —          |
| GitHub Actions workflow         | **Not executed**                                                                             | —          |
| Browser auth E2E                | **1 file, 1 passed, 0 failed**; `200 → 200 → 204 → 401`, then root redirects to login        | 2026-07-16 |
| Backup/restore drill            | **Not run**                                                                                  | —          |

## Known issues and risks

| ID       | Issue                                                                                            | Severity/impact                                                    |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| CON-008  | Docker is not installed locally                                                                  | Container and clean-environment evidence must run elsewhere        |
| ENV-002  | Local Node.js 25.2.1 is outside Prisma-supported lines                                           | Repeat release gates on Node 24.x or another supported line        |
| AUTH-001 | PermissionGuard, ScopeGuard, password/change, and user/role/admin APIs are absent                | **Blocks Slice 1 completion**                                      |
| AUTH-002 | Trusted reverse-proxy/client-IP policy is not configured                                         | **Blocks production proxy/rate-limit confidence**                  |
| SEC-001  | Origin checking is Auth-controller-specific, not a system-wide CSRF policy                       | **Must be resolved before other cookie-authenticated writes ship** |
| E2E-001  | Unauthorized-action browser coverage awaits PermissionGuard, ScopeGuard, and administration APIs | **Blocks full Slice 1 authorization acceptance**                   |
| UI-001   | Prototype mock/static/toast-only workflows remain non-production                                 | Never copy them as business implementations                        |

CON-009 (missing local database credentials) is resolved. Credentials remain outside Git and documentation.

## Remaining product scope

Complete the rest of Slice 1, then Slices 2–14: catalog, inventory, purchasing/receiving, POS/payments, returns, external services, cash closing, demand, finance/reporting, deterministic recommendations, production dashboard, and launch hardening.

## Next smallest executable steps

1. Add password/change handling and enforce `mustChangePassword`.
2. Implement user/role/admin APIs with PermissionGuard and ScopeGuard plus PostgreSQL authorization tests.
3. Add permission-aware operational navigation.
4. Add unauthorized-action E2E with the authorization APIs.
5. Define the trusted-proxy/client-IP and system-wide CSRF policies before adding business mutations.
6. Run the complete workspace gate, Docker Compose, and GitHub Actions on supported environments.
7. Commit this coherent checkpoint before handing back to another coding agent.
