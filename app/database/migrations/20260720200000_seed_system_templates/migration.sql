-- Guarantees the day-off and freeform system templates exist for every
-- congregation. `20260720100000_drop_event_kind` assumed they'd already be
-- seeded through `prisma db seed`, but production deploys run
-- `prisma migrate deploy` only, so pre-existing congregations landed
-- with no system templates — and every legacy day-off / freeform event
-- pointed at kindIds that no longer had a matching template ended up
-- with templateId=NULL. Downstream queries filter on `template.key`, so
-- those events silently vanished from every UI.
--
-- This migration is idempotent — safe to re-run.

-- 1. Seed the day-off template per congregation, if missing.
INSERT INTO "ProgrammeTemplate"
  ("name", "key", "color", "description", "weekDay", "isRecurring",
   "startTime", "endTime", "congregationId", "createdAt", "updatedAt")
SELECT 'Absence', 'day-off', '#cfcfcf', '', NULL, false,
       '00:00', '23:59', c."id", NOW(), NOW()
FROM "Congregation" c
ON CONFLICT ("key", "congregationId") DO NOTHING;

-- 2. Seed the freeform template per congregation, if missing.
INSERT INTO "ProgrammeTemplate"
  ("name", "key", "color", "description", "weekDay", "isRecurring",
   "startTime", "endTime", "congregationId", "createdAt", "updatedAt")
SELECT 'Autre événement', 'freeform', '#6366f1', '', NULL, false,
       '19:00', '21:00', c."id", NOW(), NOW()
FROM "Congregation" c
ON CONFLICT ("key", "congregationId") DO NOTHING;

-- 3. Any Event with templateId=NULL is rescued now that the freeform
--    template is guaranteed to exist. We can't tell which orphaned rows
--    were originally day-offs vs. freeform-like, so route them all to
--    freeform — the safest default. Legitimate day-offs created after
--    this migration go through createDayOff which throws on missing
--    template, so this class of orphan can't recur.
UPDATE "Event" e
SET "templateId" = t."id"
FROM "ProgrammeTemplate" t
WHERE t."key" = 'freeform'
  AND t."congregationId" = e."congregationId"
  AND e."templateId" IS NULL;
