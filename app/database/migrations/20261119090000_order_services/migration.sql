-- Services get an order of their own, set by dragging them, as parts already have: on templates (the order new
-- programmes start with) and on events (that meeting only). No change in what anyone may do; until now services had no
-- order, and the board printed them as the database returned them.
--
-- 1. The columns. Rows the previous image writes during the rollout get 0 and sort first by id until the next drag.
ALTER TABLE "TemplateServicePart" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EventServicePart" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;

-- 2. Existing services keep the order they were created in, five apart like the parts a drag writes.
UPDATE "TemplateServicePart" AS service
SET "order" = ranked.position
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "templateId" ORDER BY "id") - 1) * 5 AS position
  FROM "TemplateServicePart"
) AS ranked
WHERE service."id" = ranked."id";

UPDATE "EventServicePart" AS service
SET "order" = ranked.position
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "eventId" ORDER BY "id") - 1) * 5 AS position
  FROM "EventServicePart"
) AS ranked
WHERE service."id" = ranked."id";
