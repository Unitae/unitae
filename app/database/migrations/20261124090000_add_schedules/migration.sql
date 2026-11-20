-- Events get schedules: a programme (at most one per event) and duty schedules, each made from a schedule template that
-- names its responsible role. No change in what anyone sees or may do: every reader still reads the items through their
-- event, the status on the event and the responsibles on the template, and the new image writes both shapes until the
-- readers move over.
--
-- During the rollout the previous image keeps serving: it writes items without a schedule and statuses on events only.
-- The next release's migration runs this backfill again for what it wrote (it is idempotent: a re-run reuses what
-- exists, and the event's status wins where the two disagree).
--
-- No language is stored: a programme schedule template takes its template's name, which the congregation wrote; a duty
-- one has no name and the key 'services', which the catalogue names. A schedule copies its template's name and key, or
-- has none and the key 'programme' or 'services' when its event's template has no schedule template of that kind (a
-- freeform event with parts of its own, a service added to an event whose template has none).
--
-- 1. The tables, their CHECKs and the standard tenant policy; the items' new columns.
CREATE TABLE IF NOT EXISTS "ScheduleTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "key" TEXT,
    "kind" TEXT NOT NULL,
    "responsibleRoleId" INTEGER,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventKindScheduleTemplate" (
    "id" SERIAL NOT NULL,
    "eventKindId" INTEGER NOT NULL,
    "scheduleTemplateId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "EventKindScheduleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Schedule" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "scheduleTemplateId" INTEGER,
    "name" TEXT,
    "key" TEXT,
    "kind" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScheduleTemplate" DROP CONSTRAINT IF EXISTS "ScheduleTemplate_kind_check";
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_kind_check" CHECK ("kind" IN ('programme', 'duty'));
ALTER TABLE "Schedule" DROP CONSTRAINT IF EXISTS "Schedule_kind_check";
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_kind_check" CHECK ("kind" IN ('programme', 'duty'));
ALTER TABLE "Schedule" DROP CONSTRAINT IF EXISTS "Schedule_status_check";
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_status_check" CHECK ("status" IN ('draft', 'published'));

ALTER TABLE "EventPart" ADD COLUMN IF NOT EXISTS "scheduleId" INTEGER;
ALTER TABLE "EventServicePart" ADD COLUMN IF NOT EXISTS "scheduleId" INTEGER;
ALTER TABLE "TemplatePart" ADD COLUMN IF NOT EXISTS "scheduleTemplateId" INTEGER;
ALTER TABLE "TemplateServicePart" ADD COLUMN IF NOT EXISTS "scheduleTemplateId" INTEGER;

CREATE INDEX IF NOT EXISTS "ScheduleTemplate_congregationId_idx" ON "ScheduleTemplate"("congregationId");
CREATE INDEX IF NOT EXISTS "ScheduleTemplate_responsibleRoleId_idx" ON "ScheduleTemplate"("responsibleRoleId");
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleTemplate_id_congregationId_key" ON "ScheduleTemplate"("id", "congregationId");
CREATE INDEX IF NOT EXISTS "EventKindScheduleTemplate_scheduleTemplateId_idx" ON "EventKindScheduleTemplate"("scheduleTemplateId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventKindScheduleTemplate_eventKindId_scheduleTemplateId_key" ON "EventKindScheduleTemplate"("eventKindId", "scheduleTemplateId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventKindScheduleTemplate_id_congregationId_key" ON "EventKindScheduleTemplate"("id", "congregationId");
CREATE INDEX IF NOT EXISTS "Schedule_eventId_idx" ON "Schedule"("eventId");
CREATE INDEX IF NOT EXISTS "Schedule_scheduleTemplateId_idx" ON "Schedule"("scheduleTemplateId");
CREATE UNIQUE INDEX IF NOT EXISTS "Schedule_id_eventId_key" ON "Schedule"("id", "eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "Schedule_id_congregationId_key" ON "Schedule"("id", "congregationId");
-- At most one programme per event (D9).
CREATE UNIQUE INDEX IF NOT EXISTS "Schedule_programme_eventId_key" ON "Schedule"("eventId") WHERE (kind = 'programme');
CREATE INDEX IF NOT EXISTS "EventPart_scheduleId_idx" ON "EventPart"("scheduleId");
CREATE INDEX IF NOT EXISTS "EventServicePart_scheduleId_idx" ON "EventServicePart"("scheduleId");
CREATE INDEX IF NOT EXISTS "TemplatePart_scheduleTemplateId_idx" ON "TemplatePart"("scheduleTemplateId");
CREATE INDEX IF NOT EXISTS "TemplateServicePart_scheduleTemplateId_idx" ON "TemplateServicePart"("scheduleTemplateId");

ALTER TABLE "TemplatePart" DROP CONSTRAINT IF EXISTS "TemplatePart_scheduleTemplateId_fkey";
ALTER TABLE "TemplatePart" ADD CONSTRAINT "TemplatePart_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TemplateServicePart" DROP CONSTRAINT IF EXISTS "TemplateServicePart_scheduleTemplateId_fkey";
ALTER TABLE "TemplateServicePart" ADD CONSTRAINT "TemplateServicePart_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Through (scheduleId, eventId): an item's schedule is always one of its own event's.
ALTER TABLE "EventPart" DROP CONSTRAINT IF EXISTS "EventPart_scheduleId_eventId_fkey";
ALTER TABLE "EventPart" ADD CONSTRAINT "EventPart_scheduleId_eventId_fkey" FOREIGN KEY ("scheduleId", "eventId") REFERENCES "Schedule"("id", "eventId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventServicePart" DROP CONSTRAINT IF EXISTS "EventServicePart_scheduleId_eventId_fkey";
ALTER TABLE "EventServicePart" ADD CONSTRAINT "EventServicePart_scheduleId_eventId_fkey" FOREIGN KEY ("scheduleId", "eventId") REFERENCES "Schedule"("id", "eventId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleTemplate" DROP CONSTRAINT IF EXISTS "ScheduleTemplate_responsibleRoleId_fkey";
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_responsibleRoleId_fkey" FOREIGN KEY ("responsibleRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleTemplate" DROP CONSTRAINT IF EXISTS "ScheduleTemplate_congregationId_fkey";
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventKindScheduleTemplate" DROP CONSTRAINT IF EXISTS "EventKindScheduleTemplate_eventKindId_fkey";
ALTER TABLE "EventKindScheduleTemplate" ADD CONSTRAINT "EventKindScheduleTemplate_eventKindId_fkey" FOREIGN KEY ("eventKindId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventKindScheduleTemplate" DROP CONSTRAINT IF EXISTS "EventKindScheduleTemplate_scheduleTemplateId_fkey";
ALTER TABLE "EventKindScheduleTemplate" ADD CONSTRAINT "EventKindScheduleTemplate_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventKindScheduleTemplate" DROP CONSTRAINT IF EXISTS "EventKindScheduleTemplate_congregationId_fkey";
ALTER TABLE "EventKindScheduleTemplate" ADD CONSTRAINT "EventKindScheduleTemplate_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" DROP CONSTRAINT IF EXISTS "Schedule_eventId_fkey";
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" DROP CONSTRAINT IF EXISTS "Schedule_scheduleTemplateId_fkey";
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Schedule" DROP CONSTRAINT IF EXISTS "Schedule_congregationId_fkey";
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduleTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ScheduleTemplate";
CREATE POLICY tenant_isolation ON "ScheduleTemplate" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "EventKindScheduleTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventKindScheduleTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EventKindScheduleTemplate";
CREATE POLICY tenant_isolation ON "EventKindScheduleTemplate" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "Schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Schedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Schedule";
CREATE POLICY tenant_isolation ON "Schedule" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- 2. Per template other than freeform, a programme schedule template when it has parts and a duty one when it has
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

-- 3. Their responsible role, from the template's responsibles: the programme one for the programme; for the duties the
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

-- 4. The template's items join its schedule template of their kind.
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

-- 5. Per event with parts, its programme schedule; per event with services, its duty schedule. Made from its template's
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

-- 6. The event's items join its schedule of their kind (the first duty schedule, while an event has only one).
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

-- 7. Every schedule takes its event's status: the previous image's last word wins where they disagree.
UPDATE "Schedule" AS schedule
SET "status" = CASE WHEN event."status" = 'released' THEN 'published' ELSE 'draft' END, "updatedAt" = CURRENT_TIMESTAMP
FROM "Event" AS event
WHERE event."id" = schedule."eventId"
  AND schedule."status" <> CASE WHEN event."status" = 'released' THEN 'published' ELSE 'draft' END;
