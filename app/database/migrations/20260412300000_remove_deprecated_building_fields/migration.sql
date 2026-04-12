-- AlterTable: Remove deprecated building-level fields
-- These fields have been migrated to BuildingEntrance (kind, shopKind)
-- and BuildingResidentialData (homes, phones, liberals)
ALTER TABLE "Building" DROP COLUMN "homes",
DROP COLUMN "phones",
DROP COLUMN "liberals",
DROP COLUMN "hasShops",
DROP COLUMN "shopKind",
DROP COLUMN "hasCampus",
DROP COLUMN "hasHotel",
DROP COLUMN "hasLandromat";
