-- AlterTable: store centroid lat/lng on BuildingEntrance
ALTER TABLE "BuildingEntrance" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "BuildingEntrance" ADD COLUMN "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "BuildingEntrance_congregationId_latitude_longitude_idx"
  ON "BuildingEntrance"("congregationId", "latitude", "longitude");

-- Backfill existing entrances with the centroid of their geocoded buildings
UPDATE "BuildingEntrance" AS e
SET "latitude" = sub."lat", "longitude" = sub."lng"
FROM (
  SELECT j."B" AS "entrance_id",
         AVG(b."latitude") AS "lat",
         AVG(b."longitude") AS "lng"
  FROM "_BuildingToBuildingEntrance" AS j
  JOIN "Building" AS b ON b."id" = j."A"
  WHERE b."latitude" IS NOT NULL AND b."longitude" IS NOT NULL
  GROUP BY j."B"
) AS sub
WHERE e."id" = sub."entrance_id";
