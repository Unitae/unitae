-- Add normalized search columns to Member and Building.
--
-- Search aids: lowercased, diacritic-stripped copies of free-text fields used
-- by territory/attribution/building filter forms. Maintained at write-time
-- (see app/shared/utils/strip-diacritics.ts) so runtime queries can stay in
-- pure Prisma `contains` without needing the `unaccent` extension or raw SQL.
--
-- The `unaccent` extension is enabled here ONLY for the backfill UPDATE, then
-- dropped — keeping the runtime DB role's privilege footprint unchanged.

-- =========================================================================
-- 1. Add columns with safe defaults
-- =========================================================================

ALTER TABLE "Member"
  ADD COLUMN "firstnameNormalized" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastnameNormalized"  TEXT NOT NULL DEFAULT '';

ALTER TABLE "Building"
  ADD COLUMN "streetNormalized" TEXT NOT NULL DEFAULT '';

-- =========================================================================
-- 2. Backfill existing rows
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

UPDATE "Member"
SET "firstnameNormalized" = lower(unaccent("firstname")),
    "lastnameNormalized"  = lower(unaccent("lastname"));

UPDATE "Building"
SET "streetNormalized" = lower(unaccent("street"));

DROP EXTENSION IF EXISTS unaccent;

-- =========================================================================
-- 3. Indexes scoped by congregation for fast filter queries
-- =========================================================================

CREATE INDEX "Member_congregationId_firstnameNormalized_idx"
  ON "Member" ("congregationId", "firstnameNormalized");

CREATE INDEX "Member_congregationId_lastnameNormalized_idx"
  ON "Member" ("congregationId", "lastnameNormalized");

CREATE INDEX "Building_congregationId_streetNormalized_idx"
  ON "Building" ("congregationId", "streetNormalized");
