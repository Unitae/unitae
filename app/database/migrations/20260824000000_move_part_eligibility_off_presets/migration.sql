-- Eligibility (which roles may fill a slot) moves off the part kind and back
-- onto the parts themselves. Trying the preset feature showed the kind is the
-- wrong granularity: two parts of the same kind — two "Sujet VCM" — can
-- legitimately belong to different populations depending on where they sit in
-- the programme. The kind keeps capability only (reader slot, labels,
-- external-speaker rule, share message).
--
-- Step 1 makes the change neutral *for eligibility*: under the old rule a kind
-- with roles configured for a slot decided that slot and the part's own rows
-- lay dormant. Materialize that effective answer into the part rows before the
-- preset rows disappear, so no existing part's eligibility widens or narrows.
-- Step 2 is not neutral in one respect — see the allowExternalSpeaker note
-- there.

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
--
-- One thing does change for existing parts, and the neutrality claim above
-- does not cover it: the three kinds disagreed on allowExternalSpeaker
-- (Joyaux and Perles said no, Vie chrétienne said yes), and one merged kind
-- can only hold one answer. It keeps yes, so parts that were Joyaux or Perles
-- start offering the external-speaker option.
--
-- Widening deliberately rather than narrowing: the flag only decides whether
-- the picker offers an external speaker, and nothing enforces it at assignment
-- time. Answering no would have withdrawn the option from parts that were Vie
-- chrétienne and hidden anyone already assigned that way.

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
