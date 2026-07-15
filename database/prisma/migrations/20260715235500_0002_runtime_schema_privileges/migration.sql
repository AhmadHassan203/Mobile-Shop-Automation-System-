-- The runtime role needs schema USAGE before PostgreSQL can resolve tables,
-- even when table-level DML privileges are already present. Prisma may
-- recreate the public schema during disposable database resets, so keep this
-- access policy in the migration history as well as the provisioning script.
REVOKE CREATE ON SCHEMA public FROM mobileshop_app;
GRANT USAGE ON SCHEMA public TO mobileshop_app;
