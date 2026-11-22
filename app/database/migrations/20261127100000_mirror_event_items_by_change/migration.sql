-- The event item mirrors follow an old row's changes, never its stale state (plan T12, 5i-b). From this release the app
-- edits and deletes items alone, so an old row can lag behind its item or outlive it, and Postgres still updates old rows
-- by itself (a foreign key set to null when a template part, a preset, a speaker or a member is deleted). The update
-- branch therefore never inserts, and copies a column only when the old row changed it and the item still holds the
-- value the row had: an item in step with its row (the previous image during the rollout, a demo, an import, a schedule
-- attached to an old row) follows it as before, one the app moved on from keeps what the app wrote, and one the app
-- deleted stays deleted. An insert still creates its item. The triggers themselves are unchanged.

-- 1. Event parts.
CREATE OR REPLACE FUNCTION "mirror_event_part"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "Item" WHERE "legacyPartId" = OLD."id";
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
  INSERT INTO "Item" ("name", "order", "topic", "note", "hasConflict", "section", "track", "trackOrder", "durationMin", "speakerLabel", "readerLabel", "eventId", "scheduleId", "templateItemId", "presetId", "assigneeId", "assistantId", "allowExternalSpeaker", "externalSpeakerId", "updatedAt", "createdAt", "legacyPartId", "congregationId")
    VALUES (NEW."name", NEW."order", NEW."topic", NEW."note", NEW."hasConflict", NEW."section", NEW."track", NEW."trackOrder", NEW."durationMin", NEW."speakerLabel", NEW."readerLabel", NEW."eventId", NEW."scheduleId", (SELECT ti."id" FROM "TemplateItem" ti WHERE ti."legacyPartId" = NEW."partId"), NEW."presetId", NEW."assigneeId", NEW."assistantId", NEW."allowExternalSpeaker", NEW."externalSpeakerId", NEW."updatedAt", NEW."createdAt", NEW."id", NEW."congregationId")
    ON CONFLICT ("legacyPartId") DO NOTHING;
    RETURN NEW;
  END IF;
  UPDATE "Item" AS i SET
      "name" = CASE WHEN NEW."name" IS DISTINCT FROM OLD."name" AND i."name" IS NOT DISTINCT FROM OLD."name" THEN NEW."name" ELSE i."name" END,
      "order" = CASE WHEN NEW."order" IS DISTINCT FROM OLD."order" AND i."order" IS NOT DISTINCT FROM OLD."order" THEN NEW."order" ELSE i."order" END,
      "topic" = CASE WHEN NEW."topic" IS DISTINCT FROM OLD."topic" AND i."topic" IS NOT DISTINCT FROM OLD."topic" THEN NEW."topic" ELSE i."topic" END,
      "note" = CASE WHEN NEW."note" IS DISTINCT FROM OLD."note" AND i."note" IS NOT DISTINCT FROM OLD."note" THEN NEW."note" ELSE i."note" END,
      "hasConflict" = CASE WHEN NEW."hasConflict" IS DISTINCT FROM OLD."hasConflict" AND i."hasConflict" IS NOT DISTINCT FROM OLD."hasConflict" THEN NEW."hasConflict" ELSE i."hasConflict" END,
      "section" = CASE WHEN NEW."section" IS DISTINCT FROM OLD."section" AND i."section" IS NOT DISTINCT FROM OLD."section" THEN NEW."section" ELSE i."section" END,
      "track" = CASE WHEN NEW."track" IS DISTINCT FROM OLD."track" AND i."track" IS NOT DISTINCT FROM OLD."track" THEN NEW."track" ELSE i."track" END,
      "trackOrder" = CASE WHEN NEW."trackOrder" IS DISTINCT FROM OLD."trackOrder" AND i."trackOrder" IS NOT DISTINCT FROM OLD."trackOrder" THEN NEW."trackOrder" ELSE i."trackOrder" END,
      "durationMin" = CASE WHEN NEW."durationMin" IS DISTINCT FROM OLD."durationMin" AND i."durationMin" IS NOT DISTINCT FROM OLD."durationMin" THEN NEW."durationMin" ELSE i."durationMin" END,
      "speakerLabel" = CASE WHEN NEW."speakerLabel" IS DISTINCT FROM OLD."speakerLabel" AND i."speakerLabel" IS NOT DISTINCT FROM OLD."speakerLabel" THEN NEW."speakerLabel" ELSE i."speakerLabel" END,
      "readerLabel" = CASE WHEN NEW."readerLabel" IS DISTINCT FROM OLD."readerLabel" AND i."readerLabel" IS NOT DISTINCT FROM OLD."readerLabel" THEN NEW."readerLabel" ELSE i."readerLabel" END,
      "eventId" = CASE WHEN NEW."eventId" IS DISTINCT FROM OLD."eventId" AND i."eventId" IS NOT DISTINCT FROM OLD."eventId" THEN NEW."eventId" ELSE i."eventId" END,
      "scheduleId" = CASE WHEN NEW."scheduleId" IS DISTINCT FROM OLD."scheduleId" AND i."scheduleId" IS NOT DISTINCT FROM OLD."scheduleId" THEN NEW."scheduleId" ELSE i."scheduleId" END,
      "presetId" = CASE WHEN NEW."presetId" IS DISTINCT FROM OLD."presetId" AND i."presetId" IS NOT DISTINCT FROM OLD."presetId" THEN NEW."presetId" ELSE i."presetId" END,
      "assigneeId" = CASE WHEN NEW."assigneeId" IS DISTINCT FROM OLD."assigneeId" AND i."assigneeId" IS NOT DISTINCT FROM OLD."assigneeId" THEN NEW."assigneeId" ELSE i."assigneeId" END,
      "assistantId" = CASE WHEN NEW."assistantId" IS DISTINCT FROM OLD."assistantId" AND i."assistantId" IS NOT DISTINCT FROM OLD."assistantId" THEN NEW."assistantId" ELSE i."assistantId" END,
      "allowExternalSpeaker" = CASE WHEN NEW."allowExternalSpeaker" IS DISTINCT FROM OLD."allowExternalSpeaker" AND i."allowExternalSpeaker" IS NOT DISTINCT FROM OLD."allowExternalSpeaker" THEN NEW."allowExternalSpeaker" ELSE i."allowExternalSpeaker" END,
      "externalSpeakerId" = CASE WHEN NEW."externalSpeakerId" IS DISTINCT FROM OLD."externalSpeakerId" AND i."externalSpeakerId" IS NOT DISTINCT FROM OLD."externalSpeakerId" THEN NEW."externalSpeakerId" ELSE i."externalSpeakerId" END,
      "updatedAt" = CASE WHEN NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt" AND i."updatedAt" IS NOT DISTINCT FROM OLD."updatedAt" THEN NEW."updatedAt" ELSE i."updatedAt" END,
      "congregationId" = CASE WHEN NEW."congregationId" IS DISTINCT FROM OLD."congregationId" AND i."congregationId" IS NOT DISTINCT FROM OLD."congregationId" THEN NEW."congregationId" ELSE i."congregationId" END,
      "templateItemId" = CASE WHEN NEW."partId" IS DISTINCT FROM OLD."partId" AND i."templateItemId" IS NOT DISTINCT FROM (SELECT ti."id" FROM "TemplateItem" ti WHERE ti."legacyPartId" = OLD."partId") THEN (SELECT ti."id" FROM "TemplateItem" ti WHERE ti."legacyPartId" = NEW."partId") ELSE i."templateItemId" END
    WHERE i."legacyPartId" = NEW."id";
  RETURN NEW;
END
$$;

-- 2. Event services.
CREATE OR REPLACE FUNCTION "mirror_event_service_part"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "Item" WHERE "legacyServiceId" = OLD."id";
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
  INSERT INTO "Item" ("name", "order", "note", "hasConflict", "eventId", "scheduleId", "templateItemId", "presetId", "assigneeId", "updatedAt", "createdAt", "legacyServiceId", "congregationId")
    VALUES (NEW."name", NEW."order", NEW."note", NEW."hasConflict", NEW."eventId", NEW."scheduleId", (SELECT ti."id" FROM "TemplateItem" ti WHERE ti."legacyServiceId" = NEW."servicePartId"), NEW."presetId", NEW."assigneeId", NEW."updatedAt", NEW."createdAt", NEW."id", NEW."congregationId")
    ON CONFLICT ("legacyServiceId") DO NOTHING;
    RETURN NEW;
  END IF;
  UPDATE "Item" AS i SET
      "name" = CASE WHEN NEW."name" IS DISTINCT FROM OLD."name" AND i."name" IS NOT DISTINCT FROM OLD."name" THEN NEW."name" ELSE i."name" END,
      "order" = CASE WHEN NEW."order" IS DISTINCT FROM OLD."order" AND i."order" IS NOT DISTINCT FROM OLD."order" THEN NEW."order" ELSE i."order" END,
      "note" = CASE WHEN NEW."note" IS DISTINCT FROM OLD."note" AND i."note" IS NOT DISTINCT FROM OLD."note" THEN NEW."note" ELSE i."note" END,
      "hasConflict" = CASE WHEN NEW."hasConflict" IS DISTINCT FROM OLD."hasConflict" AND i."hasConflict" IS NOT DISTINCT FROM OLD."hasConflict" THEN NEW."hasConflict" ELSE i."hasConflict" END,
      "eventId" = CASE WHEN NEW."eventId" IS DISTINCT FROM OLD."eventId" AND i."eventId" IS NOT DISTINCT FROM OLD."eventId" THEN NEW."eventId" ELSE i."eventId" END,
      "scheduleId" = CASE WHEN NEW."scheduleId" IS DISTINCT FROM OLD."scheduleId" AND i."scheduleId" IS NOT DISTINCT FROM OLD."scheduleId" THEN NEW."scheduleId" ELSE i."scheduleId" END,
      "presetId" = CASE WHEN NEW."presetId" IS DISTINCT FROM OLD."presetId" AND i."presetId" IS NOT DISTINCT FROM OLD."presetId" THEN NEW."presetId" ELSE i."presetId" END,
      "assigneeId" = CASE WHEN NEW."assigneeId" IS DISTINCT FROM OLD."assigneeId" AND i."assigneeId" IS NOT DISTINCT FROM OLD."assigneeId" THEN NEW."assigneeId" ELSE i."assigneeId" END,
      "updatedAt" = CASE WHEN NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt" AND i."updatedAt" IS NOT DISTINCT FROM OLD."updatedAt" THEN NEW."updatedAt" ELSE i."updatedAt" END,
      "congregationId" = CASE WHEN NEW."congregationId" IS DISTINCT FROM OLD."congregationId" AND i."congregationId" IS NOT DISTINCT FROM OLD."congregationId" THEN NEW."congregationId" ELSE i."congregationId" END,
      "templateItemId" = CASE WHEN NEW."servicePartId" IS DISTINCT FROM OLD."servicePartId" AND i."templateItemId" IS NOT DISTINCT FROM (SELECT ti."id" FROM "TemplateItem" ti WHERE ti."legacyServiceId" = OLD."servicePartId") THEN (SELECT ti."id" FROM "TemplateItem" ti WHERE ti."legacyServiceId" = NEW."servicePartId") ELSE i."templateItemId" END
    WHERE i."legacyServiceId" = NEW."id";
  RETURN NEW;
END
$$;
