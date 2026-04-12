-- AlterTable: Add publisher-facing notes to BuildingEntrance
ALTER TABLE "BuildingEntrance" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';

-- Data migration: Copy Building.importantNotes to the residential entrance
UPDATE "BuildingEntrance"
SET "notes" = b."importantNotes"
FROM "Building" b, "_BuildingToBuildingEntrance" jt
WHERE jt."A" = b."id"
  AND jt."B" = "BuildingEntrance"."id"
  AND "BuildingEntrance"."kind" = 'residential'
  AND b."importantNotes" != '';
