-- =============================================================================
-- MobileShop OS — database provisioning
-- =============================================================================
-- Creates a LEAST-PRIVILEGE application role and the development/test databases.
--
-- 13_ §27 requires a least-privilege database account. The application must never
-- connect as the postgres superuser: a SQL-injection or application bug should not
-- be able to drop a database, read other databases, or write to disk.
--
-- Run as a superuser ONCE per machine:
--   psql -U postgres -h localhost -v app_password='<strong-password>' -f scripts/provision-database.sql
--
-- Then put the matching URLs in the root .env (never in Git):
--   DATABASE_URL=postgresql://mobileshop_app:<password>@localhost:5432/mobileshop_dev?schema=public
--   TEST_DATABASE_URL=postgresql://mobileshop_app:<password>@localhost:5432/mobileshop_test?schema=public
--
-- Idempotent. NEVER drops an existing database (13_ §23.24).
-- =============================================================================

\set ON_ERROR_STOP on

-- Fail fast rather than creating a passwordless role.
\if :{?app_password}
\else
  \echo 'ERROR: app_password is required.'
  \echo 'Usage: psql -U postgres -v app_password=''<strong-password>'' -f scripts/provision-database.sql'
  \quit 1
\endif

-- --- Application role --------------------------------------------------------
-- NOSUPERUSER / NOCREATEDB / NOCREATEROLE: the app may use its own databases and
-- nothing else.
--
-- Built with format(%L) and executed via \gexec so the password is safely quoted
-- and never appears in a string this script concatenates by hand. psql expands
-- :'app_password' into a quoted literal before the statement is sent.
SELECT format(
  'CREATE ROLE mobileshop_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobileshop_app')
\gexec

-- Ensure the password matches what the caller supplied, whether the role is new or pre-existing.
SELECT format('ALTER ROLE mobileshop_app WITH PASSWORD %L', :'app_password')
\gexec

-- --- Databases ---------------------------------------------------------------
-- CREATE DATABASE cannot run inside a transaction block, so \gexec emits each
-- statement only when the database is absent.
SELECT 'CREATE DATABASE mobileshop_dev OWNER mobileshop_app ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'mobileshop_dev')
\gexec

SELECT 'CREATE DATABASE mobileshop_test OWNER mobileshop_app ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'mobileshop_test')
\gexec

-- --- Privileges --------------------------------------------------------------
-- The role owns both databases (Prisma Migrate must create and alter tables) but
-- holds no rights over any other database on the server.
GRANT ALL PRIVILEGES ON DATABASE mobileshop_dev TO mobileshop_app;
GRANT ALL PRIVILEGES ON DATABASE mobileshop_test TO mobileshop_app;

-- Drop the implicit PUBLIC connect right so only intended roles can attach.
REVOKE CONNECT ON DATABASE mobileshop_dev FROM PUBLIC;
REVOKE CONNECT ON DATABASE mobileshop_test FROM PUBLIC;
GRANT CONNECT ON DATABASE mobileshop_dev TO mobileshop_app;
GRANT CONNECT ON DATABASE mobileshop_test TO mobileshop_app;

\echo ''
\echo 'Provisioning complete.'
\echo '  role      : mobileshop_app (NOSUPERUSER, NOCREATEDB, NOCREATEROLE)'
\echo '  databases : mobileshop_dev, mobileshop_test'
\echo ''
\echo 'Next: put DATABASE_URL and TEST_DATABASE_URL in the root .env, then run:'
\echo '  pnpm db:migrate'
\echo '  pnpm db:seed'
