-- External speakers: a congregation becomes a record instead of a text typed on each speaker.
--
-- Contract: every speaker keeps its congregation, now as a link to one SpeakerCongregation per spelling of the name
-- (case, accents, spaces and hyphens ignored); a speaker with no congregation text stays unlinked (« Sans assemblée »).
-- Nothing is removed: "congregationName" stays, written as a mirror by the new code, for a server still running the
-- previous version.

-- =========================================================================
-- 1. Speaker columns: a second phone and e-mail, talk numbers, the link, the anonymisation date
-- =========================================================================

ALTER TABLE "ExternalSpeaker" ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ADD COLUMN     "email2" TEXT,
ADD COLUMN     "phone2" TEXT,
ADD COLUMN     "speakerCongregationId" INTEGER,
ADD COLUMN     "talks" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- =========================================================================
-- 2. SpeakerCongregation, tenant-scoped like every table
-- =========================================================================

CREATE TABLE "SpeakerCongregation" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "responsibleName" TEXT NOT NULL DEFAULT '',
    "responsiblePhone" TEXT NOT NULL DEFAULT '',
    "responsibleEmail" TEXT NOT NULL DEFAULT '',
    "coordinatorName" TEXT NOT NULL DEFAULT '',
    "coordinatorPhone" TEXT NOT NULL DEFAULT '',
    "coordinatorEmail" TEXT NOT NULL DEFAULT '',
    "listDate" TIMESTAMP(3),
    "listFileKey" TEXT,
    "listFileName" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "SpeakerCongregation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpeakerCongregation_id_congregationId_key" ON "SpeakerCongregation"("id", "congregationId");

CREATE UNIQUE INDEX "SpeakerCongregation_congregationId_nameNormalized_key" ON "SpeakerCongregation"("congregationId", "nameNormalized");

CREATE INDEX "ExternalSpeaker_speakerCongregationId_idx" ON "ExternalSpeaker"("speakerCongregationId");

ALTER TABLE "ExternalSpeaker" ADD CONSTRAINT "ExternalSpeaker_speakerCongregationId_fkey" FOREIGN KEY ("speakerCongregationId") REFERENCES "SpeakerCongregation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SpeakerCongregation" ADD CONSTRAINT "SpeakerCongregation_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpeakerCongregation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpeakerCongregation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SpeakerCongregation" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- =========================================================================
-- 3. One congregation per tenant and normalized name
--
-- The normalized name mirrors normalizeCongregationName() in
-- app/features/events/model/speaker-congregation-name.ts: typographic apostrophe → ', runs of spaces and hyphens
-- → one space, trimmed, lowercased, then the diacritic map of 20260606000000_add_normalized_search_columns. The two
-- must agree: the archive import replays the same grouping in TypeScript. Its display name is the spelling most
-- speakers use (alphabetical on a tie). Idempotent: a second run finds every name already there.
-- =========================================================================

INSERT INTO "SpeakerCongregation" ("name", "nameNormalized", "congregationId", "updatedAt")
SELECT DISTINCT ON (spelled."congregationId", spelled."norm")
  spelled."display", spelled."norm", spelled."congregationId", CURRENT_TIMESTAMP
FROM (
  SELECT named."congregationId", named."display", named."norm", count(*) AS "uses"
  FROM (
    SELECT
      "congregationId",
      btrim(regexp_replace("congregationName", '\s+', ' ', 'g')) AS "display",
      translate(
        lower(btrim(regexp_replace(replace("congregationName", '’', ''''), '[\s\-–]+', ' ', 'g'))),
        'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'
      ) AS "norm"
    FROM "ExternalSpeaker"
    WHERE btrim("congregationName") <> ''
  ) named
  GROUP BY named."congregationId", named."display", named."norm"
) spelled
ORDER BY spelled."congregationId", spelled."norm", spelled."uses" DESC, spelled."display"
ON CONFLICT ("congregationId", "nameNormalized") DO NOTHING;

-- =========================================================================
-- 4. Link each speaker to its congregation (only the ones not linked yet)
-- =========================================================================

UPDATE "ExternalSpeaker" speaker
SET "speakerCongregationId" = target."id"
FROM "SpeakerCongregation" target
WHERE speaker."speakerCongregationId" IS NULL
  AND btrim(speaker."congregationName") <> ''
  AND target."congregationId" = speaker."congregationId"
  AND target."nameNormalized" = translate(
    lower(btrim(regexp_replace(replace(speaker."congregationName", '’', ''''), '[\s\-–]+', ' ', 'g'))),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy'
  );
