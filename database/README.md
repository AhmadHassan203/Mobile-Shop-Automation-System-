# Database

All Prisma schema, migrations, seeds, and database utilities live here (`13_` §1.3, §19). No database code belongs in `backend/` or `frontend/`, and the frontend never connects to PostgreSQL (`13_` §1.6).

## Layout

```text
database/
├── prisma/
│   ├── schema.prisma       Single schema; models grouped by slice
│   └── migrations/         Reviewed, forward-only migration history
├── src/
│   └── index.ts            The only place a PrismaClient is constructed
├── seeds/                  Deterministic development/test seed data
├── scripts/                Provisioning and maintenance utilities
├── fixtures/               Test fixtures
├── diagrams/               ERD sources
├── prisma.config.ts        Prisma 7 CLI config for migration connections
└── README.md
```

## Verified status

The Slice 1 identity/access schema and its forward-only migration history are implemented. The migration chain was rehearsed on the disposable `mobileshop_test` database and deployed without reset to `mobileshop_dev` on PostgreSQL 18.4.

| Step                                        | Executed result                                              |
| ------------------------------------------- | ------------------------------------------------------------ |
| Schema authored (14 Slice 1 models)         | **Pass**                                                     |
| `prisma format` / `prisma validate`         | **Pass**                                                     |
| `prisma generate` / package typecheck/build | **Pass**                                                     |
| Migration-to-schema diff                    | **Empty**                                                    |
| Test-database migration rehearsal           | **Pass**                                                     |
| Development migration deploy                | **Pass**; all four reviewed migrations applied without reset |
| PostgreSQL integration tests                | **1 file, 10 tests passed, 0 failed**                        |
| Deterministic development seed              | **Pass twice**; second run verified idempotence              |

The integration suite verifies tenant-consistent foreign keys, normalized/unique email identity, one default branch/location, nullable-scope uniqueness, number-sequence uniqueness, numeric/session checks, append-only audit and login-attempt history, denial of runtime DDL, and database-enforced deactivation instead of hard user deletion.

After two seed runs, the safe baseline remained **1 organization, 1 branch, 1 user, 7 roles, and 73 permissions**. Live auth evidence then recorded **1 successful login, 1 revoked session, 1 `auth.login_succeeded` audit event, and 1 `auth.logout` audit event**. These are local checkpoint counts, not production data.

## Migration history

| Migration                                              | Development | Disposable test   | Purpose                                                      |
| ------------------------------------------------------ | ----------- | ----------------- | ------------------------------------------------------------ |
| `20260715164914_0001_identity_and_access`              | Applied     | Applied/rehearsed | Slice 1 identity, access, audit, and system schema           |
| `20260715235500_0002_runtime_schema_privileges`        | Applied     | Applied/rehearsed | Runtime schema privilege policy                              |
| `20260715235600_0003_runtime_object_privileges`        | Applied     | Applied/rehearsed | Runtime object privilege policy                              |
| `20260716003000_0004_auth_evidence_and_user_integrity` | Applied     | Applied/rehearsed | Append-only login evidence and no-hard-delete user integrity |

Production is not configured and no production migration has been applied.

## Provisioning

Run `scripts/provision-database.sql` once as a PostgreSQL superuser. It reads separate runtime and migration passwords from `MOBILESHOP_APP_DB_PASSWORD` and `MOBILESHOP_MIGRATOR_DB_PASSWORD`; do not pass secrets as command-line arguments. The script idempotently creates:

- `mobileshop_app`: least-privilege runtime DML role;
- `mobileshop_migrator`: DDL owner used only by Prisma Migrate; and
- `mobileshop_dev`, `mobileshop_test`, and `mobileshop_shadow` databases.

Copy `.env.example` to the git-ignored root `.env`, replace every placeholder, and keep migration/admin credentials out of backend runtime environments. The database CLI reads only its migration/shadow allow-list; the API and frontend do not inherit those values.

Deploy reviewed migrations with:

```bash
pnpm db:migrate:deploy
```

## Development seed

Run the deterministic seed only with `NODE_ENV=development` or `NODE_ENV=test`:

```bash
pnpm db:seed
```

The seed reads `DATABASE_URL` and the documented owner-seed settings from ignored local configuration. It creates the synthetic organization, default branch/location, permission catalogue, system roles, and owner account. Re-running it preserves an existing owner password and edited role grants, and it never prints credentials.

Production owner bootstrap and password-rotation policy are not implemented; do not treat the development seed as a production provisioning procedure.

## Prisma 7 notes

Prisma 7 changed two things this project relies on:

1. **`url` is no longer allowed in the `datasource` block.** Migrate reads the connection string from `prisma.config.ts`; the runtime client is built with a **driver adapter** (`@prisma/adapter-pg`) in `src/index.ts`.
2. **`@prisma/client-runtime-utils` must be an explicit dependency.** Under pnpm's strict isolation the generated client (in `generated/`, outside `node_modules`) cannot resolve it transitively.

`generated/` is git-ignored and rebuilt by `pnpm db:generate`.

## Conventions

| Rule                                                         | Why                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Money is an integer of minor units, column suffix `_minor`   | `05_RULES.md` §7, `13_` §23.11 — floats corrupt COGS and cash       |
| Timestamps are `@db.Timestamptz(3)`, stored UTC              | `05_RULES.md` §9; business days resolve in `shared/src/datetime.ts` |
| `organization_id` / `branch_id` / `location_id` from day one | `13_` §8 — later multi-branch support needs no identity migration   |
| Constraints live in the database, not only the API           | `13_` §4 — the API is not the only possible writer                  |
| Posted records and evidence are immutable                    | `13_` §23.9 — corrections use controlled workflows                  |
| `onDelete: Restrict` by default                              | Referenced history must not vanish; master data is soft-deactivated |

## Models by slice

**Slice 1 (authored):** `Organization`, `Branch`, `StockLocation`, `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `UserScopeAccess`, `Session`, `LoginAttempt`, `AuditEvent`, `ApplicationSetting`, `NumberSequence`.

**Later slices:** catalog (2), inventory (3), suppliers/purchasing (4), sales/payments (5), returns (6), external services (7), cash sessions/expenses (8), demand (9), ledger/receivables/payables (10), recommendations (11). Full plan: `docs/DATABASE_IMPLEMENTATION_MAP.md`.

## Safety

- Never run `prisma migrate reset` against a database holding real data; it drops everything (`13_` §23.24).
- `reset` and `migrate dev` are disposable-development operations only. Production deploys use `migrate:deploy`, which applies reviewed pending migrations.
- The application connects as `mobileshop_app`, never as `postgres` or the migration owner.
- Runtime DDL is denied.
- Runtime and migration roles cannot update, delete, or truncate `login_attempts`.
- Runtime users cannot be hard-deleted; deactivate them through a controlled workflow.
- Never place a database password, seed password, connection URL, cookie secret, or credential-derived value in documentation, Git, logs, or tests.
