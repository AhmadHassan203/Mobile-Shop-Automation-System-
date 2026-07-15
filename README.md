# MobileShop OS

MobileShop OS is a production-oriented operating system for a Lahore mobile shop: PostgreSQL/Prisma persistence, a NestJS API, a Next.js frontend, shared domain contracts, and Playwright cross-application tests. The approved blueprint and prototype remain reference-only and are not production applications.

## Current checkpoint

Slice 1 authentication/access is **in progress**. A real local owner login is working against PostgreSQL, and these routes are live:

- Frontend login: `http://localhost:3000/login`
- Frontend workspace: `http://localhost:3000/`
- API login/logout/current user: `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/me`
- API liveness: `http://localhost:4000/api/v1/health`
- API readiness: `http://localhost:4000/api/v1/health/ready`
- API documentation outside production: `http://localhost:4000/api/docs`

The backend, shared package, database migrations/integration tests, seed, live PostgreSQL auth flow, and hardened protected-workspace frontend have passed their recorded gates. Frontend lint/typecheck/42 tests/build/live delivery pass, and the real browser login → workspace → logout flow passes. Slice 1 is not complete: password/change, user/role/admin APIs, permission/scope guards, permission-aware operational navigation, trusted-proxy policy, broader CSRF policy, and unauthorized-action E2E remain. Exact evidence and counts are in `BUILD_STATUS.md`.

## Repository layout

- `frontend/` — Next.js production UI
- `backend/` — NestJS modular API
- `database/` — Prisma schema, migrations, seeds, and database utilities
- `shared/` — safe cross-package contracts and domain rules
- `e2e/` — real-service Playwright workflows
- `infrastructure/` — local PostgreSQL and optional reverse-proxy configuration
- `mobile-shop-automation-blueprint/` and `prototype/` — approved references

## Local start

Use pnpm 10.30.3 and a Prisma-supported Node.js line (20.19+, 22.12+, or 24.x). PostgreSQL 18 may run locally or through Docker. Do not commit `.env` files or reuse development credentials in staging/production.

1. Copy `.env.example` to `.env` and replace every required `CHANGE_ME` value. This combined file is a local-development convenience only.
2. Copy `frontend/.env.example` to `frontend/.env.local` only when overriding browser-visible defaults. Never place a database, session, migration, admin, or seed secret in a frontend file.
3. For Docker PostgreSQL, also copy `infrastructure/.env.example` to `infrastructure/.env`, set local-only passwords, and follow `infrastructure/README.md`.
4. Install exactly from the workspace lockfile: `pnpm install --frozen-lockfile`.
5. Generate the database client: `pnpm db:generate`.
6. Apply reviewed migrations: `pnpm db:migrate:deploy`.
7. For a synthetic development/test owner and default organization/branch/location, run `pnpm db:seed`. The seed refuses production and never prints the credential.
8. Start the API and frontend: `pnpm dev`.

Each process parses an explicit environment allow-list. Production must inject separate per-process values and must not mount or deploy the repository-root `.env`.

## Verification

Use `pnpm verify` for the aggregate application lint, typecheck, unit/integration tests, and production builds. Use `pnpm test:e2e` against already-running services for cross-application tests.

The current frontend gates and browser auth E2E pass, but the aggregate root command has not yet been re-recorded for this checkpoint. Docker Compose and GitHub Actions also remain unexecuted locally; do not treat their configuration as runtime evidence.

Implementation truth and remaining work are tracked in `BUILD_STATUS.md`. Never interpret generated files or passing unit tests as proof that an unexecuted business workflow is complete.
