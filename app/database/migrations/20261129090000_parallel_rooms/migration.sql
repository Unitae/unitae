-- Parallel rooms, expand step (docs/development/specs/parallel-rooms.md, phase R1). No change in what anyone sees: every
-- programme schedule template and programme schedule gets its rooms, every template part and meeting part its room
-- row, from today's `track` copies, and triggers keep them in step while today's code goes on writing copies.
--
-- 1. The four tables.
-- 2. Their tenant isolation.
-- 3. The room helpers: a container's main room (`key = 'main'`, no name until someone gives one: the app reads
--    « Salle principale » in the reader's language), and the room a `track` names.
-- 4. The backfill: rooms in the order their tracks first appear (`trackOrder`, then the oldest part), the first one
--    the main room; one room row per template part and per meeting part.
-- 5. The triggers, written so the code already deployed never fails on them: a room missing is created.

-- CreateTable
CREATE TABLE "ScheduleTemplateRoom" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "key" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "scheduleTemplateId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTemplateRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleRoom" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "key" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "scheduleId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplatePartRoom" (
    "templatePartId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "TemplatePartRoom_pkey" PRIMARY KEY ("templatePartId","roomId")
);

-- CreateTable
CREATE TABLE "ItemRoom" (
    "id" SERIAL NOT NULL,
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "itemId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "assistantId" INTEGER,
    "externalSpeakerId" INTEGER,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleTemplateRoom_scheduleTemplateId_idx" ON "ScheduleTemplateRoom"("scheduleTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTemplateRoom_id_congregationId_key" ON "ScheduleTemplateRoom"("id", "congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTemplateRoom_scheduleTemplateId_key_key" ON "ScheduleTemplateRoom"("scheduleTemplateId", "key");

-- CreateIndex
CREATE INDEX "ScheduleRoom_scheduleId_idx" ON "ScheduleRoom"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRoom_id_congregationId_key" ON "ScheduleRoom"("id", "congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRoom_scheduleId_key_key" ON "ScheduleRoom"("scheduleId", "key");

-- CreateIndex
CREATE INDEX "TemplatePartRoom_roomId_idx" ON "TemplatePartRoom"("roomId");

-- CreateIndex
CREATE INDEX "ItemRoom_roomId_idx" ON "ItemRoom"("roomId");

-- CreateIndex
CREATE INDEX "ItemRoom_assigneeId_idx" ON "ItemRoom"("assigneeId");

-- CreateIndex
CREATE INDEX "ItemRoom_assistantId_idx" ON "ItemRoom"("assistantId");

-- CreateIndex
CREATE INDEX "ItemRoom_externalSpeakerId_idx" ON "ItemRoom"("externalSpeakerId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemRoom_id_congregationId_key" ON "ItemRoom"("id", "congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemRoom_itemId_roomId_key" ON "ItemRoom"("itemId", "roomId");

-- AddForeignKey
ALTER TABLE "ScheduleTemplateRoom" ADD CONSTRAINT "ScheduleTemplateRoom_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplateRoom" ADD CONSTRAINT "ScheduleTemplateRoom_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRoom" ADD CONSTRAINT "ScheduleRoom_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRoom" ADD CONSTRAINT "ScheduleRoom_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePartRoom" ADD CONSTRAINT "TemplatePartRoom_templatePartId_fkey" FOREIGN KEY ("templatePartId") REFERENCES "TemplatePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePartRoom" ADD CONSTRAINT "TemplatePartRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ScheduleTemplateRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePartRoom" ADD CONSTRAINT "TemplatePartRoom_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRoom" ADD CONSTRAINT "ItemRoom_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRoom" ADD CONSTRAINT "ItemRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ScheduleRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRoom" ADD CONSTRAINT "ItemRoom_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRoom" ADD CONSTRAINT "ItemRoom_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRoom" ADD CONSTRAINT "ItemRoom_externalSpeakerId_fkey" FOREIGN KEY ("externalSpeakerId") REFERENCES "ExternalSpeaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRoom" ADD CONSTRAINT "ItemRoom_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 2. Tenant isolation, as every congregation table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ScheduleTemplateRoom', 'ScheduleRoom', 'TemplatePartRoom', 'ItemRoom'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I FOR ALL
      USING (
        CASE
          WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
          ELSE "congregationId" = current_setting('app.congregation_id', true)::int
        END
      )$p$, t);
  END LOOP;
END
$$;

-- 3. The room helpers.
CREATE OR REPLACE FUNCTION "schedule_template_main_room"(template_id int, congregation_id int) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE room_id int;
BEGIN
  INSERT INTO "ScheduleTemplateRoom" ("key", "order", "scheduleTemplateId", "congregationId", "updatedAt")
    VALUES ('main', 0, template_id, congregation_id, CURRENT_TIMESTAMP)
    ON CONFLICT ("scheduleTemplateId", "key") DO NOTHING;
  SELECT "id" INTO room_id FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id AND "key" = 'main';
  RETURN room_id;
END
$$;

CREATE OR REPLACE FUNCTION "schedule_main_room"(schedule_id int, congregation_id int) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE room_id int;
BEGIN
  INSERT INTO "ScheduleRoom" ("key", "order", "scheduleId", "congregationId", "updatedAt")
    VALUES ('main', 0, schedule_id, congregation_id, CURRENT_TIMESTAMP)
    ON CONFLICT ("scheduleId", "key") DO NOTHING;
  SELECT "id" INTO room_id FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id AND "key" = 'main';
  RETURN room_id;
END
$$;

-- The room a template part's `track` names: none is the main room; a name already carried is its room; the first
-- room named in a container (or the editor's first hall, `trackOrder` 1) names the main room while it has no name, as
-- the backfill does (the parts for everyone happen in the main room too); any other is a new room.
CREATE OR REPLACE FUNCTION "schedule_template_room_for"(template_id int, track text, track_order int, congregation_id int)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE main_id int; room_id int;
BEGIN
  main_id := "schedule_template_main_room"(template_id, congregation_id);
  IF track = '' THEN RETURN main_id; END IF;
  SELECT "id" INTO room_id FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id AND "name" = track
    ORDER BY "order" LIMIT 1;
  IF room_id IS NOT NULL THEN RETURN room_id; END IF;
  IF track_order = 1 OR NOT EXISTS (SELECT 1 FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id AND "id" <> main_id) THEN
    UPDATE "ScheduleTemplateRoom" SET "name" = track, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = main_id AND "name" IS NULL;
    IF FOUND THEN RETURN main_id; END IF;
  END IF;
  INSERT INTO "ScheduleTemplateRoom" ("name", "order", "scheduleTemplateId", "congregationId", "updatedAt")
    VALUES (track, COALESCE(track_order,
      (SELECT COALESCE(MAX("order"), 0) + 1 FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id)),
      template_id, congregation_id, CURRENT_TIMESTAMP)
    RETURNING "id" INTO room_id;
  RETURN room_id;
END
$$;

CREATE OR REPLACE FUNCTION "schedule_room_for"(schedule_id int, track text, track_order int, congregation_id int)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE main_id int; room_id int;
BEGIN
  main_id := "schedule_main_room"(schedule_id, congregation_id);
  IF track = '' THEN RETURN main_id; END IF;
  SELECT "id" INTO room_id FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id AND "name" = track
    ORDER BY "order" LIMIT 1;
  IF room_id IS NOT NULL THEN RETURN room_id; END IF;
  IF track_order = 1 OR NOT EXISTS (SELECT 1 FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id AND "id" <> main_id) THEN
    UPDATE "ScheduleRoom" SET "name" = track, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = main_id AND "name" IS NULL;
    IF FOUND THEN RETURN main_id; END IF;
  END IF;
  INSERT INTO "ScheduleRoom" ("name", "order", "scheduleId", "congregationId", "updatedAt")
    VALUES (track, COALESCE(track_order,
      (SELECT COALESCE(MAX("order"), 0) + 1 FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id)),
      schedule_id, congregation_id, CURRENT_TIMESTAMP)
    RETURNING "id" INTO room_id;
  RETURN room_id;
END
$$;

-- 4. The backfill. Every programme template and schedule has its main room.
INSERT INTO "ScheduleTemplateRoom" ("key", "order", "scheduleTemplateId", "congregationId", "updatedAt")
  SELECT 'main', 0, st."id", st."congregationId", CURRENT_TIMESTAMP FROM "ScheduleTemplate" st WHERE st."kind" = 'programme'
  ON CONFLICT ("scheduleTemplateId", "key") DO NOTHING;
INSERT INTO "ScheduleRoom" ("key", "order", "scheduleId", "congregationId", "updatedAt")
  SELECT 'main', 0, s."id", s."congregationId", CURRENT_TIMESTAMP FROM "Schedule" s WHERE s."kind" = 'programme'
  ON CONFLICT ("scheduleId", "key") DO NOTHING;

-- The tracks of a container, in the order they first appear: the first is the main room, the others follow.
WITH tracks AS (
  SELECT tp."scheduleTemplateId" AS container, tp."track", tp."congregationId",
    row_number() OVER (PARTITION BY tp."scheduleTemplateId"
      ORDER BY MIN(tp."trackOrder") NULLS LAST, MIN(tp."id")) AS rank
  FROM "TemplatePart" tp JOIN "ScheduleTemplate" st ON st."id" = tp."scheduleTemplateId" AND st."kind" = 'programme'
  WHERE tp."track" <> ''
  GROUP BY tp."scheduleTemplateId", tp."track", tp."congregationId"
), named AS (
  UPDATE "ScheduleTemplateRoom" r SET "name" = t."track", "updatedAt" = CURRENT_TIMESTAMP
  FROM tracks t
  WHERE t.rank = 1 AND r."scheduleTemplateId" = t.container AND r."key" = 'main' AND r."name" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "ScheduleTemplateRoom" o WHERE o."scheduleTemplateId" = t.container AND o."name" = t."track")
  RETURNING r."id"
)
INSERT INTO "ScheduleTemplateRoom" ("name", "order", "scheduleTemplateId", "congregationId", "updatedAt")
  SELECT t."track", t.rank - 1, t.container, t."congregationId", CURRENT_TIMESTAMP FROM tracks t
  WHERE t.rank > 1
    AND NOT EXISTS (SELECT 1 FROM "ScheduleTemplateRoom" o WHERE o."scheduleTemplateId" = t.container AND o."name" = t."track");

WITH tracks AS (
  SELECT i."scheduleId" AS container, i."track", i."congregationId",
    row_number() OVER (PARTITION BY i."scheduleId" ORDER BY MIN(i."trackOrder") NULLS LAST, MIN(i."id")) AS rank
  FROM "Item" i JOIN "Schedule" s ON s."id" = i."scheduleId" AND s."kind" = 'programme'
  WHERE i."track" <> ''
  GROUP BY i."scheduleId", i."track", i."congregationId"
), named AS (
  UPDATE "ScheduleRoom" r SET "name" = t."track", "updatedAt" = CURRENT_TIMESTAMP
  FROM tracks t
  WHERE t.rank = 1 AND r."scheduleId" = t.container AND r."key" = 'main' AND r."name" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "ScheduleRoom" o WHERE o."scheduleId" = t.container AND o."name" = t."track")
  RETURNING r."id"
)
INSERT INTO "ScheduleRoom" ("name", "order", "scheduleId", "congregationId", "updatedAt")
  SELECT t."track", t.rank - 1, t.container, t."congregationId", CURRENT_TIMESTAMP FROM tracks t
  WHERE t.rank > 1
    AND NOT EXISTS (SELECT 1 FROM "ScheduleRoom" o WHERE o."scheduleId" = t.container AND o."name" = t."track");

-- Each template part in its room: its track's, or the main room.
INSERT INTO "TemplatePartRoom" ("templatePartId", "roomId", "congregationId")
  SELECT tp."id", r."id", tp."congregationId"
  FROM "TemplatePart" tp
  JOIN "ScheduleTemplate" st ON st."id" = tp."scheduleTemplateId" AND st."kind" = 'programme'
  JOIN "ScheduleTemplateRoom" r ON r."scheduleTemplateId" = tp."scheduleTemplateId"
    AND ((tp."track" = '' AND r."key" = 'main') OR (tp."track" <> '' AND r."name" = tp."track"))
  ON CONFLICT DO NOTHING;

-- Each meeting part in its room, with who does it there.
INSERT INTO "ItemRoom" ("itemId", "roomId", "assigneeId", "assistantId", "externalSpeakerId", "hasConflict", "congregationId", "updatedAt")
  SELECT i."id", r."id", i."assigneeId", i."assistantId", i."externalSpeakerId", i."hasConflict", i."congregationId", CURRENT_TIMESTAMP
  FROM "Item" i
  JOIN "Schedule" s ON s."id" = i."scheduleId" AND s."kind" = 'programme'
  JOIN "ScheduleRoom" r ON r."scheduleId" = i."scheduleId"
    AND ((i."track" = '' AND r."key" = 'main') OR (i."track" <> '' AND r."name" = i."track"))
  ON CONFLICT ("itemId", "roomId") DO NOTHING;

-- 5. The triggers.
CREATE OR REPLACE FUNCTION "schedule_template_rooms_on_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" = 'programme' THEN PERFORM "schedule_template_main_room"(NEW."id", NEW."congregationId"); END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "schedule_rooms_on_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" = 'programme' THEN PERFORM "schedule_main_room"(NEW."id", NEW."congregationId"); END IF;
  RETURN NEW;
END
$$;

-- A template part written by today's code: its room row follows its track.
CREATE OR REPLACE FUNCTION "template_part_room"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room_id int;
BEGIN
  IF NEW."scheduleTemplateId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "ScheduleTemplate" WHERE "id" = NEW."scheduleTemplateId" AND "kind" = 'programme') THEN
    DELETE FROM "TemplatePartRoom" WHERE "templatePartId" = NEW."id";
    RETURN NEW;
  END IF;
  room_id := "schedule_template_room_for"(NEW."scheduleTemplateId", NEW."track", NEW."trackOrder", NEW."congregationId");
  DELETE FROM "TemplatePartRoom" WHERE "templatePartId" = NEW."id" AND "roomId" <> room_id;
  INSERT INTO "TemplatePartRoom" ("templatePartId", "roomId", "congregationId")
    VALUES (NEW."id", room_id, NEW."congregationId") ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

-- A meeting part written by today's code: its room row follows its track and carries its assignees.
CREATE OR REPLACE FUNCTION "item_room"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room_id int;
BEGIN
  IF NEW."scheduleId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "Schedule" WHERE "id" = NEW."scheduleId" AND "kind" = 'programme') THEN
    DELETE FROM "ItemRoom" WHERE "itemId" = NEW."id";
    RETURN NEW;
  END IF;
  room_id := "schedule_room_for"(NEW."scheduleId", NEW."track", NEW."trackOrder", NEW."congregationId");
  DELETE FROM "ItemRoom" WHERE "itemId" = NEW."id" AND "roomId" <> room_id;
  INSERT INTO "ItemRoom" ("itemId", "roomId", "assigneeId", "assistantId", "externalSpeakerId", "hasConflict", "congregationId", "updatedAt")
    VALUES (NEW."id", room_id, NEW."assigneeId", NEW."assistantId", NEW."externalSpeakerId", NEW."hasConflict", NEW."congregationId", CURRENT_TIMESTAMP)
    ON CONFLICT ("itemId", "roomId") DO UPDATE SET
      "assigneeId" = EXCLUDED."assigneeId",
      "assistantId" = EXCLUDED."assistantId",
      "externalSpeakerId" = EXCLUDED."externalSpeakerId",
      "hasConflict" = EXCLUDED."hasConflict",
      "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "ScheduleTemplate_rooms" ON "ScheduleTemplate";
CREATE TRIGGER "ScheduleTemplate_rooms" AFTER INSERT ON "ScheduleTemplate"
  FOR EACH ROW EXECUTE FUNCTION "schedule_template_rooms_on_insert"();
DROP TRIGGER IF EXISTS "Schedule_rooms" ON "Schedule";
CREATE TRIGGER "Schedule_rooms" AFTER INSERT ON "Schedule"
  FOR EACH ROW EXECUTE FUNCTION "schedule_rooms_on_insert"();
DROP TRIGGER IF EXISTS "TemplatePart_room" ON "TemplatePart";
CREATE TRIGGER "TemplatePart_room" AFTER INSERT OR UPDATE OF "track", "trackOrder", "scheduleTemplateId" ON "TemplatePart"
  FOR EACH ROW EXECUTE FUNCTION "template_part_room"();
DROP TRIGGER IF EXISTS "Item_room" ON "Item";
CREATE TRIGGER "Item_room" AFTER INSERT OR UPDATE OF "track", "trackOrder", "scheduleId", "assigneeId", "assistantId", "externalSpeakerId", "hasConflict" ON "Item"
  FOR EACH ROW EXECUTE FUNCTION "item_room"();
