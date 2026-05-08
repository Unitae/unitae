-- Phase 2 of the role epic: introduce the Role / RolePermission / UserRoleAssignment layer
-- alongside the existing Permission / CongregationUserPermission tables. Built-in roles seed
-- per-congregation and back-fill from User boolean fields. No RolePermission grants are
-- inserted at this phase — admins configure them in phase 3.

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_congregationId_key" ON "Role"("key", "congregationId");
CREATE UNIQUE INDEX "Role_id_congregationId_key" ON "Role"("id", "congregationId");
CREATE INDEX "RolePermission_congregationId_idx" ON "RolePermission"("congregationId");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");
CREATE INDEX "UserRoleAssignment_congregationId_idx" ON "UserRoleAssignment"("congregationId");
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_congregationId_fkey"
  FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security on all three tables. The policy uses CASE WHEN NULLIF(...) IS NULL THEN true
-- ELSE ... END (never OR) to ensure the planner cannot reorder branches in a way that leaks rows.
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RolePermission" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "UserRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRoleAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserRoleAssignment" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- Backfill: seed seven built-in roles per existing congregation. Built-ins have null
-- name/description (rendered via Paraglide messages keyed on `key`) and isBuiltIn = true.
INSERT INTO "Role" ("key", "isBuiltIn", "congregationId", "updatedAt")
SELECT v.key, true, c.id, CURRENT_TIMESTAMP
FROM "Congregation" c
CROSS JOIN (VALUES
  ('male'),
  ('female'),
  ('publisher'),
  ('baptized'),
  ('anointed'),
  ('elder'),
  ('assistant-servant')
) AS v(key);

-- Backfill: seed UserRoleAssignment rows for existing users based on the boolean predicates
-- that drive each built-in role. NULL booleans (e.g. unset isMale) intentionally produce no
-- assignment for either male or female.
INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT u.id, r.id, u."congregationId"
FROM "User" u
JOIN "Role" r ON r."congregationId" = u."congregationId" AND r."key" = 'male' AND r."isBuiltIn" = true
WHERE u."isMale" = true;

INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT u.id, r.id, u."congregationId"
FROM "User" u
JOIN "Role" r ON r."congregationId" = u."congregationId" AND r."key" = 'female' AND r."isBuiltIn" = true
WHERE u."isMale" = false;

INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT u.id, r.id, u."congregationId"
FROM "User" u
JOIN "Role" r ON r."congregationId" = u."congregationId" AND r."key" = 'publisher' AND r."isBuiltIn" = true
WHERE u."isPublisher" = true;

INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT u.id, r.id, u."congregationId"
FROM "User" u
JOIN "Role" r ON r."congregationId" = u."congregationId" AND r."key" = 'baptized' AND r."isBuiltIn" = true
WHERE u."baptismDate" IS NOT NULL;

INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT u.id, r.id, u."congregationId"
FROM "User" u
JOIN "Role" r ON r."congregationId" = u."congregationId" AND r."key" = 'anointed' AND r."isBuiltIn" = true
WHERE u."isAnointed" = true;

INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT u.id, r.id, u."congregationId"
FROM "User" u
JOIN "Role" r ON r."congregationId" = u."congregationId" AND r."key" = 'elder' AND r."isBuiltIn" = true
WHERE u."isHelder" = true;

INSERT INTO "UserRoleAssignment" ("userId", "roleId", "congregationId")
SELECT u.id, r.id, u."congregationId"
FROM "User" u
JOIN "Role" r ON r."congregationId" = u."congregationId" AND r."key" = 'assistant-servant' AND r."isBuiltIn" = true
WHERE u."isServant" = true;
