-- Absences, contract: the day-off events and their « day-off » templates go. Every reader takes absences from the
-- Absence table, and the version this migration runs under writes an absence as its row alone once the template is
-- gone. No absence is lost: what only an event still carries is copied first.

-- 1. Copy the day-off events that have no Absence row yet — written by an older version during a rollout — as the
--    first backfill did: their dates and note, the account that declared them, that account's record when it has one.
--    A day-off without its account would break the CHECK; no path leaves one. Idempotent.
INSERT INTO "Absence" ("startDate", "endDate", "note", "memberId", "accountId", "legacyEventId", "createdAt", "congregationId")
SELECT event."startDate", event."endDate", event."description", account."memberId", event."createdById", event."id",
       event."createdAt", event."congregationId"
FROM "Event" AS event
JOIN "EventTemplate" AS template
  ON template."id" = event."templateId" AND template."congregationId" = event."congregationId" AND template."key" = 'day-off'
JOIN "UserAccount" AS account ON account."id" = event."createdById"
ON CONFLICT ("legacyEventId") DO NOTHING;

--    Every Absence row stays, whether its event is still there or not. One whose absence an older version cancelled by
--    deleting the event alone comes back, and its person can cancel it again; no rule tells it from an absence kept on
--    its record after its login was deleted, or from one whose event this migration deletes below (run again, as the
--    next contract step does, a rule on missing events would drop them all).

-- 2. Delete the day-off events. No path puts a part, a service or attendance on one; one that has any is left as it
--    is, with its template, rather than taking them with it.
DELETE FROM "Event" AS event
USING "EventTemplate" AS template
WHERE template."id" = event."templateId" AND template."key" = 'day-off'
  AND NOT EXISTS (SELECT 1 FROM "EventPart" AS part WHERE part."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "EventServicePart" AS service WHERE service."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "Attendance" AS attendance WHERE attendance."eventId" = event."id");

-- 3. Delete the « day-off » templates no event uses any more.
DELETE FROM "EventTemplate" AS template
WHERE template."key" = 'day-off'
  AND NOT EXISTS (SELECT 1 FROM "Event" AS event WHERE event."templateId" = template."id");
