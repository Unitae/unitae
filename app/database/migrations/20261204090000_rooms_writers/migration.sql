-- Parallel rooms R4: the writers put a part's people on its room rows alone (no dual-write). Contract: who holds what
-- on a meeting is unchanged by this file. The Item_room trigger stops failing on a part with a row per room and stops
-- copying people that did not change (a conflict refresh by a version still running would otherwise write the item's
-- stale people over the row's). The writers touch the item's updatedAt themselves when they write a row, on the app's
-- clock as every write (a trigger here would stamp the transaction's start, earlier than the write it follows).

-- 1. A meeting part's room rows. A part in one room (today's copies, a part for everyone) keeps one row that follows its
-- track and takes, of its people and conflict, the columns that changed. A part with a row per room keeps its rows: a
-- write of the item's people (a version still running) reaches its main room's row, its track is not its room, and no
-- writer moves it to another programme.
CREATE OR REPLACE FUNCTION "item_room"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE room_id int; renamed boolean := false; rows_held int; main_row int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."scheduleId" IS NOT NULL THEN
      -- Its rows go first: the cascade that would remove them comes after this trigger.
      DELETE FROM "ItemRoom" WHERE "itemId" = OLD."id";
      PERFORM "prune_schedule_rooms"(OLD."scheduleId");
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."scheduleId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "Schedule" WHERE "id" = NEW."scheduleId" AND "kind" = 'programme') THEN
    DELETE FROM "ItemRoom" WHERE "itemId" = NEW."id";
    IF TG_OP = 'UPDATE' AND OLD."scheduleId" IS DISTINCT FROM NEW."scheduleId" AND OLD."scheduleId" IS NOT NULL THEN
      PERFORM "prune_schedule_rooms"(OLD."scheduleId");
    END IF;
    RETURN NEW;
  END IF;

  SELECT count(*) INTO rows_held FROM "ItemRoom" WHERE "itemId" = NEW."id";
  IF rows_held >= 2 THEN
    IF TG_OP = 'UPDATE' AND OLD."scheduleId" IS DISTINCT FROM NEW."scheduleId" THEN
      -- No writer moves a part held in several rooms to another meeting's programme: one that did would map its
      -- rooms by name onto rooms the target may name otherwise, and could lose a room's person. Refused, loudly.
      RAISE EXCEPTION 'Item % is held in several rooms: it cannot move to another programme', NEW."id";
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW."assigneeId" IS DISTINCT FROM OLD."assigneeId" OR NEW."assistantId" IS DISTINCT FROM OLD."assistantId"
      OR NEW."externalSpeakerId" IS DISTINCT FROM OLD."externalSpeakerId" OR NEW."hasConflict" IS DISTINCT FROM OLD."hasConflict"
    ) THEN
      SELECT l."id" INTO main_row FROM "ItemRoom" l JOIN "ScheduleRoom" r ON r."id" = l."roomId"
      WHERE l."itemId" = NEW."id" ORDER BY (r."key" = 'main') IS TRUE DESC, r."order", l."id" LIMIT 1;
      UPDATE "ItemRoom" SET
        "assigneeId" = CASE WHEN NEW."assigneeId" IS DISTINCT FROM OLD."assigneeId" THEN NEW."assigneeId" ELSE "assigneeId" END,
        "assistantId" = CASE WHEN NEW."assistantId" IS DISTINCT FROM OLD."assistantId" THEN NEW."assistantId" ELSE "assistantId" END,
        "externalSpeakerId" = CASE WHEN NEW."externalSpeakerId" IS DISTINCT FROM OLD."externalSpeakerId" THEN NEW."externalSpeakerId" ELSE "externalSpeakerId" END,
        "hasConflict" = CASE WHEN NEW."hasConflict" IS DISTINCT FROM OLD."hasConflict" THEN NEW."hasConflict" ELSE "hasConflict" END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = main_row;
    END IF;
    RETURN NEW;
  END IF;

  -- A part in one room, or none yet.
  IF TG_OP = 'UPDATE' AND OLD."track" <> '' AND NEW."track" IS DISTINCT FROM OLD."track" THEN
    -- The main room's parts all renamed at once: the main room takes the name, rather than a new room.
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
      IF TG_OP = 'INSERT' OR rows_held = 0 THEN
        UPDATE "ItemRoom" SET
          "roomId" = room_id,
          "assigneeId" = NEW."assigneeId",
          "assistantId" = NEW."assistantId",
          "externalSpeakerId" = NEW."externalSpeakerId",
          "hasConflict" = NEW."hasConflict",
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "itemId" = NEW."id";
      ELSE
        -- Of its people and conflict, only what this write changed: the row may hold newer people than the item.
        UPDATE "ItemRoom" SET
          "roomId" = room_id,
          "assigneeId" = CASE WHEN NEW."assigneeId" IS DISTINCT FROM OLD."assigneeId" THEN NEW."assigneeId" ELSE "assigneeId" END,
          "assistantId" = CASE WHEN NEW."assistantId" IS DISTINCT FROM OLD."assistantId" THEN NEW."assistantId" ELSE "assistantId" END,
          "externalSpeakerId" = CASE WHEN NEW."externalSpeakerId" IS DISTINCT FROM OLD."externalSpeakerId" THEN NEW."externalSpeakerId" ELSE "externalSpeakerId" END,
          "hasConflict" = CASE WHEN NEW."hasConflict" IS DISTINCT FROM OLD."hasConflict" THEN NEW."hasConflict" ELSE "hasConflict" END,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "itemId" = NEW."id";
      END IF;
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
  IF TG_OP = 'UPDATE' AND OLD."scheduleId" IS DISTINCT FROM NEW."scheduleId" AND OLD."scheduleId" IS NOT NULL THEN
    PERFORM "prune_schedule_rooms"(OLD."scheduleId");
  END IF;
  RETURN NEW;
END
$$;
