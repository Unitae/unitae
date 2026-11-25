-- Parallel rooms, phase R2 (docs/development/specs/parallel-rooms.md): a template part is held in its rooms, written by
-- the template editor, rather than one copy per room. No change for meetings: they still receive one copy per room
-- (sharing section and order), which the meeting page and the board already read.
--
-- 1. A template's copies (same kind, template, section and name, each in its room, paired by their place among the
--    parts of that name in their room, whatever their orders) become one part held in their rooms: the copy in the
--    main room is kept with its order and settings (else the oldest), the others' rooms join it, what pointed at them
--    points at it, and they go. A part held in a room other than the main one, alone, is held in the main room too.
-- 2. Template parts no longer carry a room in `track`: their rooms are their TemplatePartRoom rows.
--    Both are `merge_template_part_copies`, which restoring an older archive calls for its congregation.
-- 3. The template part trigger only fills in a part's room when it has none (a writer that knows no rooms: an older
--    archive, the meeting type's page), so it never undoes the rooms the editor set.

-- 1 and 2, in a function a restore calls too: an archive older than 2.22 brings copies (import-meetings.server.ts).
-- One congregation's template parts, or every congregation's for NULL. Returns how many copies went.
CREATE OR REPLACE FUNCTION "merge_template_part_copies"(congregation_id int) RETURNS int LANGUAGE plpgsql AS $$
DECLARE merged int;
BEGIN
  -- 1. Copies into one part (a table of this call's own: dropped below, or with its transaction).
  -- Copies are told by their kind, schedule template, section and name, and their place among the parts of that name
  -- in their room: the same order (the meeting page's copies) or not (the #642 editor's halls, numbered apart).
  CREATE TEMP TABLE "template_copies" ON COMMIT DROP AS
    WITH placed AS (
      SELECT tp."id", tp."templateId", tp."scheduleTemplateId", tp."section", tp."name", tp."congregationId",
        l."roomId", r."key",
        row_number() OVER (
          PARTITION BY tp."templateId", tp."scheduleTemplateId", tp."section", tp."name", l."roomId"
          ORDER BY tp."order", tp."id"
        ) AS rank
      FROM "TemplatePart" tp
      JOIN "ScheduleTemplate" st ON st."id" = tp."scheduleTemplateId" AND st."kind" = 'programme'
      JOIN "TemplatePartRoom" l ON l."templatePartId" = tp."id"
      JOIN "ScheduleTemplateRoom" r ON r."id" = l."roomId"
      WHERE tp."track" <> '' AND (congregation_id IS NULL OR tp."congregationId" = congregation_id)
    )
    SELECT p."id", p."scheduleTemplateId" AS template_id, p."roomId" AS room_id, p."congregationId",
      first_value(p."id") OVER (
        PARTITION BY p."templateId", p."scheduleTemplateId", p."section", p."name", p.rank
        ORDER BY (p."key" = 'main') IS TRUE DESC, p."id"
      ) AS kept
    FROM placed p;

  -- The kept part is held in every room of its copies, and in the main room.
  INSERT INTO "TemplatePartRoom" ("templatePartId", "roomId", "congregationId")
    SELECT DISTINCT c.kept, c.room_id, c."congregationId" FROM "template_copies" c
    ON CONFLICT DO NOTHING;
  INSERT INTO "TemplatePartRoom" ("templatePartId", "roomId", "congregationId")
    SELECT DISTINCT c.kept, r."id", c."congregationId"
    FROM "template_copies" c
    JOIN "ScheduleTemplateRoom" r ON r."scheduleTemplateId" = c.template_id AND r."key" = 'main'
    ON CONFLICT DO NOTHING;

  -- What pointed at a copy that goes points at the kept part: meeting parts through its template item, legacy event
  -- parts.
  UPDATE "Item" i SET "templateItemId" = kept_item."id"
    FROM "template_copies" c
    JOIN "TemplateItem" gone_item ON gone_item."legacyPartId" = c."id"
    JOIN "TemplateItem" kept_item ON kept_item."legacyPartId" = c.kept
    WHERE c."id" <> c.kept AND i."templateItemId" = gone_item."id";
  UPDATE "EventPart" e SET "partId" = c.kept
    FROM "template_copies" c
    WHERE c."id" <> c.kept AND e."partId" = c."id";

  DELETE FROM "TemplatePart" tp USING "template_copies" c WHERE tp."id" = c."id" AND c."id" <> c.kept;
  GET DIAGNOSTICS merged = ROW_COUNT;
  DROP TABLE "template_copies";

  -- 2. Rooms are the room rows from now on.
  UPDATE "TemplatePart" SET "track" = '', "trackOrder" = NULL
    WHERE ("track" <> '' OR "trackOrder" IS NOT NULL) AND (congregation_id IS NULL OR "congregationId" = congregation_id);
  RETURN merged;
END
$$;

-- 3. The trigger fills in, never overrides.
CREATE OR REPLACE FUNCTION "template_part_room"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room_id int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."scheduleTemplateId" IS NOT NULL THEN
      -- Its rows go first: the cascade that would remove them may come after this trigger.
      DELETE FROM "TemplatePartRoom" WHERE "templatePartId" = OLD."id";
      PERFORM "prune_schedule_template_rooms"(OLD."scheduleTemplateId");
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."scheduleTemplateId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "ScheduleTemplate" WHERE "id" = NEW."scheduleTemplateId" AND "kind" = 'programme') THEN
    DELETE FROM "TemplatePartRoom" WHERE "templatePartId" = NEW."id";
  ELSIF TG_OP = 'UPDATE' AND OLD."scheduleTemplateId" IS NOT NULL
    AND OLD."scheduleTemplateId" IS DISTINCT FROM NEW."scheduleTemplateId" THEN
    -- Moved to another template: its rooms were the old template's; it starts in the new one's main room. A part
    -- placed in its first one (a restore, then the sync) has none yet: it is filled in below, from its track.
    DELETE FROM "TemplatePartRoom" WHERE "templatePartId" = NEW."id";
    INSERT INTO "TemplatePartRoom" ("templatePartId", "roomId", "congregationId")
      VALUES (NEW."id", "schedule_template_main_room"(NEW."scheduleTemplateId", NEW."congregationId"), NEW."congregationId")
      ON CONFLICT DO NOTHING;
  ELSIF NOT EXISTS (SELECT 1 FROM "TemplatePartRoom" WHERE "templatePartId" = NEW."id") THEN
    -- A writer that knows no rooms: its track (if any) names one, as before; none is the main room.
    room_id := "schedule_template_room_for"(NEW."scheduleTemplateId", NEW."track", NEW."trackOrder", NEW."congregationId");
    INSERT INTO "TemplatePartRoom" ("templatePartId", "roomId", "congregationId")
      VALUES (NEW."id", room_id, NEW."congregationId") ON CONFLICT DO NOTHING;
    -- A part in another room is in parallel: held in the main room too, as the editor holds it.
    INSERT INTO "TemplatePartRoom" ("templatePartId", "roomId", "congregationId")
      VALUES (NEW."id", "schedule_template_main_room"(NEW."scheduleTemplateId", NEW."congregationId"), NEW."congregationId")
      ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."scheduleTemplateId" IS DISTINCT FROM NEW."scheduleTemplateId" AND OLD."scheduleTemplateId" IS NOT NULL THEN
    PERFORM "prune_schedule_template_rooms"(OLD."scheduleTemplateId");
  END IF;
  RETURN NEW;
END
$$;

-- Rooms a template keeps, unused, are the editor's to remove: the template's rooms no longer follow its parts.
CREATE OR REPLACE FUNCTION "prune_schedule_template_rooms"(template_id int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  NULL;
END
$$;

-- Last, once the trigger fills in only: under the previous one, the merge's own writes (a kept part's second room,
-- the tracks cleared) would move every room row of a kept part to one room.
SELECT "merge_template_part_copies"(NULL);
