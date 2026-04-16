-- Add track column to support parallel parts (same order, different audience/room)
ALTER TABLE "ProgrammeTemplatePart" ADD COLUMN "track" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProgrammePartAssignment" ADD COLUMN "track" TEXT NOT NULL DEFAULT '';
