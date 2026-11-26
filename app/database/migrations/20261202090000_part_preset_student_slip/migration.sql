-- A part's kind says whether its student gets an S-89 slip. No change for the three seeded student kinds, which offer
-- it from now on; every other kind, seeded or the congregation's own, starts without it and can be switched on.

-- 1. The option, off by default.
ALTER TABLE "PartPreset" ADD COLUMN IF NOT EXISTS "printsStudentSlip" BOOLEAN NOT NULL DEFAULT false;

-- 2. On for the seeded student kinds: the Bible reading, the demonstration and the student talk.
UPDATE "PartPreset"
SET "printsStudentSlip" = true
WHERE "isSystem" = true
  AND "key" IN ('bible-reading', 'school-demonstration', 'school-talk')
  AND "printsStudentSlip" = false;
