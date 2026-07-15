-- =============================================================================
-- MobileShop OS — local database provisioning
-- =============================================================================
-- Creates separate DDL and runtime roles plus isolated development, test and
-- Prisma shadow databases. Idempotent; it never drops a database.
--
-- Passwords are read from environment variables instead of psql -v arguments,
-- keeping them out of shell history and process listings:
--   MOBILESHOP_APP_DB_PASSWORD
--   MOBILESHOP_MIGRATOR_DB_PASSWORD
-- =============================================================================

\set ON_ERROR_STOP on
\getenv app_password MOBILESHOP_APP_DB_PASSWORD
\getenv migrator_password MOBILESHOP_MIGRATOR_DB_PASSWORD

\if :{?app_password}
\else
  \echo 'ERROR: MOBILESHOP_APP_DB_PASSWORD is required.'
  \quit 1
\endif

\if :{?migrator_password}
\else
  \echo 'ERROR: MOBILESHOP_MIGRATOR_DB_PASSWORD is required.'
  \quit 1
\endif

-- Runtime role: data access only. It must never own a database or schema.
SELECT format(
  'CREATE ROLE mobileshop_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobileshop_app')
\gexec

SELECT format(
  'ALTER ROLE mobileshop_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_password'
)
\gexec

-- Migration role: owns schema objects but still cannot create roles/databases or
-- bypass row-level security. The backend never receives this credential.
SELECT format(
  'CREATE ROLE mobileshop_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'migrator_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobileshop_migrator')
\gexec

SELECT format(
  'ALTER ROLE mobileshop_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'migrator_password'
)
\gexec

-- CREATE DATABASE cannot run inside a transaction, so \gexec conditionally
-- emits one statement per absent database.
SELECT 'CREATE DATABASE mobileshop_dev OWNER mobileshop_migrator ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'mobileshop_dev')
\gexec

SELECT 'CREATE DATABASE mobileshop_test OWNER mobileshop_migrator ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'mobileshop_test')
\gexec

SELECT 'CREATE DATABASE mobileshop_shadow OWNER mobileshop_migrator ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'mobileshop_shadow')
\gexec

-- Repair ownership left by older versions of this script. Runtime credentials
-- must not be able to alter/drop the database or its schema.
ALTER DATABASE mobileshop_dev OWNER TO mobileshop_migrator;
ALTER DATABASE mobileshop_test OWNER TO mobileshop_migrator;
ALTER DATABASE mobileshop_shadow OWNER TO mobileshop_migrator;

REVOKE ALL PRIVILEGES ON DATABASE mobileshop_dev FROM PUBLIC, mobileshop_app;
REVOKE ALL PRIVILEGES ON DATABASE mobileshop_test FROM PUBLIC, mobileshop_app;
REVOKE ALL PRIVILEGES ON DATABASE mobileshop_shadow FROM PUBLIC, mobileshop_app;
GRANT CONNECT ON DATABASE mobileshop_dev TO mobileshop_app;
GRANT CONNECT ON DATABASE mobileshop_test TO mobileshop_app;

-- The migrator owns all three databases. The dedicated shadow database may be
-- reset by Prisma; the integration-test database is never used as shadow.
\connect mobileshop_dev
REVOKE CREATE ON SCHEMA public FROM PUBLIC, mobileshop_app;
GRANT USAGE ON SCHEMA public TO mobileshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mobileshop_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO mobileshop_app;
SELECT format('GRANT USAGE ON TYPE %I.%I TO mobileshop_app', n.nspname, t.typname)
FROM pg_type AS t
JOIN pg_namespace AS n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
\gexec
ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mobileshop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mobileshop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT USAGE ON TYPES TO mobileshop_app;
SELECT 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_events FROM mobileshop_app'
WHERE to_regclass('public.audit_events') IS NOT NULL
\gexec
SELECT 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE login_attempts FROM mobileshop_app'
WHERE to_regclass('public.login_attempts') IS NOT NULL
\gexec
SELECT 'REVOKE DELETE, TRUNCATE ON TABLE users FROM mobileshop_app'
WHERE to_regclass('public.users') IS NOT NULL
\gexec
SELECT format('REVOKE DELETE, TRUNCATE ON TABLE %I FROM mobileshop_app', catalog_table)
FROM unnest(ARRAY[
  'categories', 'brands', 'product_models', 'product_variants',
  'product_aliases', 'product_barcodes'
]) AS catalog_table
WHERE to_regclass('public.' || catalog_table) IS NOT NULL
\gexec

\connect mobileshop_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC, mobileshop_app;
GRANT USAGE ON SCHEMA public TO mobileshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mobileshop_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO mobileshop_app;
SELECT format('GRANT USAGE ON TYPE %I.%I TO mobileshop_app', n.nspname, t.typname)
FROM pg_type AS t
JOIN pg_namespace AS n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
\gexec
ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mobileshop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mobileshop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT USAGE ON TYPES TO mobileshop_app;
SELECT 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_events FROM mobileshop_app'
WHERE to_regclass('public.audit_events') IS NOT NULL
\gexec
SELECT 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE login_attempts FROM mobileshop_app'
WHERE to_regclass('public.login_attempts') IS NOT NULL
\gexec
SELECT 'REVOKE DELETE, TRUNCATE ON TABLE users FROM mobileshop_app'
WHERE to_regclass('public.users') IS NOT NULL
\gexec
SELECT format('REVOKE DELETE, TRUNCATE ON TABLE %I FROM mobileshop_app', catalog_table)
FROM unnest(ARRAY[
  'categories', 'brands', 'product_models', 'product_variants',
  'product_aliases', 'product_barcodes'
]) AS catalog_table
WHERE to_regclass('public.' || catalog_table) IS NOT NULL
\gexec

\connect postgres
\echo ''
\echo 'Provisioning complete.'
\echo '  runtime role : mobileshop_app (DML only; dev/test)'
\echo '  schema role  : mobileshop_migrator (DDL; dev/test/shadow)'
\echo '  databases    : mobileshop_dev, mobileshop_test, mobileshop_shadow'
