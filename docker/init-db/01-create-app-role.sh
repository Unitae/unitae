#!/bin/bash
set -e

# Create the non-superuser app role used by the runtime.
# The superuser (POSTGRES_USER) remains for migrations; unitae_app is used by
# the web/worker processes so that RLS policies are enforced.
#
# POSTGRES_APP_PASSWORD defaults to POSTGRES_PASSWORD if not set.

APP_PASSWORD="${POSTGRES_APP_PASSWORD:-${POSTGRES_PASSWORD}}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'unitae_app') THEN
      CREATE ROLE unitae_app LOGIN PASSWORD '${APP_PASSWORD}';
    ELSE
      ALTER ROLE unitae_app LOGIN PASSWORD '${APP_PASSWORD}';
    END IF;
  END
  \$\$;

  GRANT unitae_app TO ${POSTGRES_USER};
EOSQL
