-- A template's responsible is a role, not a person.
--
-- Every other delegation in the app already points at a Role and resolves it to people at
-- read time (TemplatePartAllowedRole, TerritoryKindAllowedRole, BoardSectionVisibilityRole).
-- TemplateResponsible was the last direct FK to a person, which meant a handover had to be
-- repeated on every template the outgoing brother held, and the delegation was invisible in
-- the organigram.
--
-- Existing rows are dropped deliberately. There is no safe mapping from "this user" to "the
-- role they meant": picking a role the user happens to hold would silently widen the
-- delegation to everyone else in it. Admins re-pick — see the release note.
--
-- RLS is intentionally untouched: the tenant_isolation policy keys off "congregationId"
-- alone and is already in the CASE/NULLIF form required by docs/development/row-level-security.md,
-- so swapping a different column has no effect on it.

DELETE FROM "TemplateResponsible";

ALTER TABLE "TemplateResponsible" DROP CONSTRAINT IF EXISTS "TemplateResponsible_userId_fkey";
ALTER TABLE "TemplateResponsible" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "TemplateResponsible" ADD COLUMN "roleId" INTEGER NOT NULL;

ALTER TABLE "TemplateResponsible"
  ADD CONSTRAINT "TemplateResponsible_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "TemplateResponsible_roleId_idx" ON "TemplateResponsible"("roleId");
