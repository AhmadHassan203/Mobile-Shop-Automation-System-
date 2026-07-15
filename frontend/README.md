# MobileShop OS frontend

This is the production Next.js App Router application. It is intentionally separate from the static reference in `../prototype/` and communicates with the NestJS API only over HTTP.

## Local development

The workspace-level `.env` defines the public API origin. `next.config.ts` loads that root file so the frontend and backend share one local environment source:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

When the variable is absent, local development uses that same localhost URL. It is a public browser setting, never a credential. Start the API on port 4000, then run the frontend through the root workspace command or with `pnpm --filter @mobileshop/frontend dev`.

The `/` workspace route is protected by a server-session check. Missing, expired, inactive, or branch-ineligible sessions purge auth-dependent browser cache and return to `/login` with a same-origin return target. Once authenticated, the workspace displays only the user, organization, branch, roles, and session returned by `/auth/me`, plus live API health. `/login` uses the real authentication API and shared runtime contracts; it contains no seeded credentials or simulated success. Operational business routes remain absent until their vertical slices exist.

## Structure

- `src/app/` — App Router layouts, route states, and global design tokens.
- `src/components/app-shell/` — accessible responsive shell derived from the approved prototype.
- `src/components/auth/` — login/session UI, protected workspace boundary, safe return navigation, and server-confirmed sign-out behavior.
- `src/components/system-status/` — real backend health integration and its loading/error/success states.
- `src/lib/api/` — typed, runtime-validated HTTP boundary.
- `src/lib/query/` — stable TanStack Query keys and auth-dependent cache purging. Future private queries must set `meta: { authDependent: true }`.

## Verification

After the root workspace dependencies and lockfile are installed, run:

```text
pnpm --filter @mobileshop/frontend lint
pnpm --filter @mobileshop/frontend typecheck
pnpm --filter @mobileshop/frontend test
pnpm --filter @mobileshop/frontend build
```

The unit suites cover credentialed requests, URL joining, runtime response validation, structured backend errors, correlation IDs, generic invalid-credential handling, login/current-session/logout routes, safe return targets, ended-session classification, logout cache safety, auth-dependent cache purging, non-JSON failures, and network failures.
