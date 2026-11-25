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
-- 5. The triggers, written so the code already deployed never fails on them: a room missing is created, two writers
--    making the same room find one, and a room left without parts goes.

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
CREATE UNIQUE INDEX "ScheduleTemplateRoom_scheduleTemplateId_name_key" ON "ScheduleTemplateRoom"("scheduleTemplateId", "name");

-- CreateIndex
CREATE INDEX "ScheduleRoom_scheduleId_idx" ON "ScheduleRoom"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRoom_id_congregationId_key" ON "ScheduleRoom"("id", "congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRoom_scheduleId_key_key" ON "ScheduleRoom"("scheduleId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRoom_scheduleId_name_key" ON "ScheduleRoom"("scheduleId", "name");

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

-- 3. The room helpers. A container's rooms follow its parts' tracks while today's code writes copies: a track names a
-- room (made if missing), the editor's main hall (room order 1) is the main room, and a room left without parts goes.

CREATE OR REPLACE FUNCTION "schedule_template_main_room"(template_id int, congregation_id int) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE room_id int;
BEGIN
  -- Looked up first: an insert on every write would use up a room id each time.
  SELECT "id" INTO room_id FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id AND "key" = 'main';
  IF room_id IS NOT NULL THEN RETURN room_id; END IF;
  INSERT INTO "ScheduleTemplateRoom" ("key", "order", "scheduleTemplateId", "congregationId", "updatedAt")
    VALUES ('main', 0, template_id, congregation_id, CURRENT_TIMESTAMP)
    ON CONFLICT ("scheduleTemplateId", "key") DO NOTHING;
  SELECT "id" INTO room_id FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id AND "key" = 'main';
  RETURN room_id;
END
$$;

CREATE OR REPLACE FUNCTION "schedule_template_room_for"(template_id int, track text, track_order int, congregation_id int,
  rename_main boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE main_id int; main_name text; room_id int;
BEGIN
  main_id := "schedule_template_main_room"(template_id, congregation_id);
  IF track = '' THEN RETURN main_id; END IF;
  SELECT "id" INTO room_id FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id AND "name" = track;
  IF room_id = main_id THEN RETURN main_id; END IF;
  SELECT "name" INTO main_name FROM "ScheduleTemplateRoom" WHERE "id" = main_id;
  -- The main room: the editor's main hall (room order 1), or its parts all renamed at once (`rename_main`), renamed
  -- with it; or the first room named while it has none.
  IF track_order = 1 OR rename_main OR (main_name IS NULL AND NOT EXISTS (SELECT 1 FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id AND "id" <> main_id)) THEN
    IF room_id IS NOT NULL THEN
      -- Another room carries the name: its parts join the main room, and it goes.
      UPDATE "TemplatePartRoom" l SET "roomId" = main_id WHERE l."roomId" = room_id
        AND NOT EXISTS (SELECT 1 FROM "TemplatePartRoom" o WHERE o."roomId" = main_id AND o."templatePartId" = l."templatePartId");
      DELETE FROM "ScheduleTemplateRoom" WHERE "id" = room_id;
    END IF;
    BEGIN
      UPDATE "ScheduleTemplateRoom" SET "name" = track, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = main_id AND "name" IS DISTINCT FROM track;
    EXCEPTION WHEN unique_violation THEN
      -- Another writer gave that name to another room at the same moment: the part is in the main room all the
      -- same, which keeps its name rather than failing the write.
      NULL;
    END;
    RETURN main_id;
  END IF;
  IF room_id IS NOT NULL THEN RETURN room_id; END IF;
  -- A new room, last in order; a second writer creating it at the same moment finds it instead of failing.
  INSERT INTO "ScheduleTemplateRoom" ("name", "order", "scheduleTemplateId", "congregationId", "updatedAt")
    VALUES (track, (SELECT COALESCE(MAX("order"), 0) + 1 FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id), template_id, congregation_id, CURRENT_TIMESTAMP)
    ON CONFLICT ("scheduleTemplateId", "name") DO NOTHING;
  SELECT "id" INTO room_id FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id AND "name" = track;
  RETURN room_id;
END
$$;

-- A room no part is in any more (renamed away, emptied) goes; the main room stays, and the others keep their places
-- without gaps (0 for the main room, then 1, 2… as the backfill numbers them).
CREATE OR REPLACE FUNCTION "prune_schedule_template_rooms"(template_id int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "ScheduleTemplateRoom" r WHERE r."scheduleTemplateId" = template_id AND r."key" IS DISTINCT FROM 'main'
    AND NOT EXISTS (SELECT 1 FROM "TemplatePartRoom" l WHERE l."roomId" = r."id");
  UPDATE "ScheduleTemplateRoom" r SET "order" = n.place, "updatedAt" = CURRENT_TIMESTAMP
  FROM (
    SELECT "id", row_number() OVER (ORDER BY ("key" = 'main') IS TRUE DESC, "order", "id") - 1 AS place
    FROM "ScheduleTemplateRoom" WHERE "scheduleTemplateId" = template_id
  ) n
  WHERE r."id" = n."id" AND r."order" <> n.place;
END
$$;

CREATE OR REPLACE FUNCTION "schedule_main_room"(schedule_id int, congregation_id int) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE room_id int;
BEGIN
  -- Looked up first: an insert on every write would use up a room id each time.
  SELECT "id" INTO room_id FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id AND "key" = 'main';
  IF room_id IS NOT NULL THEN RETURN room_id; END IF;
  INSERT INTO "ScheduleRoom" ("key", "order", "scheduleId", "congregationId", "updatedAt")
    VALUES ('main', 0, schedule_id, congregation_id, CURRENT_TIMESTAMP)
    ON CONFLICT ("scheduleId", "key") DO NOTHING;
  SELECT "id" INTO room_id FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id AND "key" = 'main';
  RETURN room_id;
END
$$;

CREATE OR REPLACE FUNCTION "schedule_room_for"(schedule_id int, track text, track_order int, congregation_id int,
  rename_main boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE main_id int; main_name text; template_main text; room_id int;
BEGIN
  main_id := "schedule_main_room"(schedule_id, congregation_id);
  IF track = '' THEN RETURN main_id; END IF;
  SELECT "id" INTO room_id FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id AND "name" = track;
  IF room_id = main_id THEN RETURN main_id; END IF;
  SELECT "name" INTO main_name FROM "ScheduleRoom" WHERE "id" = main_id;
  -- The template's main room names the meeting's: which copy is written first must not decide it.
  SELECT r."name" INTO template_main FROM "Schedule" s JOIN "ScheduleTemplateRoom" r
    ON r."scheduleTemplateId" = s."scheduleTemplateId" AND r."key" = 'main' WHERE s."id" = schedule_id;
  -- The main room: the editor's main hall (room order 1), renamed with it, or the first room named while it has none.
  IF track_order = 1 OR rename_main OR track = template_main OR (template_main IS NULL AND main_name IS NULL
      AND NOT EXISTS (SELECT 1 FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id AND "id" <> main_id)) THEN
    IF room_id IS NOT NULL THEN
      -- Another room carries the name: its parts join the main room, and it goes.
      UPDATE "ItemRoom" l SET "roomId" = main_id WHERE l."roomId" = room_id
        AND NOT EXISTS (SELECT 1 FROM "ItemRoom" o WHERE o."roomId" = main_id AND o."itemId" = l."itemId");
      DELETE FROM "ScheduleRoom" WHERE "id" = room_id;
    END IF;
    BEGIN
      UPDATE "ScheduleRoom" SET "name" = track, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = main_id AND "name" IS DISTINCT FROM track;
    EXCEPTION WHEN unique_violation THEN
      -- Another writer gave that name to another room at the same moment: the part is in the main room all the
      -- same, which keeps its name rather than failing the write.
      NULL;
    END;
    RETURN main_id;
  END IF;
  IF room_id IS NOT NULL THEN RETURN room_id; END IF;
  -- A new room, last in order; a second writer creating it at the same moment finds it instead of failing.
  INSERT INTO "ScheduleRoom" ("name", "order", "scheduleId", "congregationId", "updatedAt")
    VALUES (track, (SELECT COALESCE(MAX("order"), 0) + 1 FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id), schedule_id, congregation_id, CURRENT_TIMESTAMP)
    ON CONFLICT ("scheduleId", "name") DO NOTHING;
  SELECT "id" INTO room_id FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id AND "name" = track;
  RETURN room_id;
END
$$;

-- A room no part is in any more (renamed away, emptied) goes; the main room stays, and the others keep their places
-- without gaps (0 for the main room, then 1, 2… as the backfill numbers them).
CREATE OR REPLACE FUNCTION "prune_schedule_rooms"(schedule_id int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "ScheduleRoom" r WHERE r."scheduleId" = schedule_id AND r."key" IS DISTINCT FROM 'main'
    AND NOT EXISTS (SELECT 1 FROM "ItemRoom" l WHERE l."roomId" = r."id");
  UPDATE "ScheduleRoom" r SET "order" = n.place, "updatedAt" = CURRENT_TIMESTAMP
  FROM (
    SELECT "id", row_number() OVER (ORDER BY ("key" = 'main') IS TRUE DESC, "order", "id") - 1 AS place
    FROM "ScheduleRoom" WHERE "scheduleId" = schedule_id
  ) n
  WHERE r."id" = n."id" AND r."order" <> n.place;
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
    -- The template's main room names the meeting's first, as the triggers do; then room order, then the oldest copy.
    row_number() OVER (PARTITION BY i."scheduleId"
      ORDER BY (i."track" = MIN(tr."name")) IS TRUE DESC, MIN(i."trackOrder") NULLS LAST, MIN(i."id")) AS rank
  FROM "Item" i JOIN "Schedule" s ON s."id" = i."scheduleId" AND s."kind" = 'programme'
  LEFT JOIN "ScheduleTemplateRoom" tr ON tr."scheduleTemplateId" = s."scheduleTemplateId" AND tr."key" = 'main'
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

-- A template part written by today's code: its one room row follows its track; a room it leaves empty goes.
CREATE OR REPLACE FUNCTION "template_part_room"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room_id int; renamed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."scheduleTemplateId" IS NOT NULL THEN
      -- Its row goes first: the cascade that would remove it may come after this trigger.
      DELETE FROM "TemplatePartRoom" WHERE "templatePartId" = OLD."id";
      PERFORM "prune_schedule_template_rooms"(OLD."scheduleTemplateId");
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."scheduleTemplateId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "ScheduleTemplate" WHERE "id" = NEW."scheduleTemplateId" AND "kind" = 'programme') THEN
    DELETE FROM "TemplatePartRoom" WHERE "templatePartId" = NEW."id";
  ELSE
    -- The main room's parts all renamed at once (a rename of its hall, with or without a room order): the main room
    -- takes the name, rather than a new room.
    IF TG_OP = 'UPDATE' AND OLD."track" <> '' AND NEW."track" IS DISTINCT FROM OLD."track" THEN
      renamed := EXISTS (
        SELECT 1 FROM "TemplatePartRoom" l JOIN "ScheduleTemplateRoom" r ON r."id" = l."roomId" AND r."key" = 'main'
        WHERE l."templatePartId" = NEW."id"
      ) AND NOT EXISTS (
        SELECT 1 FROM "TemplatePart" p
        JOIN "TemplatePartRoom" l ON l."templatePartId" = p."id"
        JOIN "ScheduleTemplateRoom" r ON r."id" = l."roomId" AND r."key" = 'main'
        WHERE r."scheduleTemplateId" = NEW."scheduleTemplateId" AND p."id" <> NEW."id" AND p."track" = OLD."track"
      );
    END IF;
    -- A room another writer empties and removes at the same moment is made again, once.
    FOR attempt IN 1..2 LOOP
      BEGIN
        room_id := "schedule_template_room_for"(NEW."scheduleTemplateId", NEW."track", NEW."trackOrder", NEW."congregationId", renamed);
        UPDATE "TemplatePartRoom" SET "roomId" = room_id WHERE "templatePartId" = NEW."id";
        IF NOT FOUND THEN
          INSERT INTO "TemplatePartRoom" ("templatePartId", "roomId", "congregationId")
            VALUES (NEW."id", room_id, NEW."congregationId") ON CONFLICT DO NOTHING;
        END IF;
        EXIT;
      EXCEPTION WHEN foreign_key_violation THEN
        IF attempt = 2 THEN RAISE; END IF;
      END;
    END LOOP;
    PERFORM "prune_schedule_template_rooms"(NEW."scheduleTemplateId");
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."scheduleTemplateId" IS DISTINCT FROM NEW."scheduleTemplateId" AND OLD."scheduleTemplateId" IS NOT NULL THEN
    PERFORM "prune_schedule_template_rooms"(OLD."scheduleTemplateId");
  END IF;
  RETURN NEW;
END
$$;

-- A meeting part written by today's code: its one room row follows its track and carries its assignees, keeping its id
-- when it changes room; a room it leaves empty goes.
CREATE OR REPLACE FUNCTION "item_room"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room_id int; renamed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."scheduleId" IS NOT NULL THEN
      -- Its row goes first: the cascade that would remove it comes after this trigger.
      DELETE FROM "ItemRoom" WHERE "itemId" = OLD."id";
      PERFORM "prune_schedule_rooms"(OLD."scheduleId");
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."scheduleId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "Schedule" WHERE "id" = NEW."scheduleId" AND "kind" = 'programme') THEN
    DELETE FROM "ItemRoom" WHERE "itemId" = NEW."id";
  ELSE
    -- The main room's parts all renamed at once: the main room takes the name, rather than a new room.
    IF TG_OP = 'UPDATE' AND OLD."track" <> '' AND NEW."track" IS DISTINCT FROM OLD."track" THEN
      renamed := EXISTS (
        SELECT 1 FROM "ItemRoom" l JOIN "ScheduleRoom" r ON r."id" = l."roomId" AND r."key" = 'main'
        WHERE l."itemId" = NEW."id"
      ) AND NOT EXISTS (
        SELECT 1 FROM "Item" p
        JOIN "ItemRoom" l ON l."itemId" = p."id"
        JOIN "ScheduleRoom" r ON r."id" = l."roomId" AND r."key" = 'main'
        WHERE r."scheduleId" = NEW."scheduleId" AND p."id" <> NEW."id" AND p."track" = OLD."track"
      );
    END IF;
    -- A room another writer empties and removes at the same moment is made again, once.
    FOR attempt IN 1..2 LOOP
      BEGIN
        room_id := "schedule_room_for"(NEW."scheduleId", NEW."track", NEW."trackOrder", NEW."congregationId", renamed);
        UPDATE "ItemRoom" SET
          "roomId" = room_id,
          "assigneeId" = NEW."assigneeId",
          "assistantId" = NEW."assistantId",
          "externalSpeakerId" = NEW."externalSpeakerId",
          "hasConflict" = NEW."hasConflict",
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "itemId" = NEW."id";
        IF NOT FOUND THEN
          INSERT INTO "ItemRoom" ("itemId", "roomId", "assigneeId", "assistantId", "externalSpeakerId", "hasConflict", "congregationId", "updatedAt")
            VALUES (NEW."id", room_id, NEW."assigneeId", NEW."assistantId", NEW."externalSpeakerId", NEW."hasConflict", NEW."congregationId", CURRENT_TIMESTAMP)
            ON CONFLICT ("itemId", "roomId") DO NOTHING;
        END IF;
        EXIT;
      EXCEPTION WHEN foreign_key_violation THEN
        IF attempt = 2 THEN RAISE; END IF;
      END;
    END LOOP;
    PERFORM "prune_schedule_rooms"(NEW."scheduleId");
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."scheduleId" IS DISTINCT FROM NEW."scheduleId" AND OLD."scheduleId" IS NOT NULL THEN
    PERFORM "prune_schedule_rooms"(OLD."scheduleId");
  END IF;
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
CREATE TRIGGER "TemplatePart_room" AFTER INSERT OR DELETE OR UPDATE OF "track", "trackOrder", "scheduleTemplateId" ON "TemplatePart"
  FOR EACH ROW EXECUTE FUNCTION "template_part_room"();
DROP TRIGGER IF EXISTS "Item_room" ON "Item";
CREATE TRIGGER "Item_room" AFTER INSERT OR DELETE OR UPDATE OF "track", "trackOrder", "scheduleId", "assigneeId", "assistantId", "externalSpeakerId", "hasConflict" ON "Item"
  FOR EACH ROW EXECUTE FUNCTION "item_room"();
