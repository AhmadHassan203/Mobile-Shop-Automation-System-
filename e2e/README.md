# Cross-application E2E tests

This package owns Playwright tests that cross frontend/API boundaries. Tests use
real running services and synthetic records; they must not replace production
behavior with route mocks or hard-coded success responses.

The Slice 0 smoke tests call the real API liveness and PostgreSQL readiness
endpoints and verify their public response contracts. The authenticated browser
test signs in through the real UI and API, verifies the protected workspace,
logs out, and proves the revoked browser session can no longer access either the
workspace or the protected current-auth endpoint. Tests do not mock application
routes or create business data.

## Run the health smoke test

1. Start the API on port 4000 with a valid root `.env`.
2. Run `pnpm --filter @mobileshop/e2e test:smoke`.

For another local or staging API, set `E2E_API_BASE_URL`, including `/api/v1`:

```bash
E2E_API_BASE_URL=https://staging.example.com/api/v1 \
  pnpm --filter @mobileshop/e2e test:smoke
```

The suite does not auto-start applications. CI and local orchestration own
service startup so the same tests can target local, Compose, or staging systems.
Golden business flows will be added only when their production slices exist.

## Run the authenticated browser test

Start the frontend and API, seed a dedicated non-production owner account, and
provide its credentials only through the E2E process environment:

```bash
E2E_OWNER_EMAIL=owner@example.test \
E2E_OWNER_PASSWORD=replace-at-runtime \
  pnpm --filter @mobileshop/e2e test:auth
```

`E2E_FRONTEND_BASE_URL` defaults to `http://localhost:3000`. The test observes
the API URL used by the browser during login, so its authenticated and revoked
session checks always use the same API cookie host. Do not place E2E credentials
in Playwright configuration, source files, command-line arguments, or committed
environment files.

Playwright uses its installed default browser. A local machine that has no
Playwright browser bundle can opt into an installed branded browser with
`E2E_BROWSER_CHANNEL=chrome` or `E2E_BROWSER_CHANNEL=msedge`.

For a local visual checkpoint, set `E2E_CAPTURE_WORKSPACE_SCREENSHOT=1`. This
writes `e2e/test-results/authenticated-workspace.png`, which is ignored by Git.
The screenshot is disabled by default and is never captured when `CI` is set.
