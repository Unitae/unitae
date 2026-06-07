-- Add normalized search columns to Member and Building.
--
-- Search aids: lowercased, diacritic-stripped copies of free-text fields used
-- by territory/attribution/building filter forms. Maintained at write-time
-- (see app/shared/utils/strip-diacritics.ts) so runtime queries can stay in
-- pure Prisma `contains` without needing the `unaccent` extension or raw SQL.
--
-- Pre-existing rows are backfilled in step 2 using Postgres `translate()`
-- with an explicit character map covering every Latin-1 / Latin-Extended
-- diacritic likely to appear in French names and addresses. Avoids the
-- `unaccent` extension entirely — managed Postgres hosts often refuse
-- `CREATE EXTENSION` outside the bootstrap role, and we want
-- `prisma migrate deploy` to run cleanly under the standard app role.

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
--
-- Mirrors `stripDiacritics()` for every char in the map. The `from` and
-- `to` strings must stay the same length; if a new diacritic needs covering
-- later, append matching codepoints to both. Idempotent — the WHERE guard
-- only touches rows with the empty-string default.
-- =========================================================================

UPDATE "Member"
SET
  "firstnameNormalized" = translate(lower("firstname"),
    'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ',
    'aaaaaaceeeeiiiinooooooouuuuyy'),
  "lastnameNormalized"  = translate(lower("lastname"),
    'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ',
    'aaaaaaceeeeiiiinooooooouuuuyy')
WHERE "firstnameNormalized" = '' OR "lastnameNormalized" = '';

UPDATE "Building"
SET "streetNormalized" = translate(lower("street"),
  'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ',
  'aaaaaaceeeeiiiinooooooouuuuyy')
WHERE "streetNormalized" = '';

-- =========================================================================
-- 3. Indexes scoped by congregation for fast filter queries
-- =========================================================================

CREATE INDEX "Member_congregationId_firstnameNormalized_idx"
  ON "Member" ("congregationId", "firstnameNormalized");

CREATE INDEX "Member_congregationId_lastnameNormalized_idx"
  ON "Member" ("congregationId", "lastnameNormalized");

CREATE INDEX "Building_congregationId_streetNormalized_idx"
  ON "Building" ("congregationId", "streetNormalized");
