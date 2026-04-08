-- DropForeignKey
ALTER TABLE "PublisherGroup" DROP CONSTRAINT "PublisherGroup_deputyId_fkey";

-- AlterTable
ALTER TABLE "PublisherGroup" ALTER COLUMN "deputyId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "PublisherGroup" ADD CONSTRAINT "PublisherGroup_deputyId_fkey" FOREIGN KEY ("deputyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
