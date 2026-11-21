-- Parts and duties become one kind of item (plan T12, spec D36): TemplateItem and Item, each with its allowed roles
-- per slot, beside the eight old item tables. Triggers copy every write of the old tables into the new ones, and the
-- last steps copy what exists. No reader or writer changes: nobody can see a difference.

-- 1. Tables.
CREATE TABLE "TemplateItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT,
    "section" TEXT NOT NULL DEFAULT '',
    "track" TEXT NOT NULL DEFAULT '',
    "trackOrder" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "durationMin" INTEGER,
    "allowExternalSpeaker" BOOLEAN NOT NULL DEFAULT false,
    "speakerLabel" TEXT,
    "readerLabel" TEXT,
    "templateId" INTEGER,
    "scheduleTemplateId" INTEGER,
    "presetId" INTEGER,
    "legacyPartId" INTEGER,
    "legacyServiceId" INTEGER,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "TemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateItemAllowedRole" (
    "itemId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "TemplateItemAllowedRole_pkey" PRIMARY KEY ("itemId","roleId","slot")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "topic" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT NOT NULL DEFAULT '',
    "track" TEXT NOT NULL DEFAULT '',
    "trackOrder" INTEGER,
    "durationMin" INTEGER,
    "speakerLabel" TEXT,
    "readerLabel" TEXT,
    "eventId" INTEGER NOT NULL,
    "scheduleId" INTEGER,
    "templateItemId" INTEGER,
    "presetId" INTEGER,
    "assigneeId" INTEGER,
    "assistantId" INTEGER,
    "allowExternalSpeaker" BOOLEAN NOT NULL DEFAULT false,
    "externalSpeakerId" INTEGER,
    "legacyPartId" INTEGER,
    "legacyServiceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemAllowedRole" (
    "itemId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ItemAllowedRole_pkey" PRIMARY KEY ("itemId","roleId","slot")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateItem_legacyPartId_key" ON "TemplateItem"("legacyPartId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateItem_legacyServiceId_key" ON "TemplateItem"("legacyServiceId");

-- CreateIndex
CREATE INDEX "TemplateItem_templateId_idx" ON "TemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "TemplateItem_scheduleTemplateId_idx" ON "TemplateItem"("scheduleTemplateId");

-- CreateIndex
CREATE INDEX "TemplateItem_presetId_idx" ON "TemplateItem"("presetId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateItem_id_congregationId_key" ON "TemplateItem"("id", "congregationId");

-- CreateIndex
CREATE INDEX "TemplateItemAllowedRole_roleId_idx" ON "TemplateItemAllowedRole"("roleId");

-- CreateIndex
CREATE INDEX "TemplateItemAllowedRole_congregationId_idx" ON "TemplateItemAllowedRole"("congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_legacyPartId_key" ON "Item"("legacyPartId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_legacyServiceId_key" ON "Item"("legacyServiceId");

-- CreateIndex
CREATE INDEX "Item_eventId_idx" ON "Item"("eventId");

-- CreateIndex
CREATE INDEX "Item_scheduleId_idx" ON "Item"("scheduleId");

-- CreateIndex
CREATE INDEX "Item_templateItemId_idx" ON "Item"("templateItemId");

-- CreateIndex
CREATE INDEX "Item_presetId_idx" ON "Item"("presetId");

-- CreateIndex
CREATE INDEX "Item_externalSpeakerId_idx" ON "Item"("externalSpeakerId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_id_congregationId_key" ON "Item"("id", "congregationId");

-- CreateIndex
CREATE INDEX "ItemAllowedRole_roleId_idx" ON "ItemAllowedRole"("roleId");

-- CreateIndex
CREATE INDEX "ItemAllowedRole_congregationId_idx" ON "ItemAllowedRole"("congregationId");

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PartPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItemAllowedRole" ADD CONSTRAINT "TemplateItemAllowedRole_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItemAllowedRole" ADD CONSTRAINT "TemplateItemAllowedRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItemAllowedRole" ADD CONSTRAINT "TemplateItemAllowedRole_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_scheduleId_eventId_fkey" FOREIGN KEY ("scheduleId", "eventId") REFERENCES "Schedule"("id", "eventId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "TemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PartPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_externalSpeakerId_fkey" FOREIGN KEY ("externalSpeakerId") REFERENCES "ExternalSpeaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAllowedRole" ADD CONSTRAINT "ItemAllowedRole_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAllowedRole" ADD CONSTRAINT "ItemAllowedRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAllowedRole" ADD CONSTRAINT "ItemAllowedRole_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Constraints Prisma cannot express.
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_legacy_check"
  CHECK (num_nonnulls("legacyPartId", "legacyServiceId") <= 1);
ALTER TABLE "Item" ADD CONSTRAINT "Item_legacy_check"
  CHECK (num_nonnulls("legacyPartId", "legacyServiceId") <= 1);
ALTER TABLE "TemplateItemAllowedRole" ADD CONSTRAINT "TemplateItemAllowedRole_slot_check"
  CHECK ("slot" IN ('main', 'second'));
ALTER TABLE "ItemAllowedRole" ADD CONSTRAINT "ItemAllowedRole_slot_check"
  CHECK ("slot" IN ('main', 'second'));

-- 3. Tenant isolation, as on every tenant table.
ALTER TABLE "TemplateItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TemplateItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TemplateItem";
CREATE POLICY tenant_isolation ON "TemplateItem" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "TemplateItemAllowedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TemplateItemAllowedRole" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TemplateItemAllowedRole";
CREATE POLICY tenant_isolation ON "TemplateItemAllowedRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Item" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Item";
CREATE POLICY tenant_isolation ON "Item" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "ItemAllowedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ItemAllowedRole" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ItemAllowedRole";
CREATE POLICY tenant_isolation ON "ItemAllowedRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- 4. Triggers keep the new tables in step with the old ones until the writers move over (plan T12): every insert,
--    update and delete of an old item or allowed role, from the app, from a foreign key's cascade or SET NULL, from the
--    previous image or from another service, lands in the new table. Upserts on the legacy keys, so a trigger and the
--    backfill below meet whatever their order. They run as the writer, under its tenant scope. An `asKind` other than
--    speaker / reader maps to no slot and fails the write rather than land in the wrong one.

CREATE OR REPLACE FUNCTION "mirror_template_part"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "TemplateItem" WHERE "legacyPartId" = OLD."id";
    RETURN OLD;
  END IF;
  INSERT INTO "TemplateItem" ("name", "section", "track", "trackOrder", "order", "durationMin", "allowExternalSpeaker", "speakerLabel", "readerLabel", "templateId", "scheduleTemplateId", "presetId", "legacyPartId", "congregationId")
    VALUES (NEW."name", NEW."section", NEW."track", NEW."trackOrder", NEW."order", NEW."durationMin", NEW."allowExternalSpeaker", NEW."speakerLabel", NEW."readerLabel", NEW."templateId", NEW."scheduleTemplateId", NEW."presetId", NEW."id", NEW."congregationId")
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
      "presetId" = EXCLUDED."presetId";
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "mirror_template_service_part"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "TemplateItem" WHERE "legacyServiceId" = OLD."id";
    RETURN OLD;
  END IF;
  INSERT INTO "TemplateItem" ("name", "key", "order", "templateId", "scheduleTemplateId", "presetId", "legacyServiceId", "congregationId")
    VALUES (NEW."name", NEW."key", NEW."order", NEW."templateId", NEW."scheduleTemplateId", NEW."presetId", NEW."id", NEW."congregationId")
    ON CONFLICT ("legacyServiceId") DO UPDATE SET
      "name" = EXCLUDED."name",
      "key" = EXCLUDED."key",
      "order" = EXCLUDED."order",
      "templateId" = EXCLUDED."templateId",
      "scheduleTemplateId" = EXCLUDED."scheduleTemplateId",
      "presetId" = EXCLUDED."presetId";
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "mirror_event_part"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "Item" WHERE "legacyPartId" = OLD."id";
    RETURN OLD;
  END IF;
  INSERT INTO "Item" ("name", "order", "topic", "note", "hasConflict", "section", "track", "trackOrder", "durationMin", "speakerLabel", "readerLabel", "eventId", "scheduleId", "templateItemId", "presetId", "assigneeId", "assistantId", "allowExternalSpeaker", "externalSpeakerId", "updatedAt", "createdAt", "legacyPartId", "congregationId")
    VALUES (NEW."name", NEW."order", NEW."topic", NEW."note", NEW."hasConflict", NEW."section", NEW."track", NEW."trackOrder", NEW."durationMin", NEW."speakerLabel", NEW."readerLabel", NEW."eventId", NEW."scheduleId", (SELECT ti."id" FROM "TemplateItem" ti WHERE ti."legacyPartId" = NEW."partId"), NEW."presetId", NEW."assigneeId", NEW."assistantId", NEW."allowExternalSpeaker", NEW."externalSpeakerId", NEW."updatedAt", NEW."createdAt", NEW."id", NEW."congregationId")
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
      "updatedAt" = EXCLUDED."updatedAt";
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "mirror_event_service_part"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "Item" WHERE "legacyServiceId" = OLD."id";
    RETURN OLD;
  END IF;
  INSERT INTO "Item" ("name", "order", "note", "hasConflict", "eventId", "scheduleId", "templateItemId", "presetId", "assigneeId", "updatedAt", "createdAt", "legacyServiceId", "congregationId")
    VALUES (NEW."name", NEW."order", NEW."note", NEW."hasConflict", NEW."eventId", NEW."scheduleId", (SELECT ti."id" FROM "TemplateItem" ti WHERE ti."legacyServiceId" = NEW."servicePartId"), NEW."presetId", NEW."assigneeId", NEW."updatedAt", NEW."createdAt", NEW."id", NEW."congregationId")
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
      "updatedAt" = EXCLUDED."updatedAt";
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "mirror_template_part_allowed_role"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    DELETE FROM "TemplateItemAllowedRole" r
      USING "TemplateItem" ti
      WHERE ti."legacyPartId" = OLD."partId" AND r."itemId" = ti."id" AND r."roleId" = OLD."roleId"
        AND r."slot" = CASE OLD."asKind" WHEN 'speaker' THEN 'main' WHEN 'reader' THEN 'second' END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  INSERT INTO "TemplateItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
    SELECT ti."id", NEW."roleId", CASE NEW."asKind" WHEN 'speaker' THEN 'main' WHEN 'reader' THEN 'second' END, NEW."congregationId"
    FROM "TemplateItem" ti WHERE ti."legacyPartId" = NEW."partId"
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "mirror_template_service_part_allowed_role"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    DELETE FROM "TemplateItemAllowedRole" r
      USING "TemplateItem" ti
      WHERE ti."legacyServiceId" = OLD."servicePartId" AND r."itemId" = ti."id" AND r."roleId" = OLD."roleId"
        AND r."slot" = 'main';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  INSERT INTO "TemplateItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
    SELECT ti."id", NEW."roleId", 'main', NEW."congregationId"
    FROM "TemplateItem" ti WHERE ti."legacyServiceId" = NEW."servicePartId"
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "mirror_event_part_allowed_role"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    DELETE FROM "ItemAllowedRole" r
      USING "Item" i
      WHERE i."legacyPartId" = OLD."eventPartId" AND r."itemId" = i."id" AND r."roleId" = OLD."roleId"
        AND r."slot" = CASE OLD."asKind" WHEN 'speaker' THEN 'main' WHEN 'reader' THEN 'second' END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  INSERT INTO "ItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
    SELECT i."id", NEW."roleId", CASE NEW."asKind" WHEN 'speaker' THEN 'main' WHEN 'reader' THEN 'second' END, NEW."congregationId"
    FROM "Item" i WHERE i."legacyPartId" = NEW."eventPartId"
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "mirror_event_service_part_allowed_role"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    DELETE FROM "ItemAllowedRole" r
      USING "Item" i
      WHERE i."legacyServiceId" = OLD."eventServicePartId" AND r."itemId" = i."id" AND r."roleId" = OLD."roleId"
        AND r."slot" = 'main';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  INSERT INTO "ItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
    SELECT i."id", NEW."roleId", 'main', NEW."congregationId"
    FROM "Item" i WHERE i."legacyServiceId" = NEW."eventServicePartId"
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "TemplatePart_mirror" ON "TemplatePart";
CREATE TRIGGER "TemplatePart_mirror" AFTER INSERT OR UPDATE OR DELETE ON "TemplatePart"
  FOR EACH ROW EXECUTE FUNCTION "mirror_template_part"();
DROP TRIGGER IF EXISTS "TemplateServicePart_mirror" ON "TemplateServicePart";
CREATE TRIGGER "TemplateServicePart_mirror" AFTER INSERT OR UPDATE OR DELETE ON "TemplateServicePart"
  FOR EACH ROW EXECUTE FUNCTION "mirror_template_service_part"();
DROP TRIGGER IF EXISTS "EventPart_mirror" ON "EventPart";
CREATE TRIGGER "EventPart_mirror" AFTER INSERT OR UPDATE OR DELETE ON "EventPart"
  FOR EACH ROW EXECUTE FUNCTION "mirror_event_part"();
DROP TRIGGER IF EXISTS "EventServicePart_mirror" ON "EventServicePart";
CREATE TRIGGER "EventServicePart_mirror" AFTER INSERT OR UPDATE OR DELETE ON "EventServicePart"
  FOR EACH ROW EXECUTE FUNCTION "mirror_event_service_part"();
DROP TRIGGER IF EXISTS "TemplatePartAllowedRole_mirror" ON "TemplatePartAllowedRole";
CREATE TRIGGER "TemplatePartAllowedRole_mirror" AFTER INSERT OR UPDATE OR DELETE ON "TemplatePartAllowedRole"
  FOR EACH ROW EXECUTE FUNCTION "mirror_template_part_allowed_role"();
DROP TRIGGER IF EXISTS "TemplateServicePartAllowedRole_mirror" ON "TemplateServicePartAllowedRole";
CREATE TRIGGER "TemplateServicePartAllowedRole_mirror" AFTER INSERT OR UPDATE OR DELETE ON "TemplateServicePartAllowedRole"
  FOR EACH ROW EXECUTE FUNCTION "mirror_template_service_part_allowed_role"();
DROP TRIGGER IF EXISTS "EventPartAllowedRole_mirror" ON "EventPartAllowedRole";
CREATE TRIGGER "EventPartAllowedRole_mirror" AFTER INSERT OR UPDATE OR DELETE ON "EventPartAllowedRole"
  FOR EACH ROW EXECUTE FUNCTION "mirror_event_part_allowed_role"();
DROP TRIGGER IF EXISTS "EventServicePartAllowedRole_mirror" ON "EventServicePartAllowedRole";
CREATE TRIGGER "EventServicePartAllowedRole_mirror" AFTER INSERT OR UPDATE OR DELETE ON "EventServicePartAllowedRole"
  FOR EACH ROW EXECUTE FUNCTION "mirror_event_service_part_allowed_role"();

-- backfill: everything below re-runs as is (plan T7); the migration test replays it from this marker.

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
  "presetId" = EXCLUDED."presetId";

INSERT INTO "TemplateItem" ("name", "key", "order", "templateId", "scheduleTemplateId", "presetId", "legacyServiceId", "congregationId")
SELECT s."name", s."key", s."order", s."templateId", s."scheduleTemplateId", s."presetId", s."id", s."congregationId"
FROM "TemplateServicePart" s
ON CONFLICT ("legacyServiceId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "key" = EXCLUDED."key",
  "order" = EXCLUDED."order",
  "templateId" = EXCLUDED."templateId",
  "scheduleTemplateId" = EXCLUDED."scheduleTemplateId",
  "presetId" = EXCLUDED."presetId";

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
  "updatedAt" = EXCLUDED."updatedAt";

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
  "updatedAt" = EXCLUDED."updatedAt";

-- 7. Allowed roles: a part's speaker is the main slot, its reader the second; a service's single list is the main slot.
INSERT INTO "TemplateItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
SELECT ti."id", r."roleId", CASE r."asKind" WHEN 'speaker' THEN 'main' WHEN 'reader' THEN 'second' END, r."congregationId"
FROM "TemplatePartAllowedRole" r
JOIN "TemplateItem" ti ON ti."legacyPartId" = r."partId"
ON CONFLICT DO NOTHING;

INSERT INTO "TemplateItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
SELECT ti."id", r."roleId", 'main', r."congregationId"
FROM "TemplateServicePartAllowedRole" r
JOIN "TemplateItem" ti ON ti."legacyServiceId" = r."servicePartId"
ON CONFLICT DO NOTHING;

INSERT INTO "ItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
SELECT i."id", r."roleId", CASE r."asKind" WHEN 'speaker' THEN 'main' WHEN 'reader' THEN 'second' END, r."congregationId"
FROM "EventPartAllowedRole" r
JOIN "Item" i ON i."legacyPartId" = r."eventPartId"
ON CONFLICT DO NOTHING;

INSERT INTO "ItemAllowedRole" ("itemId", "roleId", "slot", "congregationId")
SELECT i."id", r."roleId", 'main', r."congregationId"
FROM "EventServicePartAllowedRole" r
JOIN "Item" i ON i."legacyServiceId" = r."eventServicePartId"
ON CONFLICT DO NOTHING;
