-- CreateTable: Implicit many-to-many join table
CREATE TABLE "_BuildingToBuildingEntrance" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_BuildingToBuildingEntrance_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_BuildingToBuildingEntrance_B_index" ON "_BuildingToBuildingEntrance"("B");

-- AddForeignKey
ALTER TABLE "_BuildingToBuildingEntrance" ADD CONSTRAINT "_BuildingToBuildingEntrance_A_fkey" FOREIGN KEY ("A") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BuildingToBuildingEntrance" ADD CONSTRAINT "_BuildingToBuildingEntrance_B_fkey" FOREIGN KEY ("B") REFERENCES "BuildingEntrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: Populate join table from existing FK
INSERT INTO "_BuildingToBuildingEntrance" ("A", "B")
SELECT "id", "entranceId"
FROM "Building"
WHERE "entranceId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "Building" DROP CONSTRAINT "Building_entranceId_fkey";

-- AlterTable: Remove old FK column
ALTER TABLE "Building" DROP COLUMN "entranceId";
