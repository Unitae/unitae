-- AlterTable
ALTER TABLE "ProgrammeTemplate"
  ADD COLUMN "startTime" TEXT NOT NULL DEFAULT '19:00',
  ADD COLUMN "endTime" TEXT NOT NULL DEFAULT '21:00';
