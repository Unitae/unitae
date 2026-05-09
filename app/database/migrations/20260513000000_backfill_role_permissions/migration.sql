-- Phase 3 of the role epic (#157) added roles-viewer, roles-manager, and
-- permissions-manager to the Permission enum but shipped no SQL migration to
-- insert the rows. Fresh installs created them via seedPermissions(); upgrade
-- deploys (which only run `prisma migrate deploy`) never gained them, so the
-- new role-management UI shows an empty permission list for admins.
--
-- This migration backfills the three rows. Admin permission already implies
-- every other permission (see app/shared/auth/permissions.server.ts), so
-- existing admin users regain UI access as soon as the rows exist. Non-admin
-- users need explicit grants via /settings/permissions.
--
-- Idempotent: safe to re-run.

INSERT INTO "Permission" ("key") VALUES
  ('roles-viewer'),
  ('roles-manager'),
  ('permissions-manager')
ON CONFLICT ("key") DO NOTHING;
