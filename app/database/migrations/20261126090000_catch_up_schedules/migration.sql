-- The read switch's catch-up (plan T7): add_schedules' data writes and add_items' backfill again, copied verbatim, so
-- what earlier images left without the new shape reaches the schedules and the items before the readers move to them:
-- the image before the schedules during their rollout, and what the next one cannot realign. Among others: schedule
-- templates of templates made or renamed meanwhile, a template applied to an event, a deleted template's schedule
-- templates, a responsible changed or lost with a deleted role (D31 falls back to the programme one; a role deleted
-- after this runs drifts again until PR 5, and nothing reads it before), items without their schedule, statuses, stray
-- or missing item mirrors. In the copied steps, « the previous image » is the one running when each was first written.
-- Re-runs as is; the migration test keeps both parts equal, statement for statement, to their source files.

-- Part one: add_schedules, steps 2 to 9.

-- 2. A schedule template no template suggests any more goes: its template was deleted by the previous image (the
--    links cascade, the schedule templates do not). Its schedules keep their items and lose it (SetNull).
DELETE FROM "ScheduleTemplate" AS scheduleTemplate
WHERE NOT EXISTS (
  SELECT 1 FROM "EventKindScheduleTemplate" AS link WHERE link."scheduleTemplateId" = scheduleTemplate."id"
);

-- 3. Per template other than freeform, a programme schedule template when it has parts and a duty one when it has
--    services, both suggested by it, programme first. One that already has its schedule template of that kind is left
--    as it is: a re-run creates nothing twice. The ids are drawn first so that each new row is linked to its template
--    in the same statement.
WITH source AS (
  SELECT template."id" AS "templateId", template."name", template."congregationId",
         nextval(pg_get_serial_sequence('"ScheduleTemplate"', 'id')) AS "scheduleTemplateId"
  FROM "EventTemplate" AS template
  WHERE template."key" <> 'freeform'
    AND EXISTS (SELECT 1 FROM "TemplatePart" AS part WHERE part."templateId" = template."id")
    AND NOT EXISTS (
      SELECT 1 FROM "EventKindScheduleTemplate" AS link
      JOIN "ScheduleTemplate" AS scheduleTemplate ON scheduleTemplate."id" = link."scheduleTemplateId"
      WHERE link."eventKindId" = template."id" AND scheduleTemplate."kind" = 'programme'
    )
), created AS (
  INSERT INTO "ScheduleTemplate" ("id", "name", "key", "kind", "congregationId", "updatedAt")
  SELECT "scheduleTemplateId", "name", NULL, 'programme', "congregationId", CURRENT_TIMESTAMP FROM source
  RETURNING "id"
)
INSERT INTO "EventKindScheduleTemplate" ("eventKindId", "scheduleTemplateId", "order", "congregationId")
SELECT source."templateId", source."scheduleTemplateId", 0, source."congregationId"
FROM source JOIN created ON created."id" = source."scheduleTemplateId";

WITH source AS (
  SELECT template."id" AS "templateId", template."congregationId",
         nextval(pg_get_serial_sequence('"ScheduleTemplate"', 'id')) AS "scheduleTemplateId"
  FROM "EventTemplate" AS template
  WHERE template."key" <> 'freeform'
    AND EXISTS (SELECT 1 FROM "TemplateServicePart" AS service WHERE service."templateId" = template."id")
    AND NOT EXISTS (
      SELECT 1 FROM "EventKindScheduleTemplate" AS link
      JOIN "ScheduleTemplate" AS scheduleTemplate ON scheduleTemplate."id" = link."scheduleTemplateId"
      WHERE link."eventKindId" = template."id" AND scheduleTemplate."kind" = 'duty'
    )
), created AS (
  INSERT INTO "ScheduleTemplate" ("id", "name", "key", "kind", "congregationId", "updatedAt")
  SELECT "scheduleTemplateId", NULL, 'services', 'duty', "congregationId", CURRENT_TIMESTAMP FROM source
  RETURNING "id"
)
INSERT INTO "EventKindScheduleTemplate" ("eventKindId", "scheduleTemplateId", "order", "congregationId")
SELECT source."templateId", source."scheduleTemplateId", 1, source."congregationId"
FROM source JOIN created ON created."id" = source."scheduleTemplateId";

-- 4. Their responsible role, from the template's responsibles: the programme one for the programme; for the duties the
--    service one, else the programme one — never both (D31). A re-run brings a changed responsible across.
UPDATE "ScheduleTemplate" AS scheduleTemplate
SET "responsibleRoleId" = chosen."roleId", "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT link."scheduleTemplateId",
         CASE WHEN linked."kind" = 'programme' THEN programme."roleId"
              ELSE COALESCE(service."roleId", programme."roleId") END AS "roleId"
  FROM "EventKindScheduleTemplate" AS link
  JOIN "ScheduleTemplate" AS linked ON linked."id" = link."scheduleTemplateId"
  LEFT JOIN "TemplateResponsible" AS programme
    ON programme."templateId" = link."eventKindId" AND programme."scope" = 'programme'
  LEFT JOIN "TemplateResponsible" AS service
    ON service."templateId" = link."eventKindId" AND service."scope" = 'service'
) AS chosen
WHERE scheduleTemplate."id" = chosen."scheduleTemplateId"
  AND scheduleTemplate."responsibleRoleId" IS DISTINCT FROM chosen."roleId";

-- A programme schedule template carries its template's name: a re-run brings a rename across.
UPDATE "ScheduleTemplate" AS scheduleTemplate
SET "name" = template."name", "updatedAt" = CURRENT_TIMESTAMP
FROM "EventKindScheduleTemplate" AS link
JOIN "EventTemplate" AS template ON template."id" = link."eventKindId"
WHERE scheduleTemplate."id" = link."scheduleTemplateId" AND scheduleTemplate."kind" = 'programme'
  AND scheduleTemplate."name" IS DISTINCT FROM template."name";

-- 5. The template's items join its schedule template of their kind.
UPDATE "TemplatePart" AS part
SET "scheduleTemplateId" = link."scheduleTemplateId"
FROM "EventKindScheduleTemplate" AS link
JOIN "ScheduleTemplate" AS scheduleTemplate
  ON scheduleTemplate."id" = link."scheduleTemplateId" AND scheduleTemplate."kind" = 'programme'
WHERE link."eventKindId" = part."templateId" AND part."scheduleTemplateId" IS NULL;

UPDATE "TemplateServicePart" AS service
SET "scheduleTemplateId" = link."scheduleTemplateId"
FROM "EventKindScheduleTemplate" AS link
JOIN "ScheduleTemplate" AS scheduleTemplate
  ON scheduleTemplate."id" = link."scheduleTemplateId" AND scheduleTemplate."kind" = 'duty'
WHERE link."eventKindId" = service."templateId" AND service."scheduleTemplateId" IS NULL;

-- 6. An event's schedule follows its event's template: made from that template's schedule template of its kind, or from
--    none (with the catalogue's key) when it has none. A re-run brings across a template applied to the event.
UPDATE "Schedule" AS schedule
SET "scheduleTemplateId" = made."id", "name" = made."name", "key" = made."key", "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT existing."id" AS "scheduleId", target."id", target."name",
         CASE WHEN target."id" IS NOT NULL THEN target."key"
              WHEN existing."kind" = 'programme' THEN 'programme' ELSE 'services' END AS "key"
  FROM "Schedule" AS existing
  JOIN "Event" AS event ON event."id" = existing."eventId"
  LEFT JOIN LATERAL (
    SELECT scheduleTemplate."id", scheduleTemplate."name", scheduleTemplate."key"
    FROM "EventKindScheduleTemplate" AS link
    JOIN "ScheduleTemplate" AS scheduleTemplate
      ON scheduleTemplate."id" = link."scheduleTemplateId" AND scheduleTemplate."kind" = existing."kind"
    WHERE link."eventKindId" = event."templateId"
    ORDER BY link."order", scheduleTemplate."id"
    LIMIT 1
  ) AS target ON true
) AS made
WHERE schedule."id" = made."scheduleId" AND schedule."scheduleTemplateId" IS DISTINCT FROM made."id";

-- 7. Per event with parts, its programme schedule; per event with services, its duty schedule. Made from its template's
--    schedule template of that kind when there is one; the status is the event's. An event that already has one of
--    that kind keeps it: a re-run creates nothing twice. The items are what decides, not the template: an event with
--    parts gets its programme even when its template has none to make it from.
INSERT INTO "Schedule" ("eventId", "scheduleTemplateId", "name", "key", "kind", "order", "status", "congregationId", "updatedAt")
SELECT event."id", made."id", made."name", CASE WHEN made."id" IS NULL THEN 'programme' ELSE made."key" END,
       'programme', 0, CASE WHEN event."status" = 'released' THEN 'published' ELSE 'draft' END,
       event."congregationId", CURRENT_TIMESTAMP
FROM "Event" AS event
LEFT JOIN LATERAL (
  SELECT scheduleTemplate."id", scheduleTemplate."name", scheduleTemplate."key"
  FROM "EventKindScheduleTemplate" AS link
  JOIN "ScheduleTemplate" AS scheduleTemplate
    ON scheduleTemplate."id" = link."scheduleTemplateId" AND scheduleTemplate."kind" = 'programme'
  WHERE link."eventKindId" = event."templateId"
  ORDER BY link."order", scheduleTemplate."id"
  LIMIT 1
) AS made ON true
WHERE EXISTS (SELECT 1 FROM "EventPart" AS part WHERE part."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "Schedule" AS schedule WHERE schedule."eventId" = event."id" AND schedule."kind" = 'programme');

INSERT INTO "Schedule" ("eventId", "scheduleTemplateId", "name", "key", "kind", "order", "status", "congregationId", "updatedAt")
SELECT event."id", made."id", made."name", CASE WHEN made."id" IS NULL THEN 'services' ELSE made."key" END,
       'duty', 1, CASE WHEN event."status" = 'released' THEN 'published' ELSE 'draft' END,
       event."congregationId", CURRENT_TIMESTAMP
FROM "Event" AS event
LEFT JOIN LATERAL (
  SELECT scheduleTemplate."id", scheduleTemplate."name", scheduleTemplate."key"
  FROM "EventKindScheduleTemplate" AS link
  JOIN "ScheduleTemplate" AS scheduleTemplate
    ON scheduleTemplate."id" = link."scheduleTemplateId" AND scheduleTemplate."kind" = 'duty'
  WHERE link."eventKindId" = event."templateId"
  ORDER BY link."order", scheduleTemplate."id"
  LIMIT 1
) AS made ON true
WHERE EXISTS (SELECT 1 FROM "EventServicePart" AS service WHERE service."eventId" = event."id")
  AND NOT EXISTS (SELECT 1 FROM "Schedule" AS schedule WHERE schedule."eventId" = event."id" AND schedule."kind" = 'duty');

-- 8. The event's items join its schedule of their kind (the first duty schedule, while an event has only one).
UPDATE "EventPart" AS part
SET "scheduleId" = schedule."id"
FROM "Schedule" AS schedule
WHERE schedule."eventId" = part."eventId" AND schedule."kind" = 'programme' AND part."scheduleId" IS NULL;

UPDATE "EventServicePart" AS service
SET "scheduleId" = (
  SELECT schedule."id" FROM "Schedule" AS schedule
  WHERE schedule."eventId" = service."eventId" AND schedule."kind" = 'duty'
  ORDER BY schedule."order", schedule."id"
  LIMIT 1
)
WHERE service."scheduleId" IS NULL
  AND EXISTS (SELECT 1 FROM "Schedule" AS schedule WHERE schedule."eventId" = service."eventId" AND schedule."kind" = 'duty');

-- 9. Every schedule takes its event's status: the previous image's last word wins where they disagree.
UPDATE "Schedule" AS schedule
SET "status" = CASE WHEN event."status" = 'released' THEN 'published' ELSE 'draft' END, "updatedAt" = CURRENT_TIMESTAMP
FROM "Event" AS event
WHERE event."id" = schedule."eventId"
  AND schedule."status" <> CASE WHEN event."status" = 'released' THEN 'published' ELSE 'draft' END;

-- Part two: add_items, steps 5 to 8, once the schedules above are in place.

-- 5. Template items, from parts and services.
INSERT INTO "TemplateItem" ("name", "section", "track", "trackOrder", "order", "durationMin", "allowExternalSpeaker", "speakerLabel", "readerLabel", "templateId", "scheduleTemplateId", "presetId", "legacyPartId", "congregationId")
SELECT p."name", p."section", p."track", p."trackOrder", p."order", p."durationMin", p."allowExternalSpeaker", p."speakerLabel", p."readerLabel", p."templateId", p."scheduleTemplateId", p."presetId", p."id", p."congregationId"
FROM "TemplatePart" p
ON CONFLICT ("legacyPartId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "section" = EXCLUDED."section",
  "track" = EXCLUDED."track",
  "trackOrder" = EXCLUDED."trackOrder",
  "order" = EXCLUDED."order",
  "durationMin" = EXCLUDED."durationMin",
  "allowExternalSpeaker" = EXCLUDED."allowExternalSpeaker",
  "speakerLabel" = EXCLUDED."speakerLabel",
  "readerLabel" = EXCLUDED."readerLabel",
  "templateId" = EXCLUDED."templateId",
  "scheduleTemplateId" = EXCLUDED."scheduleTemplateId",
  "presetId" = EXCLUDED."presetId",

  "congregationId" = EXCLUDED."congregationId";

INSERT INTO "TemplateItem" ("name", "key", "order", "templateId", "scheduleTemplateId", "presetId", "legacyServiceId", "congregationId")
SELECT s."name", s."key", s."order", s."templateId", s."scheduleTemplateId", s."presetId", s."id", s."congregationId"
FROM "TemplateServicePart" s
ON CONFLICT ("legacyServiceId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "key" = EXCLUDED."key",
  "order" = EXCLUDED."order",
  "templateId" = EXCLUDED."templateId",
  "scheduleTemplateId" = EXCLUDED."scheduleTemplateId",
  "presetId" = EXCLUDED."presetId",

  "congregationId" = EXCLUDED."congregationId";

-- 6. Items, from event parts and services, pointing at the template item their row came from.
INSERT INTO "Item" ("name", "order", "topic", "note", "hasConflict", "section", "track", "trackOrder", "durationMin", "speakerLabel", "readerLabel", "eventId", "scheduleId", "templateItemId", "presetId", "assigneeId", "assistantId", "allowExternalSpeaker", "externalSpeakerId", "updatedAt", "createdAt", "legacyPartId", "congregationId")
SELECT p."name", p."order", p."topic", p."note", p."hasConflict", p."section", p."track", p."trackOrder", p."durationMin", p."speakerLabel", p."readerLabel", p."eventId", p."scheduleId", ti."id", p."presetId", p."assigneeId", p."assistantId", p."allowExternalSpeaker", p."externalSpeakerId", p."updatedAt", p."createdAt", p."id", p."congregationId"
FROM "EventPart" p
LEFT JOIN "TemplateItem" ti ON ti."legacyPartId" = p."partId"
ON CONFLICT ("legacyPartId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "order" = EXCLUDED."order",
  "topic" = EXCLUDED."topic",
  "note" = EXCLUDED."note",
  "hasConflict" = EXCLUDED."hasConflict",
  "section" = EXCLUDED."section",
  "track" = EXCLUDED."track",
  "trackOrder" = EXCLUDED."trackOrder",
  "durationMin" = EXCLUDED."durationMin",
  "speakerLabel" = EXCLUDED."speakerLabel",
  "readerLabel" = EXCLUDED."readerLabel",
  "eventId" = EXCLUDED."eventId",
  "scheduleId" = EXCLUDED."scheduleId",
  "templateItemId" = EXCLUDED."templateItemId",
  "presetId" = EXCLUDED."presetId",
  "assigneeId" = EXCLUDED."assigneeId",
  "assistantId" = EXCLUDED."assistantId",
  "allowExternalSpeaker" = EXCLUDED."allowExternalSpeaker",
  "externalSpeakerId" = EXCLUDED."externalSpeakerId",
  "updatedAt" = EXCLUDED."updatedAt",

  "congregationId" = EXCLUDED."congregationId";

INSERT INTO "Item" ("name", "order", "note", "hasConflict", "eventId", "scheduleId", "templateItemId", "presetId", "assigneeId", "updatedAt", "createdAt", "legacyServiceId", "congregationId")
SELECT s."name", s."order", s."note", s."hasConflict", s."eventId", s."scheduleId", ti."id", s."presetId", s."assigneeId", s."updatedAt", s."createdAt", s."id", s."congregationId"
FROM "EventServicePart" s
LEFT JOIN "TemplateItem" ti ON ti."legacyServiceId" = s."servicePartId"
ON CONFLICT ("legacyServiceId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "order" = EXCLUDED."order",
  "note" = EXCLUDED."note",
  "hasConflict" = EXCLUDED."hasConflict",
  "eventId" = EXCLUDED."eventId",
  "scheduleId" = EXCLUDED."scheduleId",
  "templateItemId" = EXCLUDED."templateItemId",
  "presetId" = EXCLUDED."presetId",
  "assigneeId" = EXCLUDED."assigneeId",
  "updatedAt" = EXCLUDED."updatedAt",

  "congregationId" = EXCLUDED."congregationId";

-- 7. Allowed roles: a part's speaker is the main slot, its reader the second; a service's single list is the main slot.
INSERT INTO "TemplateItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
SELECT ti."id", r."roleId", "item_slot"(r."asKind"), r."congregationId"
FROM "TemplatePartAllowedRole" r
JOIN "TemplateItem" ti ON ti."legacyPartId" = r."partId"
ON CONFLICT DO NOTHING;

INSERT INTO "TemplateItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
SELECT ti."id", r."roleId", 'main', r."congregationId"
FROM "TemplateServicePartAllowedRole" r
JOIN "TemplateItem" ti ON ti."legacyServiceId" = r."servicePartId"
ON CONFLICT DO NOTHING;

INSERT INTO "ItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
SELECT i."id", r."roleId", "item_slot"(r."asKind"), r."congregationId"
FROM "EventPartAllowedRole" r
JOIN "Item" i ON i."legacyPartId" = r."eventPartId"
ON CONFLICT DO NOTHING;

INSERT INTO "ItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
SELECT i."id", r."roleId", 'main', r."congregationId"
FROM "EventServicePartAllowedRole" r
JOIN "Item" i ON i."legacyServiceId" = r."eventServicePartId"
ON CONFLICT DO NOTHING;

-- 8. What has no old row any more, had a write ever reached the old tables without its trigger: allowed roles first,
--    then items. A row with no legacy key at all is left alone.
DELETE FROM "TemplateItemAllowedRole" r
USING "TemplateItem" ti
WHERE ti."id" = r."itemId" AND ti."legacyPartId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TemplatePartAllowedRole" o
    WHERE o."partId" = ti."legacyPartId" AND o."roleId" = r."roleId" AND "item_slot"(o."asKind") = r."slot"
  );

DELETE FROM "TemplateItemAllowedRole" r
USING "TemplateItem" ti
WHERE ti."id" = r."itemId" AND ti."legacyServiceId" IS NOT NULL
  AND NOT (r."slot" = 'main' AND EXISTS (
    SELECT 1 FROM "TemplateServicePartAllowedRole" o
    WHERE o."servicePartId" = ti."legacyServiceId" AND o."roleId" = r."roleId"
  ));

DELETE FROM "ItemAllowedRole" r
USING "Item" i
WHERE i."id" = r."itemId" AND i."legacyPartId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EventPartAllowedRole" o
    WHERE o."eventPartId" = i."legacyPartId" AND o."roleId" = r."roleId" AND "item_slot"(o."asKind") = r."slot"
  );

DELETE FROM "ItemAllowedRole" r
USING "Item" i
WHERE i."id" = r."itemId" AND i."legacyServiceId" IS NOT NULL
  AND NOT (r."slot" = 'main' AND EXISTS (
    SELECT 1 FROM "EventServicePartAllowedRole" o
    WHERE o."eventServicePartId" = i."legacyServiceId" AND o."roleId" = r."roleId"
  ));

DELETE FROM "Item" i
WHERE i."legacyPartId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "EventPart" p WHERE p."id" = i."legacyPartId");

DELETE FROM "Item" i
WHERE i."legacyServiceId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "EventServicePart" s WHERE s."id" = i."legacyServiceId");

DELETE FROM "TemplateItem" ti
WHERE ti."legacyPartId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TemplatePart" p WHERE p."id" = ti."legacyPartId");

DELETE FROM "TemplateItem" ti
WHERE ti."legacyServiceId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "TemplateServicePart" s WHERE s."id" = ti."legacyServiceId");
