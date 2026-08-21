-- PartPreset: what a programme part *is* and what it *can do*.
--
-- Three layers, deliberately separated:
--   PartPreset   — identity + capability (reader slot, slot labels, external
--                  speaker eligibility, share message). Never overridable.
--   TemplatePart — defaults (name, section, duration), overridable on a part.
--   EventPart    — the instance.
--
-- Every column is nullable or defaulted so this migration is additive: existing
-- parts get presetId NULL and keep behaving exactly as before. Backfill of the
-- seeded kinds runs separately.

-- CreateTable
CREATE TABLE "PartPreset" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'part',
    "hasReaderSlot" BOOLEAN NOT NULL DEFAULT false,
    "speakerLabel" TEXT,
    "readerLabel" TEXT,
    "allowExternalSpeaker" BOOLEAN NOT NULL DEFAULT false,
    "shareMessage" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartPresetAllowedRole" (
    "presetId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "asKind" TEXT NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "PartPresetAllowedRole_pkey" PRIMARY KEY ("presetId","roleId","asKind")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartPreset_key_congregationId_key" ON "PartPreset"("key", "congregationId");
CREATE UNIQUE INDEX "PartPreset_id_congregationId_key" ON "PartPreset"("id", "congregationId");
CREATE INDEX "PartPreset_congregationId_idx" ON "PartPreset"("congregationId");
CREATE INDEX "PartPresetAllowedRole_roleId_idx" ON "PartPresetAllowedRole"("roleId");
CREATE INDEX "PartPresetAllowedRole_congregationId_idx" ON "PartPresetAllowedRole"("congregationId");

-- AddForeignKey
ALTER TABLE "PartPreset" ADD CONSTRAINT "PartPreset_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartPresetAllowedRole" ADD CONSTRAINT "PartPresetAllowedRole_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PartPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartPresetAllowedRole" ADD CONSTRAINT "PartPresetAllowedRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartPresetAllowedRole" ADD CONSTRAINT "PartPresetAllowedRole_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: link the four assignment tables to their kind.
-- SET NULL on delete, matching the existing EventPart.partId behaviour: losing
-- a preset must never cascade away real programme history.
ALTER TABLE "TemplatePart" ADD COLUMN "presetId" INTEGER;
ALTER TABLE "TemplateServicePart" ADD COLUMN "presetId" INTEGER;
ALTER TABLE "EventPart" ADD COLUMN "presetId" INTEGER;
ALTER TABLE "EventServicePart" ADD COLUMN "presetId" INTEGER;

ALTER TABLE "TemplatePart" ADD CONSTRAINT "TemplatePart_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PartPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TemplateServicePart" ADD CONSTRAINT "TemplateServicePart_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PartPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventPart" ADD CONSTRAINT "EventPart_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PartPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventServicePart" ADD CONSTRAINT "EventServicePart_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PartPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK-backing indexes, per the convention established in 20260820000000_add_missing_fk_indexes.
CREATE INDEX "TemplatePart_presetId_idx" ON "TemplatePart"("presetId");
CREATE INDEX "TemplateServicePart_presetId_idx" ON "TemplateServicePart"("presetId");
CREATE INDEX "EventPart_presetId_idx" ON "EventPart"("presetId");
CREATE INDEX "EventServicePart_presetId_idx" ON "EventServicePart"("presetId");

-- Row-Level Security
-- CASE/WHEN rather than OR — the planner may reorder OR branches and leak rows.
-- See docs/development/row-level-security.md.
ALTER TABLE "PartPreset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartPreset" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PartPreset" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

ALTER TABLE "PartPresetAllowedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartPresetAllowedRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PartPresetAllowedRole" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
