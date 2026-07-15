# Local infrastructure

The default Compose stack starts PostgreSQL only. It binds to loopback, keeps
PostgreSQL 18's versioned data directory in a named volume, creates separate
development, test, and Prisma shadow databases. Schema changes use a dedicated
migration role; the backend receives a least-privilege DML-only role. No
credential is stored in Git.

## Start PostgreSQL

1. Copy `infrastructure/.env.example` to `infrastructure/.env`.
2. Replace all three `CHANGE_ME` values with different local-only passwords.
   Keep `POSTGRES_SUPERUSER` distinct from the reserved `mobileshop_app` and
   `mobileshop_migrator` roles.
3. Put the application password in the root `.env` `DATABASE_URL` and
   `TEST_DATABASE_URL` values. Put the migration password in
   `MIGRATION_DATABASE_URL`, `TEST_MIGRATION_DATABASE_URL`, and
   `SHADOW_DATABASE_URL`. Percent-encode any reserved URL characters in those
   connection strings.
4. Start the database:

   ```bash
   docker compose --env-file infrastructure/.env up -d postgres
   docker compose --env-file infrastructure/.env ps
   ```

5. Apply the committed schema to the development database from the repository
   root, then confirm its status:

   ```bash
   pnpm db:migrate:deploy
   pnpm --filter @mobileshop/database migrate:status
   ```

Compose provisions roles and empty databases; it deliberately does not apply
application migrations. CI points `MIGRATION_DATABASE_URL` at
`mobileshop_test`, applies the same committed migrations there, and only then
runs database and API integration tests.

If native PostgreSQL already owns port 5432, either keep using that instance or
set `POSTGRES_PORT` to an unused host port and update all five database URLs in
the root `.env`. Do not try to bind the Compose service to an occupied port.

The mounted provisioning SQL runs only for a new `postgres_data` volume. It is
the same idempotent policy used by `scripts/provision-database.sql` for a native
PostgreSQL installation. Changing credentials in the env file later does not
mutate an existing database role.

Deleting the volume destroys local data, so do that only as an intentional
local reset.

## Optional reverse proxy

Caddy provides a same-origin entry point at `http://localhost:8080` while the
frontend and API run on host ports 3000 and 4000. This is useful for rehearsing
cookie and proxy behavior, but it is opt-in until application Dockerfiles exist:

```bash
docker compose --env-file infrastructure/.env --profile proxy up -d
```

`/proxy-health` checks Caddy itself. `/api/*` is forwarded unchanged to the API;
all other requests go to the frontend. The production deployment must replace
this local HTTP listener with an approved hostname and managed TLS.

## Status

The Compose services and Caddy configuration are configuration foundations.
They have not been started in this environment because Docker is unavailable.
