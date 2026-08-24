-- Eligibility (which roles may fill a slot) moves off the part kind and back
-- onto the parts themselves. Trying the preset feature showed the kind is the
-- wrong granularity: two parts of the same kind — two "Sujet VCM" — can
-- legitimately belong to different populations depending on where they sit in
-- the programme. The kind keeps capability only (reader slot, labels,
-- external-speaker rule, share message).
--
-- Step 1 makes the change behaviour-neutral: under the old rule a kind with
-- roles configured for a slot decided that slot and the part's own rows lay
-- dormant. Materialize that effective answer into the part rows before the
-- preset rows disappear, so no existing part widens or narrows.

DELETE FROM "TemplatePartAllowedRole" tpar
USING "TemplatePart" tp
WHERE tpar."partId" = tp."id"
  AND EXISTS (
    SELECT 1 FROM "PartPresetAllowedRole" ppar
    WHERE ppar."presetId" = tp."presetId" AND ppar."asKind" = tpar."asKind"
  );

INSERT INTO "TemplatePartAllowedRole" ("partId", "roleId", "asKind", "congregationId")
SELECT tp."id", ppar."roleId", ppar."asKind", tp."congregationId"
FROM "TemplatePart" tp
JOIN "PartPresetAllowedRole" ppar ON ppar."presetId" = tp."presetId"
ON CONFLICT DO NOTHING;

DELETE FROM "EventPartAllowedRole" epar
USING "EventPart" ep
WHERE epar."eventPartId" = ep."id"
  AND EXISTS (
    SELECT 1 FROM "PartPresetAllowedRole" ppar
    WHERE ppar."presetId" = ep."presetId" AND ppar."asKind" = epar."asKind"
  );

INSERT INTO "EventPartAllowedRole" ("eventPartId", "roleId", "asKind", "congregationId")
SELECT ep."id", ppar."roleId", ppar."asKind", ep."congregationId"
FROM "EventPart" ep
JOIN "PartPresetAllowedRole" ppar ON ppar."presetId" = ep."presetId"
ON CONFLICT DO NOTHING;

DROP TABLE "PartPresetAllowedRole";

-- Step 2: with eligibility gone, nothing distinguishes the three seeded
-- midweek talk kinds (Joyaux, Perles, Vie chrétienne) any more — merge them
-- into one "Sujet VCM" kind. Custom wording stored on the old rows (a rename
-- or an edited share message) is dropped; the merged kind starts on the
-- catalogue defaults.

INSERT INTO "PartPreset" ("key", "scope", "hasReaderSlot", "allowExternalSpeaker", "isSystem", "congregationId", "updatedAt")
SELECT 'midweek-talk', 'part', false, true, true, c."id", CURRENT_TIMESTAMP
FROM "Congregation" c
ON CONFLICT ("key", "congregationId") DO NOTHING;

UPDATE "TemplatePart" tp
SET "presetId" = np."id"
FROM "PartPreset" op, "PartPreset" np
WHERE tp."presetId" = op."id"
  AND op."isSystem" = true
  AND op."key" IN ('spiritual-gems', 'spiritual-pearls', 'christian-life-talk')
  AND np."key" = 'midweek-talk'
  AND np."congregationId" = op."congregationId";

UPDATE "EventPart" ep
SET "presetId" = np."id"
FROM "PartPreset" op, "PartPreset" np
WHERE ep."presetId" = op."id"
  AND op."isSystem" = true
  AND op."key" IN ('spiritual-gems', 'spiritual-pearls', 'christian-life-talk')
  AND np."key" = 'midweek-talk'
  AND np."congregationId" = op."congregationId";

DELETE FROM "PartPreset"
WHERE "isSystem" = true
  AND "key" IN ('spiritual-gems', 'spiritual-pearls', 'christian-life-talk');
