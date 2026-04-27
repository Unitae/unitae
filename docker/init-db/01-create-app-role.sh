#!/bin/bash
set -e

# Create the non-superuser app role used by the runtime.
# The superuser (POSTGRES_USER) remains for migrations; unitae_app is used by
# the web/worker processes so that RLS policies are enforced.
#
# Uses DB_RUNTIME_PASSWORD if set, otherwise falls back to POSTGRES_PASSWORD.

password="${DB_RUNTIME_PASSWORD:-${POSTGRES_PASSWORD}}"

# Use -c with separate statements to avoid PL/pgSQL heredoc escaping issues.
# CREATE ROLE fails if the role already exists — ignore that error.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE ROLE unitae_app LOGIN PASSWORD '$password';" 2>/dev/null || true

# Ensure LOGIN is set and password is up to date (idempotent).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "ALTER ROLE unitae_app LOGIN PASSWORD '$password';"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "GRANT unitae_app TO $POSTGRES_USER;"
