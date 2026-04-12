-- Add inline fields to ProgrammePartAssignment
ALTER TABLE "ProgrammePartAssignment"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "section" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "durationMin" INTEGER;

-- Add inline field to ProgrammeServiceRoleAssignment
ALTER TABLE "ProgrammeServiceRoleAssignment"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT '';

-- Backfill inline fields from template parts
UPDATE "ProgrammePartAssignment" pa
SET
  "name" = p."name",
  "section" = p."section",
  "order" = p."order",
  "durationMin" = p."durationMin"
FROM "ProgrammeTemplatePart" p
WHERE pa."partId" = p."id";

-- Backfill inline field from template service roles
UPDATE "ProgrammeServiceRoleAssignment" sa
SET "name" = sr."name"
FROM "ProgrammeTemplateServiceRole" sr
WHERE sa."serviceRoleId" = sr."id";

-- Drop old compound unique constraints (partId/serviceRoleId are now nullable)
DROP INDEX "ProgrammePartAssignment_eventId_partId_congregationId_key";
DROP INDEX "ProgrammeServiceRoleAssignment_eventId_serviceRoleId_congre_key";

-- Make partId nullable
ALTER TABLE "ProgrammePartAssignment" DROP CONSTRAINT "ProgrammePartAssignment_partId_fkey";
ALTER TABLE "ProgrammePartAssignment" ALTER COLUMN "partId" DROP NOT NULL;
ALTER TABLE "ProgrammePartAssignment" ADD CONSTRAINT "ProgrammePartAssignment_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "ProgrammeTemplatePart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Make serviceRoleId nullable
ALTER TABLE "ProgrammeServiceRoleAssignment" DROP CONSTRAINT "ProgrammeServiceRoleAssignment_serviceRoleId_fkey";
ALTER TABLE "ProgrammeServiceRoleAssignment" ALTER COLUMN "serviceRoleId" DROP NOT NULL;
ALTER TABLE "ProgrammeServiceRoleAssignment" ADD CONSTRAINT "ProgrammeServiceRoleAssignment_serviceRoleId_fkey"
  FOREIGN KEY ("serviceRoleId") REFERENCES "ProgrammeTemplateServiceRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
