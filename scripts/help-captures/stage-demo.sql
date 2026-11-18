-- What the help's captures need beyond the demo seed (scripts/help-captures/README.md). Run it on the French scratch
-- database, before copying it into the English one; never on a real database.
DO $$ BEGIN
  IF current_database() NOT LIKE '%captures%' THEN RAISE EXCEPTION 'Not a capture database: %', current_database(); END IF;
END $$;

-- settings-bano, prospection-actions: the BANO file of the demo's department, so the field holds an address and
-- Prospection offers « Synchroniser… ». Nothing syncs from here: the captures never start a run.
INSERT INTO "Setting" (key, value, "congregationId")
SELECT 'bano-url', 'https://bano.openstreetmap.fr/data/bano-75.csv', c.id FROM "Congregation" c
WHERE NOT EXISTS (SELECT 1 FROM "Setting" s WHERE s.key = 'bano-url' AND s."congregationId" = c.id);

-- board-versions-panel: the first PDF document was replaced once, so its history has an older version to bring back.
WITH first_pdf AS (
  SELECT v."documentId", v.uri, v."thumbnailUri", v."uploadedById", v."congregationId"
  FROM "BoardDocumentVersion" v
  WHERE v."versionNumber" = 1
  ORDER BY v."documentId"
  LIMIT 1
), older AS (
  UPDATE "BoardDocumentVersion" v SET "createdAt" = now() - interval '30 days'
  FROM first_pdf WHERE v."documentId" = first_pdf."documentId" AND v."versionNumber" = 1
)
INSERT INTO "BoardDocumentVersion" ("documentId", uri, "thumbnailUri", "versionNumber", "uploadedById", "createdAt", "congregationId")
SELECT "documentId", uri, "thumbnailUri", 2, "uploadedById", now() - interval '3 days', "congregationId"
FROM first_pdf
WHERE NOT EXISTS (
  SELECT 1 FROM "BoardDocumentVersion" v WHERE v."documentId" = first_pdf."documentId" AND v."versionNumber" = 2
);

-- attendance-entry-card: a midweek meeting under way, so the entry card shows on the home page. It began a quarter of an
-- hour ago and another account already entered the hall count, as when two people share the entry. Take the capture
-- within the hour, and the same day.
WITH midweek AS (
  SELECT t.id, t.name, t."congregationId" FROM "EventTemplate" t WHERE t."attendanceKind" = 'midweek' ORDER BY t.id LIMIT 1
), meeting AS (
  INSERT INTO "Event" (name, "startDate", "endDate", status, "templateId", "congregationId", "updatedAt")
  SELECT name, now() - interval '15 minutes', now() + interval '90 minutes', 'released', id, "congregationId", now()
  FROM midweek
  WHERE NOT EXISTS (
    SELECT 1 FROM "Event" e WHERE e."templateId" = midweek.id AND e."startDate" <= now() AND e."endDate" > now()
  )
  RETURNING id, "congregationId"
)
INSERT INTO "Attendance" ("eventId", "inPerson", "inPersonById", "inPersonAt", "congregationId", "updatedAt")
SELECT meeting.id, 84, u.id, now() - interval '5 minutes', meeting."congregationId", now()
FROM meeting JOIN "UserAccount" u ON u.email = 'maxime.mensah@demo.unitae.app';
