# Database

All Prisma schema, migrations, seeds and database utilities live here (`13_` §1.3, §19). No database code belongs in `backend/` or `frontend/`, and the frontend never connects to PostgreSQL (`13_` §1.6).

## Layout

```text
database/
├── prisma/
│   ├── schema.prisma       Single schema; models grouped by slice
│   └── migrations/         Reviewed, committed migrations (none yet — see Status)
├── src/
│   └── index.ts            The only place a PrismaClient is constructed
├── seeds/                  Deterministic development seed data
├── scripts/                Maintenance utilities
├── fixtures/               Test fixtures
├── diagrams/               ERD sources
├── prisma.config.ts        Prisma 7 CLI config (connection string for Migrate)
└── README.md
```

## Status — blocked

**No migration has been generated or applied. No seed has been run.**

PostgreSQL 18.4 is running on `localhost:5432`, but no credentials exist in the repository or environment (CON-009). Everything that does not need a live connection is done and verified:

| Step | Status |
|---|---|
| Schema authored (14 Slice 1 models) | Done |
| `prisma validate` | **Passes** |
| `prisma generate` | **Passes** — client loads, all 14 models present |
| `prisma migrate dev` | **Not run** — needs credentials |
| `prisma db seed` | **Not run** — needs credentials |
| Integration tests | **Not run** — needs credentials |

## Unblocking

One command, once, as a PostgreSQL superuser:

```bash
psql -U postgres -h localhost -v app_password='<choose-a-strong-password>' \
     -f scripts/provision-database.sql
```

This creates a **least-privilege** role (`mobileshop_app`: `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`) and the `mobileshop_dev` / `mobileshop_test` databases. It is idempotent and never drops an existing database.

Then put the URLs in the **root `.env`** (git-ignored — the secret never enters the repository):

```dotenv
DATABASE_URL=postgresql://mobileshop_app:<password>@localhost:5432/mobileshop_dev?schema=public
TEST_DATABASE_URL=postgresql://mobileshop_app:<password>@localhost:5432/mobileshop_test?schema=public
```

Then:

```bash
pnpm db:migrate    # create and apply the first migration
pnpm db:seed       # deterministic development data
```

## Prisma 7 notes

Prisma 7 changed two things this project relies on:

1. **`url` is no longer allowed in the `datasource` block.** Migrate reads the connection string from `prisma.config.ts`; the runtime client is built with a **driver adapter** (`@prisma/adapter-pg`) in `src/index.ts`.
2. **`@prisma/client-runtime-utils` must be an explicit dependency.** Under pnpm's strict isolation the generated client (in `generated/`, outside `node_modules`) cannot resolve it transitively.

`generated/` is git-ignored and rebuilt by `pnpm db:generate`.

## Conventions

| Rule | Why |
|---|---|
| Money is an integer of minor units, column suffix `_minor` | `05_RULES.md` §7, `13_` §23.11 — floats corrupt COGS and cash |
| Timestamps are `@db.Timestamptz(3)`, stored UTC | `05_RULES.md` §9; business days resolve in `shared/src/datetime.ts` |
| `organization_id` / `branch_id` / `location_id` from day one | `13_` §8 — multi-branch later needs no data migration |
| Constraints live in the database, not only the API | `13_` §4 — the API is not the only writer |
| Posted records are immutable | `13_` §23.9 — corrections use controlled workflows |
| `onDelete: Restrict` by default | Referenced history must not vanish; master data is soft-deactivated |

## Models by slice

**Slice 1 (authored):** `Organization`, `Branch`, `StockLocation`, `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `UserScopeAccess`, `Session`, `LoginAttempt`, `AuditEvent`, `ApplicationSetting`, `NumberSequence`.

**Later slices:** catalog (2), inventory (3), suppliers/purchasing (4), sales/payments (5), returns (6), external services (7), cash sessions/expenses (8), demand (9), ledger/receivables/payables (10), recommendations (11). Full plan: `docs/DATABASE_IMPLEMENTATION_MAP.md`.

## Safety

- Never run `prisma migrate reset` against a database holding real data — it drops everything (`13_` §23.24).
- `reset` and `migrate dev` are development-only. Production deploys use `migrate:deploy`, which only applies pending migrations.
- The application connects as `mobileshop_app`, never as `postgres`.
