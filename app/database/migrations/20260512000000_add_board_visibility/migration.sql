-- Phase 6 of the role epic: BoardViewer permission gates board access, and a new
-- BoardSectionVisibilityRole join table lets admins restrict each section to specific
-- roles. Empty role lists keep the section visible to everyone with BoardViewer
-- (current default behavior); non-empty lists require an intersection between the
-- viewer's effective roles and the section's allowed roles.

-- CreateTable
CREATE TABLE "BoardSectionVisibilityRole" (
    "sectionId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "BoardSectionVisibilityRole_pkey" PRIMARY KEY ("sectionId","roleId")
);

-- CreateIndex
CREATE INDEX "BoardSectionVisibilityRole_roleId_idx" ON "BoardSectionVisibilityRole"("roleId");
CREATE INDEX "BoardSectionVisibilityRole_congregationId_idx" ON "BoardSectionVisibilityRole"("congregationId");

-- AddForeignKey
ALTER TABLE "BoardSectionVisibilityRole" ADD CONSTRAINT "BoardSectionVisibilityRole_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "BoardSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardSectionVisibilityRole" ADD CONSTRAINT "BoardSectionVisibilityRole_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardSectionVisibilityRole" ADD CONSTRAINT "BoardSectionVisibilityRole_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security. The policy uses CASE WHEN NULLIF(...) IS NULL THEN true
-- ELSE ... END (never OR) so the planner cannot reorder branches in a way that leaks rows.
ALTER TABLE "BoardSectionVisibilityRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardSectionVisibilityRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoardSectionVisibilityRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Seed the new BoardViewer permission. Idempotent: safe to re-run.
INSERT INTO "Permission" ("key") VALUES ('board-viewer')
ON CONFLICT ("key") DO NOTHING;

-- Grant BoardViewer to the publisher built-in role for every congregation. Phase 2
-- (20260509000000_add_role_layer) already seeded the publisher role per congregation
-- and assigned every isPublisher = true user to it, so this single grant covers the
-- existing publisher population. Non-publisher accounts (admin-only, validator-only,
-- etc.) lose the auto-grant and need an explicit BoardViewer assignment via the
-- settings UI after rollout. Idempotent: safe to re-run.
INSERT INTO "RolePermission" ("roleId", "permissionId", "congregationId")
SELECT r."id", p."id", r."congregationId"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" = 'board-viewer'
  AND r."isBuiltIn" = true
  AND r."key" = 'publisher'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
