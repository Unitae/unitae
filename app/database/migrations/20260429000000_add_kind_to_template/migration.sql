-- AlterTable
ALTER TABLE "ProgrammeTemplate" ADD COLUMN "kindId" INTEGER;

-- AddForeignKey
ALTER TABLE "ProgrammeTemplate" ADD CONSTRAINT "ProgrammeTemplate_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "EventKind"("id") ON DELETE SET NULL ON UPDATE CASCADE;
