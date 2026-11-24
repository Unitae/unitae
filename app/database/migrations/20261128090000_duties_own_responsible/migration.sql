-- A duties schedule template answers for itself: its responsible is its kind's services responsible, or none, never
-- the programme's (decided 2026-11-24). Until now the derivation gave the duties the programme's responsible when the
-- kind named no services one. Nobody's rights move at upgrade (decided 2026-11-24): where the duties inherit today, the
-- inherited role is written once as the kind's services responsible, after which « Aucun » is a real choice. A
-- template no kind suggests holds its role alone and is left as it is; one two kinds suggest takes the first kind's.

-- 1. A kind with a duties template, a programme responsible and no services one: the programme's role, written once.
INSERT INTO "TemplateResponsible" ("templateId", "roleId", "scope", "congregationId")
SELECT DISTINCT programme."templateId", programme."roleId", 'service', programme."congregationId"
FROM "TemplateResponsible" AS programme
JOIN "EventKindScheduleTemplate" AS link ON link."eventKindId" = programme."templateId"
JOIN "ScheduleTemplate" AS st ON st."id" = link."scheduleTemplateId" AND st."kind" = 'duty'
WHERE programme."scope" = 'programme'
  AND NOT EXISTS (
    SELECT 1 FROM "TemplateResponsible" AS service
    WHERE service."templateId" = programme."templateId" AND service."scope" = 'service'
  )
ON CONFLICT ("templateId", "scope", "congregationId") DO NOTHING;

-- 2. Each duties template linked to a kind takes that kind's services responsible (null without one).
UPDATE "ScheduleTemplate" AS st
SET "responsibleRoleId" = derived."roleId",
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (link."scheduleTemplateId") link."scheduleTemplateId", service."roleId"
  FROM "EventKindScheduleTemplate" AS link
  LEFT JOIN "TemplateResponsible" AS service
    ON service."templateId" = link."eventKindId" AND service."scope" = 'service'
  ORDER BY link."scheduleTemplateId", link."eventKindId"
) AS derived
WHERE st."id" = derived."scheduleTemplateId"
  AND st."kind" = 'duty'
  AND st."responsibleRoleId" IS DISTINCT FROM derived."roleId";
