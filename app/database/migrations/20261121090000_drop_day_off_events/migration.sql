-- Absences, contract: the day-off events and their « day-off » templates go. Every reader takes absences from the
-- Absence table, and the version serving while this runs writes an absence as its row alone once the template is gone.
-- No absence is lost: what only an event still carries is copied first.

-- 1. Copy the day-off events that have no Absence row yet — written by an older version during a rollout — as
--    20261120090000_add_absences did: their dates and note, the account that declared them, that account's record when
--    it has one. The join skips a day-off without its account (it would break the CHECK), which step 2 then deletes; no
--    path leaves one. Idempotent.
INSERT INTO "Absence" ("startDate", "endDate", "note", "memberId", "accountId", "legacyEventId", "createdAt", "congregationId")
SELECT event."startDate", event."endDate", event."description", account."memberId", event."createdById", event."id",
       event."createdAt", event."congregationId"
FROM "Event" AS event
JOIN "EventTemplate" AS template
  ON template."id" = event."templateId" AND template."congregationId" = event."congregationId" AND template."key" = 'day-off'
JOIN "UserAccount" AS account ON account."id" = event."createdById"
ON CONFLICT ("legacyEventId") DO NOTHING;

-- Not done: deleting the Absence rows whose event is missing. That would also erase the absences kept on a record after
-- their login was deleted, and, once step 2 has run, every row whose event it deleted. So every row stays; the cost is
-- that an absence an older version cancelled by deleting the event alone comes back, and its person can cancel it.

-- 2. Delete the day-off events. No path puts a part, a service or attendance on one; one that has any is left as it
--    is, with its template, rather than taking them with it.
DELETE FROM "Event" AS event
USING "EventTemplate" AS template
WHERE template."id" = event."templateId" AND template."congregationId" = event."congregationId"
  AND template."key" = 'day-off'
  AND NOT EXISTS (SELECT 1 FROM "EventPart" AS part WHERE part."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "EventServicePart" AS service WHERE service."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "Attendance" AS attendance WHERE attendance."eventId" = event."id");

-- 3. Delete the « day-off » templates no event uses any more.
DELETE FROM "EventTemplate" AS template
WHERE template."key" = 'day-off'
  AND NOT EXISTS (SELECT 1 FROM "Event" AS event WHERE event."templateId" = template."id");
