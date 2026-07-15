-- Re-establish least-privilege runtime access after a schema is created. Schema
-- recreation removes schema-scoped default privileges, so provisioning alone
-- is insufficient for disposable test databases and fresh environments.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mobileshop_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO mobileshop_app;

DO $$
DECLARE
  runtime_type record;
BEGIN
  FOR runtime_type IN
    SELECT namespace.nspname AS schema_name, type.typname AS type_name
    FROM pg_type AS type
    JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = 'public' AND type.typtype IN ('e', 'd')
  LOOP
    EXECUTE format(
      'GRANT USAGE ON TYPE %I.%I TO mobileshop_app',
      runtime_type.schema_name,
      runtime_type.type_name
    );
  END LOOP;
END;
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mobileshop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mobileshop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mobileshop_migrator IN SCHEMA public
  GRANT USAGE ON TYPES TO mobileshop_app;

-- Audit history remains append-only for the runtime role despite the broad
-- table-level DML grant above.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_events FROM mobileshop_app;
