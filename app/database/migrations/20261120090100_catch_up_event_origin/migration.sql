-- The empty meetings the previous image created while 20261119120000_add_event_origin rolled out get their origin.
-- Contract: no event someone made or touched changes.
--
-- That migration gave « job » to the empty meetings that existed, but the running image kept serving until the new one
-- rolled out, and its recurring-events job wrote the column's default, « manual »: those meetings stopped moving with
-- their template. Its backfill cannot simply run again: since then, deleting an account clears the author of what it
-- made, and a hand-made event left without an author looks the same.
--
-- Only events that are all of: no author, nothing on them (no part, no service, no attendance), of a template (the job
-- only creates those), still
-- « manual », created after that migration finished, and never written since (`updatedAt` within seconds of
-- `createdAt`) — clearing an author is a write, so a hand-made event whose account went keeps « manual ».
UPDATE "Event" AS event
SET "origin" = 'job'
WHERE event."origin" = 'manual'
  AND event."createdById" IS NULL
  AND event."templateId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "EventPart" part WHERE part."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "EventServicePart" service WHERE service."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "Attendance" attendance WHERE attendance."eventId" = event."id")
  -- max() over finished, not rolled-back rows: a migration that failed and was applied again leaves two rows. A
  -- database with none (baselined history) gets no repair rather than a guess.
  AND event."createdAt" >= (
    SELECT max(m."finished_at") FROM "_prisma_migrations" AS m
    WHERE m."migration_name" = '20261119120000_add_event_origin'
      AND m."finished_at" IS NOT NULL
      AND m."rolled_back_at" IS NULL
  )
  AND event."updatedAt" <= event."createdAt" + INTERVAL '5 seconds';
