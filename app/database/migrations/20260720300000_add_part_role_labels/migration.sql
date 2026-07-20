-- AlterTable
ALTER TABLE "ProgrammeTemplatePart" ADD COLUMN "speakerLabel" TEXT;
ALTER TABLE "ProgrammeTemplatePart" ADD COLUMN "readerLabel" TEXT;

-- AlterTable
ALTER TABLE "ProgrammePartAssignment" ADD COLUMN "speakerLabel" TEXT;
ALTER TABLE "ProgrammePartAssignment" ADD COLUMN "readerLabel" TEXT;
