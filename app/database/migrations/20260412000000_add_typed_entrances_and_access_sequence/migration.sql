-- AlterTable: Add kind, shopKind, and materialized aggregate fields to BuildingEntrance
ALTER TABLE "BuildingEntrance" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'residential',
ADD COLUMN "shopKind" TEXT NOT NULL DEFAULT '',
ADD COLUMN "homes" INTEGER,
ADD COLUMN "phones" INTEGER,
ADD COLUMN "liberals" INTEGER;

-- CreateTable: BuildingAccess (ordered access barriers per entrance)
CREATE TABLE "BuildingAccess" (
    "id" SERIAL NOT NULL,
    "entranceId" INTEGER NOT NULL,
    "type" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "BuildingAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BuildingResidentialData (per-building residential counts)
CREATE TABLE "BuildingResidentialData" (
    "id" SERIAL NOT NULL,
    "buildingId" INTEGER NOT NULL,
    "entranceId" INTEGER NOT NULL,
    "homes" INTEGER,
    "phones" INTEGER,
    "liberals" INTEGER,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "BuildingResidentialData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildingResidentialData_buildingId_key" ON "BuildingResidentialData"("buildingId");

-- AddForeignKey
ALTER TABLE "BuildingAccess" ADD CONSTRAINT "BuildingAccess_entranceId_fkey" FOREIGN KEY ("entranceId") REFERENCES "BuildingEntrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingAccess" ADD CONSTRAINT "BuildingAccess_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingResidentialData" ADD CONSTRAINT "BuildingResidentialData_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingResidentialData" ADD CONSTRAINT "BuildingResidentialData_entranceId_fkey" FOREIGN KEY ("entranceId") REFERENCES "BuildingEntrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingResidentialData" ADD CONSTRAINT "BuildingResidentialData_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data migration: Populate BuildingAccess from existing BuildingEntrance.access
INSERT INTO "BuildingAccess" ("entranceId", "type", "position", "congregationId")
SELECT "id", "access", 0, "congregationId"
FROM "BuildingEntrance"
WHERE "access" IS NOT NULL;

-- Data migration: Populate BuildingResidentialData from existing Building data
INSERT INTO "BuildingResidentialData" ("buildingId", "entranceId", "homes", "phones", "liberals", "congregationId")
SELECT b."id", b."entranceId", b."homes", b."phones", b."liberals", b."congregationId"
FROM "Building" b
WHERE b."entranceId" IS NOT NULL;

-- Data migration: Compute materialized aggregates on residential entrances
UPDATE "BuildingEntrance" be
SET "homes" = agg."totalHomes",
    "phones" = agg."totalPhones",
    "liberals" = agg."totalLiberals"
FROM (
    SELECT "entranceId",
           SUM("homes") AS "totalHomes",
           SUM("phones") AS "totalPhones",
           SUM("liberals") AS "totalLiberals"
    FROM "BuildingResidentialData"
    GROUP BY "entranceId"
) agg
WHERE be."id" = agg."entranceId";
