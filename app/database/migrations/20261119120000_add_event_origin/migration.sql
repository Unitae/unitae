-- Who created an event: the recurring-events job (« job »), a person (« manual ») or a restore (« import »). Until now
-- an event without an author stood for one the job made, but deleting an account clears the author of what it
-- created, and a hand-made event must never become an empty meeting a template moves or deletes. No change in what
-- anyone may do.
--
-- 1. The column. The previous image creates events with the default during the rollout; its empty meetings are given
--    « job » by a second run of step 2 in a later migration.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_origin_check";
ALTER TABLE "Event" ADD CONSTRAINT "Event_origin_check" CHECK ("origin" IN ('job', 'manual', 'import'));

-- 2. The job's events: no author, no part, no service, no attendance — exactly what an empty meeting was until now.
UPDATE "Event" AS event
SET "origin" = 'job'
WHERE event."createdById" IS NULL
  AND event."origin" = 'manual'
  AND NOT EXISTS (SELECT 1 FROM "EventPart" part WHERE part."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "EventServicePart" service WHERE service."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "Attendance" attendance WHERE attendance."eventId" = event."id");
