-- The `Member.type` column caches a member's standing pioneer status; `PioneerEnrolment` is the
-- source of truth for the same fact. The role sync now derives the status from the stints, so any
-- member carrying a pioneer type with no stint at all would silently lose their pioneer role.
--
-- Contract: no change in who is a pioneer. For every such member, open one ongoing stint of their
-- cached type, starting at the first month they ever reported activity (their history is the best
-- evidence of when the appointment began) and falling back to the current service year's September
-- when they have never reported.
--
-- Members whose type is 'normal', and members who already have any stint, are untouched — the
-- latter makes this idempotent, and matches backfillMemberEnrolments in
-- pioneer-enrolment-backfill.server.ts, which skips a member with existing stints for the same
-- reason. A single-month auxiliary is deliberately NOT represented here: those never set
-- Member.type, so they cannot appear in this population.

INSERT INTO "PioneerEnrolment" (
  "memberId", "congregationId", "type", "startMonth", "startYear", "endMonth", "endYear",
  "monthlyGoal", "createdAt", "updatedAt"
)
SELECT
  m."id",
  m."congregationId",
  m."type",
  COALESCE(first_activity."month", 8) AS "startMonth",
  COALESCE(
    first_activity."year",
    -- Service year runs Sept…Aug, so before September the current service year began last year.
    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9
      THEN EXTRACT(YEAR FROM CURRENT_DATE)
      ELSE EXTRACT(YEAR FROM CURRENT_DATE) - 1
    END
  )::int AS "startYear",
  NULL, NULL, NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Member" m
-- LEFT JOIN, never INNER: a member with no reported activity must still get a stint, otherwise
-- the drop of Member.type would revoke their role with no trace.
LEFT JOIN LATERAL (
  SELECT a."month", a."year"
  FROM "PublisherActivity" a
  WHERE a."publisherId" = m."id" AND a."congregationId" = m."congregationId"
  ORDER BY a."year" ASC, a."month" ASC
  LIMIT 1
) AS first_activity ON TRUE
WHERE m."type" <> 'normal'
  -- Anonymized members are excluded, and only them. Anonymizing is terminal (the aggregate refuses
  -- to run twice) and always sets leftAt, so they can never hold the role again under either model.
  -- Members who merely LEFT are still enrolled: the old predicate was `leftAt IS NULL AND type <>
  -- normal`, so clearing leftAt restored their pioneer role — skipping them would change behaviour
  -- on return rather than preserve it.
  AND m."anonymizedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "PioneerEnrolment" e
    WHERE e."memberId" = m."id" AND e."congregationId" = m."congregationId"
  );
