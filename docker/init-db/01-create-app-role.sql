-- Create the non-superuser app role used by the runtime.
-- The unitae superuser remains for migrations; unitae_app is used by
-- the web/worker processes so that RLS policies are enforced.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'unitae_app') THEN
    CREATE ROLE unitae_app LOGIN PASSWORD 'unitae_app';
  ELSE
    ALTER ROLE unitae_app LOGIN PASSWORD 'unitae_app';
  END IF;
END
$$;

-- unitae must be able to grant privileges to unitae_app during migrations
GRANT unitae_app TO unitae;
