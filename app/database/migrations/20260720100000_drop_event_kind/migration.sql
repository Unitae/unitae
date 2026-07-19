-- Drops the EventKind table and its FKs on Event / ProgrammeTemplate.
--
-- Before dropping the columns, we make sure every legacy event still has a
-- templateId — routing them through the day-off template (for old `off` kinds)
-- or the freeform template (for anything else). Templates that had a colour
-- through a custom kind link have already been backfilled by migration
-- 20260720000000_add_color_to_programme_template.
--
-- For any custom EventKind whose key doesn't already exist as a template in
-- the same congregation, we create a placeholder template (no parts, no
-- service roles) so events referencing that kind can be re-linked without
-- losing their identity.

-- 1. Create a template row per legacy custom kind (skip 'off' — day-off is
--    seeded separately). Match on (key, congregationId) to avoid collisions
--    with pre-existing templates carrying the same key.
INSERT INTO "ProgrammeTemplate"
  ("name", "key", "color", "description", "weekDay", "isRecurring",
   "startTime", "endTime", "congregationId", "createdAt", "updatedAt")
SELECT k."name", k."key", k."color", '', NULL, false,
       '19:00', '21:00', k."congregationId", NOW(), NOW()
FROM "EventKind" k
WHERE k."key" <> 'off'
  AND NOT EXISTS (
    SELECT 1 FROM "ProgrammeTemplate" t
    WHERE t."key" = k."key" AND t."congregationId" = k."congregationId"
  );

-- 2. Backfill Event.templateId from Event.kindId where the template is null.
--    Route 'off' events to the seeded `day-off` template; everything else
--    matches on the shared (key, congregationId).
UPDATE "Event" e
SET "templateId" = t."id"
FROM "EventKind" k
JOIN "ProgrammeTemplate" t
  ON t."key" = 'day-off' AND t."congregationId" = k."congregationId"
WHERE e."kindId" = k."id"
  AND k."key" = 'off'
  AND e."templateId" IS NULL;

UPDATE "Event" e
SET "templateId" = t."id"
FROM "EventKind" k
JOIN "ProgrammeTemplate" t
  ON t."key" = k."key" AND t."congregationId" = k."congregationId"
WHERE e."kindId" = k."id"
  AND k."key" <> 'off'
  AND e."templateId" IS NULL;

-- 3. Defensive: any remaining templateless event lands on the freeform
--    template. Should be zero rows if steps 1+2 covered every kindId.
UPDATE "Event" e
SET "templateId" = t."id"
FROM "ProgrammeTemplate" t
WHERE t."key" = 'freeform'
  AND t."congregationId" = e."congregationId"
  AND e."templateId" IS NULL;

-- 4. Drop foreign keys and columns.
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_kindId_fkey";
ALTER TABLE "Event" DROP COLUMN "kindId";

ALTER TABLE "ProgrammeTemplate" DROP CONSTRAINT IF EXISTS "ProgrammeTemplate_kindId_fkey";
ALTER TABLE "ProgrammeTemplate" DROP COLUMN "kindId";

-- 5. Drop the EventKind table entirely. RLS policies on the table go with it.
DROP TABLE "EventKind";
