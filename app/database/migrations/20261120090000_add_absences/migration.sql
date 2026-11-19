-- Absences become rows of their own, belonging to the person: their record when the account that declared them has
-- one, the account otherwise. No change in what anyone may do or see: every reader still reads the day-off events, and
-- the new image writes both until the readers move over. Each row keeps the event it was copied from until the events
-- are dropped.
--
-- 1. The table, its CHECK and the standard tenant policy.
CREATE TABLE IF NOT EXISTS "Absence" (
    "id" SERIAL NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "memberId" INTEGER,
    "accountId" INTEGER,
    "legacyEventId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- Somebody's: the person's record, or the account that declared it when there is none.
ALTER TABLE "Absence" DROP CONSTRAINT IF EXISTS "Absence_owner_check";
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_owner_check" CHECK ("memberId" IS NOT NULL OR "accountId" IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "Absence_legacyEventId_key" ON "Absence"("legacyEventId");
CREATE UNIQUE INDEX IF NOT EXISTS "Absence_id_congregationId_key" ON "Absence"("id", "congregationId");
CREATE INDEX IF NOT EXISTS "Absence_congregationId_startDate_idx" ON "Absence"("congregationId", "startDate");
CREATE INDEX IF NOT EXISTS "Absence_memberId_idx" ON "Absence"("memberId");
CREATE INDEX IF NOT EXISTS "Absence_accountId_idx" ON "Absence"("accountId");

ALTER TABLE "Absence" DROP CONSTRAINT IF EXISTS "Absence_memberId_fkey";
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Restrict: deleting an account lets go of its absences explicitly (releaseAccountEvents); any other path fails
-- clearly instead of breaking the CHECK.
ALTER TABLE "Absence" DROP CONSTRAINT IF EXISTS "Absence_accountId_fkey";
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Absence" DROP CONSTRAINT IF EXISTS "Absence_congregationId_fkey";
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Absence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Absence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Absence";
CREATE POLICY tenant_isolation ON "Absence" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- 2. One row per day-off event, as it is: its dates and note, the account that declared it, that account's record when
--    it has one. A day-off always has its account (Event.createdBy is Restrict); one without would break the CHECK, so
--    it is left out. Run again, it copies only what it has not copied yet.
INSERT INTO "Absence" ("startDate", "endDate", "note", "memberId", "accountId", "legacyEventId", "createdAt", "congregationId")
SELECT event."startDate", event."endDate", event."description", account."memberId", event."createdById", event."id",
       event."createdAt", event."congregationId"
FROM "Event" AS event
JOIN "EventTemplate" AS template
  ON template."id" = event."templateId" AND template."congregationId" = event."congregationId" AND template."key" = 'day-off'
JOIN "UserAccount" AS account ON account."id" = event."createdById"
ON CONFLICT ("legacyEventId") DO NOTHING;
