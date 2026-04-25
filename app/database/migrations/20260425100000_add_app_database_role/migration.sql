-- CreateRole
-- Create a non-superuser application role for RLS enforcement.
-- Superusers bypass all RLS policies, so the app runtime must connect
-- as a non-superuser for tenant isolation to actually work.
-- The role is created with NOLOGIN — each environment sets the password separately.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'unitae_app') THEN
    CREATE ROLE unitae_app NOLOGIN;
  END IF;
END
$$;

-- Grant schema usage and DML on all existing tables
GRANT USAGE ON SCHEMA public TO unitae_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO unitae_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO unitae_app;

-- Auto-grant on future tables/sequences created by the unitae superuser (migrations)
ALTER DEFAULT PRIVILEGES FOR ROLE unitae IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO unitae_app;
ALTER DEFAULT PRIVILEGES FOR ROLE unitae IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO unitae_app;
