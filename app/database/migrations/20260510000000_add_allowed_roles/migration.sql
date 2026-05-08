-- Phase 4 of the role epic: gate programme part / service-role assignees by Role.
-- Four join tables (template + per-event copy, parts use an `asKind` discriminator
-- for speaker/reader). Empty allowed-role lists fall back to "publishers only" at
-- read time; non-empty lists require at least one role match.

-- CreateTable
CREATE TABLE "ProgrammeTemplatePartAllowedRole" (
    "partId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "asKind" TEXT NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammeTemplatePartAllowedRole_pkey" PRIMARY KEY ("partId","roleId","asKind")
);

-- CreateTable
CREATE TABLE "ProgrammePartAssignmentAllowedRole" (
    "assignmentId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "asKind" TEXT NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammePartAssignmentAllowedRole_pkey" PRIMARY KEY ("assignmentId","roleId","asKind")
);

-- CreateTable
CREATE TABLE "ProgrammeTemplateServiceRoleAllowedRole" (
    "serviceRoleId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammeTemplateServiceRoleAllowedRole_pkey" PRIMARY KEY ("serviceRoleId","roleId")
);

-- CreateTable
CREATE TABLE "ProgrammeServiceRoleAssignmentAllowedRole" (
    "assignmentId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammeServiceRoleAssignmentAllowedRole_pkey" PRIMARY KEY ("assignmentId","roleId")
);

-- CreateIndex
CREATE INDEX "ProgrammeTemplatePartAllowedRole_roleId_idx" ON "ProgrammeTemplatePartAllowedRole"("roleId");
CREATE INDEX "ProgrammeTemplatePartAllowedRole_congregationId_idx" ON "ProgrammeTemplatePartAllowedRole"("congregationId");
CREATE INDEX "ProgrammePartAssignmentAllowedRole_roleId_idx" ON "ProgrammePartAssignmentAllowedRole"("roleId");
CREATE INDEX "ProgrammePartAssignmentAllowedRole_congregationId_idx" ON "ProgrammePartAssignmentAllowedRole"("congregationId");
CREATE INDEX "ProgrammeTemplateServiceRoleAllowedRole_roleId_idx" ON "ProgrammeTemplateServiceRoleAllowedRole"("roleId");
CREATE INDEX "ProgrammeTemplateServiceRoleAllowedRole_congregationId_idx" ON "ProgrammeTemplateServiceRoleAllowedRole"("congregationId");
CREATE INDEX "ProgrammeServiceRoleAssignmentAllowedRole_roleId_idx" ON "ProgrammeServiceRoleAssignmentAllowedRole"("roleId");
CREATE INDEX "ProgrammeServiceRoleAssignmentAllowedRole_congregationId_idx" ON "ProgrammeServiceRoleAssignmentAllowedRole"("congregationId");

-- AddForeignKey
ALTER TABLE "ProgrammeTemplatePartAllowedRole" ADD CONSTRAINT "ProgrammeTemplatePartAllowedRole_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "ProgrammeTemplatePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeTemplatePartAllowedRole" ADD CONSTRAINT "ProgrammeTemplatePartAllowedRole_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeTemplatePartAllowedRole" ADD CONSTRAINT "ProgrammeTemplatePartAllowedRole_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProgrammePartAssignmentAllowedRole" ADD CONSTRAINT "ProgrammePartAssignmentAllowedRole_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ProgrammePartAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammePartAssignmentAllowedRole" ADD CONSTRAINT "ProgrammePartAssignmentAllowedRole_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammePartAssignmentAllowedRole" ADD CONSTRAINT "ProgrammePartAssignmentAllowedRole_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProgrammeTemplateServiceRoleAllowedRole" ADD CONSTRAINT "ProgrammeTemplateServiceRoleAllowedRole_serviceRoleId_fkey"
  FOREIGN KEY ("serviceRoleId") REFERENCES "ProgrammeTemplateServiceRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeTemplateServiceRoleAllowedRole" ADD CONSTRAINT "ProgrammeTemplateServiceRoleAllowedRole_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeTemplateServiceRoleAllowedRole" ADD CONSTRAINT "ProgrammeTemplateServiceRoleAllowedRole_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProgrammeServiceRoleAssignmentAllowedRole" ADD CONSTRAINT "ProgrammeServiceRoleAssignmentAllowedRole_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ProgrammeServiceRoleAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeServiceRoleAssignmentAllowedRole" ADD CONSTRAINT "ProgrammeServiceRoleAssignmentAllowedRole_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeServiceRoleAssignmentAllowedRole" ADD CONSTRAINT "ProgrammeServiceRoleAssignmentAllowedRole_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security on all four tables. The policy uses CASE WHEN NULLIF(...) IS NULL THEN true
-- ELSE ... END (never OR) to ensure the planner cannot reorder branches in a way that leaks rows.
ALTER TABLE "ProgrammeTemplatePartAllowedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeTemplatePartAllowedRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeTemplatePartAllowedRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "ProgrammePartAssignmentAllowedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammePartAssignmentAllowedRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammePartAssignmentAllowedRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "ProgrammeTemplateServiceRoleAllowedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeTemplateServiceRoleAllowedRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeTemplateServiceRoleAllowedRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "ProgrammeServiceRoleAssignmentAllowedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeServiceRoleAssignmentAllowedRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeServiceRoleAssignmentAllowedRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
