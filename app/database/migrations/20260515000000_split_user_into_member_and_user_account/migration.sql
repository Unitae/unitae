-- Split User into Member + UserAccount.
--
-- Member  = person currently part of this congregation (identity, demographics,
--           publisher status, lifecycle: leftAt + anonymizedAt).
-- UserAccount = login (email + password + tokens), optionally 1:1 with Member.
--
-- Designed so existing FK column VALUES never change. The old User.id space is
-- preserved as both Member.id and UserAccount.id; we drop and recreate FK
-- constraints to point at the right table (Member for domain FKs, UserAccount
-- for account-bound FKs).
--
-- See plan: /Users/mindsers/.claude/plans/plan-the-implementation-of-bright-sketch.md

-- =========================================================================
-- 1. Create Member table
-- =========================================================================

CREATE TABLE "Member" (
  "id"               SERIAL PRIMARY KEY,
  "congregationId"   INTEGER NOT NULL,
  "firstname"        TEXT NOT NULL,
  "lastname"         TEXT NOT NULL,
  "isMale"           BOOLEAN,
  "birthDate"        TIMESTAMP(3),
  "phone"            TEXT NOT NULL DEFAULT '',
  "address"          TEXT NOT NULL DEFAULT '',
  "isPublisher"      BOOLEAN NOT NULL DEFAULT false,
  "type"             "PublisherType" NOT NULL DEFAULT 'normal',
  "baptismDate"      TIMESTAMP(3),
  "isAnointed"       BOOLEAN NOT NULL DEFAULT false,
  "isHelder"         BOOLEAN NOT NULL DEFAULT false,
  "isServant"        BOOLEAN NOT NULL DEFAULT false,
  "publisherGroupId" INTEGER,
  "leftAt"           TIMESTAMP(3),
  "anonymizedAt"     TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Member_congregationId_fkey"
    FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "Member_publisherGroupId_fkey"
    FOREIGN KEY ("publisherGroupId") REFERENCES "PublisherGroup"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX "Member_id_congregationId_key" ON "Member"("id", "congregationId");
CREATE INDEX "Member_congregationId_leftAt_idx" ON "Member"("congregationId", "leftAt");

-- Domain invariants (CHECK constraints — JW domain rules from the plan)
ALTER TABLE "Member"
  ADD CONSTRAINT "member_servant_xor_elder"
    CHECK (NOT ("isHelder" AND "isServant")),
  ADD CONSTRAINT "member_anointed_requires_baptism"
    CHECK ("isAnointed" = false OR "baptismDate" IS NOT NULL),
  ADD CONSTRAINT "member_baptism_requires_publisher"
    CHECK ("baptismDate" IS NULL OR "isPublisher" = true),
  ADD CONSTRAINT "member_pioneer_requires_baptism"
    CHECK ("type" = 'normal' OR "baptismDate" IS NOT NULL),
  ADD CONSTRAINT "member_elder_requires_baptized_male"
    CHECK ("isHelder" = false OR ("baptismDate" IS NOT NULL AND "isMale" = true)),
  ADD CONSTRAINT "member_servant_requires_baptized_male"
    CHECK ("isServant" = false OR ("baptismDate" IS NOT NULL AND "isMale" = true));

-- RLS — same shape as every other tenant-scoped table
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Member" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- =========================================================================
-- 2. Create MemberRoleAssignment (sibling of UserRoleAssignment, for identity roles)
-- =========================================================================

CREATE TABLE "MemberRoleAssignment" (
  "memberId"        INTEGER NOT NULL,
  "roleId"          INTEGER NOT NULL,
  "congregationId"  INTEGER NOT NULL,
  CONSTRAINT "MemberRoleAssignment_pkey" PRIMARY KEY ("memberId", "roleId"),
  CONSTRAINT "MemberRoleAssignment_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "MemberRoleAssignment_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "MemberRoleAssignment_congregationId_fkey"
    FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "MemberRoleAssignment_congregationId_idx" ON "MemberRoleAssignment"("congregationId");
CREATE INDEX "MemberRoleAssignment_roleId_idx" ON "MemberRoleAssignment"("roleId");

ALTER TABLE "MemberRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberRoleAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MemberRoleAssignment" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- =========================================================================
-- 3. Backfill Member from User, preserving id values
-- =========================================================================
--
-- Heuristic: a User row that ever had publisher signals is treated as a Member.
-- Today's "leaver" pattern (isPublisher = false but had publisher data) sets
-- leftAt = User.updatedAt — the system time approximates when they left.
-- Operator must spot-check this against real data before running prod.

INSERT INTO "Member" (
  "id", "congregationId", "firstname", "lastname", "isMale", "birthDate",
  "phone", "address", "isPublisher", "type", "baptismDate", "isAnointed",
  "isHelder", "isServant", "publisherGroupId", "leftAt", "anonymizedAt",
  "createdAt", "updatedAt"
)
SELECT
  u."id",
  u."congregationId",
  COALESCE(u."firstname", ''),
  COALESCE(u."lastname", ''),
  u."isMale",
  u."birthDate",
  COALESCE(u."phone", ''),
  COALESCE(u."address", ''),
  u."isPublisher",
  u."type",
  u."baptismDate",
  u."isAnointed",
  u."isHelder",
  u."isServant",
  u."publisherGroupId",
  CASE
    WHEN u."isPublisher" = false AND (
      u."baptismDate" IS NOT NULL
      OR u."isHelder" OR u."isServant" OR u."isAnointed"
      OR EXISTS (SELECT 1 FROM "PublisherActivity" pa WHERE pa."publisherId" = u."id")
    ) THEN u."updatedAt"
    ELSE NULL
  END,
  u."anonymizedAt",
  u."createdAt",
  u."updatedAt"
FROM "User" u
WHERE
  u."isPublisher" = true
  OR u."baptismDate" IS NOT NULL
  OR u."isHelder" OR u."isServant" OR u."isAnointed"
  OR u."publisherGroupId" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "PublisherActivity" pa WHERE pa."publisherId" = u."id");

-- Sync sequence so future Member inserts don't collide with preserved ids
SELECT setval(
  pg_get_serial_sequence('"Member"', 'id'),
  COALESCE((SELECT MAX("id") FROM "Member"), 1)
);

-- =========================================================================
-- 4. Migrate identity-role assignments from UserRoleAssignment to MemberRoleAssignment
-- =========================================================================
--
-- Built-in identity roles (male, female, baptized, anointed, elder,
-- assistant-servant, publisher) move to MemberRoleAssignment when there's a
-- corresponding Member. Custom and management roles (which include any non-
-- built-in role) stay on UserRoleAssignment.
--
-- The `male`/`female` keys are dropped by the application-layer seed update
-- (replaced by `brother`/`sister`); their assignments here are deleted, not
-- migrated.

INSERT INTO "MemberRoleAssignment" ("memberId", "roleId", "congregationId")
SELECT ura."userId", ura."roleId", ura."congregationId"
FROM "UserRoleAssignment" ura
JOIN "Role" r ON r."id" = ura."roleId"
JOIN "Member" m ON m."id" = ura."userId"
WHERE r."isBuiltIn" = true
  AND r."key" IN ('publisher', 'baptized', 'anointed', 'elder', 'assistant-servant')
ON CONFLICT DO NOTHING;

-- Delete migrated identity-role rows + obsolete male/female rows from UserRoleAssignment
DELETE FROM "UserRoleAssignment" ura
USING "Role" r
WHERE ura."roleId" = r."id"
  AND r."isBuiltIn" = true
  AND r."key" IN ('male', 'female', 'publisher', 'baptized', 'anointed', 'elder', 'assistant-servant');

-- Delete the obsolete built-in role rows themselves (male/female). The new role
-- keys (member, ministry-school-student, brother, sister, pioneer) get seeded
-- by the application's seedBuiltInRoles after this migration runs.
DELETE FROM "Role" WHERE "isBuiltIn" = true AND "key" IN ('male', 'female');

-- =========================================================================
-- 5. Pre-flight check: ensure no fake-email account holds an account-bound FK.
-- If any does, abort — it means a placeholder somehow logged in / created data,
-- and we need a manual investigation before deleting them.
-- =========================================================================

DO $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM "User" u
  WHERE u."email" LIKE '%@placeholder.unitae.app'
    AND (
      EXISTS (SELECT 1 FROM "Event" e WHERE e."createdById" = u."id")
      OR EXISTS (SELECT 1 FROM "AuditLog" al WHERE al."actorId" = u."id")
      OR EXISTS (SELECT 1 FROM "BoardDocumentVersion" bdv WHERE bdv."uploadedById" = u."id")
      OR EXISTS (SELECT 1 FROM "ProgrammeTemplateResponsible" ptr WHERE ptr."userId" = u."id")
      OR EXISTS (SELECT 1 FROM "ConsentRecord" cr WHERE cr."userId" = u."id")
      OR EXISTS (SELECT 1 FROM "CalendarFeedToken" cft WHERE cft."userId" = u."id")
      OR EXISTS (SELECT 1 FROM "BoardDynamicDocumentView" bddv WHERE bddv."userId" = u."id")
    );
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % placeholder-email account(s) hold account-bound FKs. Investigate before deleting them.', conflict_count;
  END IF;
END $$;

-- =========================================================================
-- 6. Rename User → UserAccount; reshape columns
-- =========================================================================
--
-- ALL inbound FK constraints on "User" auto-follow to the renamed table
-- (Postgres FKs reference table OIDs, not names). We then split them in
-- step 7 — the ones that should now point at Member get dropped + recreated.

ALTER TABLE "User" RENAME TO "UserAccount";

-- Update the inbound RLS policy name remains "tenant_isolation" — no rename needed.
-- Indexes auto-rename to UserAccount_*.
ALTER INDEX "User_pkey" RENAME TO "UserAccount_pkey";
ALTER INDEX "User_email_key" RENAME TO "UserAccount_email_key";
ALTER INDEX "User_id_congregationId_key" RENAME TO "UserAccount_id_congregationId_key";
ALTER SEQUENCE "User_id_seq" RENAME TO "UserAccount_id_seq";

-- Drop columns moved to Member
ALTER TABLE "UserAccount"
  DROP COLUMN "isPublisher",
  DROP COLUMN "type",
  DROP COLUMN "isMale",
  DROP COLUMN "phone",
  DROP COLUMN "address",
  DROP COLUMN "birthDate",
  DROP COLUMN "baptismDate",
  DROP COLUMN "isHelder",
  DROP COLUMN "isServant",
  DROP COLUMN "isAnointed",
  DROP COLUMN "publisherGroupId";

-- firstname/lastname stay on UserAccount as a display fallback for accounts
-- with no Member (admin / circuit overseer). They're already nullable.
-- Add memberId (nullable, unique 1:1 to Member).
ALTER TABLE "UserAccount" ADD COLUMN "memberId" INTEGER;
ALTER TABLE "UserAccount"
  ADD CONSTRAINT "UserAccount_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- Backfill: every UserAccount that has a corresponding Member (same id) links to it
UPDATE "UserAccount" ua
SET "memberId" = ua."id"
WHERE EXISTS (SELECT 1 FROM "Member" m WHERE m."id" = ua."id");

-- Once linked, clear the display name on UserAccount (Member is the source of truth)
UPDATE "UserAccount"
SET "firstname" = NULL, "lastname" = NULL
WHERE "memberId" IS NOT NULL;

-- Now enforce 1:1
CREATE UNIQUE INDEX "UserAccount_memberId_key" ON "UserAccount"("memberId");

-- =========================================================================
-- 7. Swap FK targets: domain-bound FKs now point at Member instead of UserAccount
-- =========================================================================
--
-- For each FK that pointed at User (now UserAccount) and should logically
-- point at Member, drop the old constraint and create a new one. FK column
-- VALUES are unchanged — Member preserves the User.id space.

-- Attribution.publisherId
ALTER TABLE "Attribution" DROP CONSTRAINT "Attribution_publisherId_fkey";
ALTER TABLE "Attribution"
  ADD CONSTRAINT "Attribution_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- PublisherActivity.publisherId
ALTER TABLE "PublisherActivity" DROP CONSTRAINT "PublisherActivity_publisherId_fkey";
ALTER TABLE "PublisherActivity"
  ADD CONSTRAINT "PublisherActivity_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ProgrammePartAssignment.assigneeId / assistantId
ALTER TABLE "ProgrammePartAssignment" DROP CONSTRAINT "ProgrammePartAssignment_assigneeId_fkey";
ALTER TABLE "ProgrammePartAssignment"
  ADD CONSTRAINT "ProgrammePartAssignment_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "ProgrammePartAssignment" DROP CONSTRAINT "ProgrammePartAssignment_assistantId_fkey";
ALTER TABLE "ProgrammePartAssignment"
  ADD CONSTRAINT "ProgrammePartAssignment_assistantId_fkey"
    FOREIGN KEY ("assistantId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- ProgrammeServiceRoleAssignment.assigneeId
ALTER TABLE "ProgrammeServiceRoleAssignment" DROP CONSTRAINT "ProgrammeServiceRoleAssignment_assigneeId_fkey";
ALTER TABLE "ProgrammeServiceRoleAssignment"
  ADD CONSTRAINT "ProgrammeServiceRoleAssignment_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- PublisherGroup.responsibleId / deputyId
ALTER TABLE "PublisherGroup" DROP CONSTRAINT "PublisherGroup_responsibleId_fkey";
ALTER TABLE "PublisherGroup"
  ADD CONSTRAINT "PublisherGroup_responsibleId_fkey"
    FOREIGN KEY ("responsibleId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "PublisherGroup" DROP CONSTRAINT "PublisherGroup_deputyId_fkey";
ALTER TABLE "PublisherGroup"
  ADD CONSTRAINT "PublisherGroup_deputyId_fkey"
    FOREIGN KEY ("deputyId") REFERENCES "Member"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- =========================================================================
-- 8. Delete fake-email accounts (now decoupled from any Member)
-- =========================================================================
--
-- Placeholder accounts (firstname.lastname@placeholder.unitae.app) were never
-- real logins (literal password 'password', could not authenticate). The
-- corresponding Member rows already exist and remain untouched. Account-bound
-- FKs from these ids do not exist (confirmed by step 5 pre-flight check).

DELETE FROM "UserAccount" WHERE "email" LIKE '%@placeholder.unitae.app';

-- =========================================================================
-- 9. Seed new built-in role keys for every existing congregation
-- =========================================================================
--
-- The schema split introduces five new role keys: member, ministry-school-student,
-- brother, sister, pioneer. seedBuiltInRoles (called on each new congregation
-- creation) handles them going forward, but existing congregations need them
-- seeded inline here so syncBuiltInRoleAssignments has them to work with.
-- The legacy male/female roles were already removed in step 4.

INSERT INTO "Role" ("key", "isBuiltIn", "congregationId", "createdAt", "updatedAt")
SELECT key_value, true, c."id", NOW(), NOW()
FROM "Congregation" c
CROSS JOIN (VALUES
  ('member'),
  ('ministry-school-student'),
  ('brother'),
  ('sister'),
  ('pioneer')
) AS roles(key_value)
ON CONFLICT ("key", "congregationId") DO NOTHING;

-- =========================================================================
-- 10. Backfill MemberRoleAssignment for the new built-in roles
-- =========================================================================
--
-- Re-evaluate every (still-here) Member against the new role predicates and
-- insert assignments. The migration in step 4 only moved existing assignments
-- for `publisher`/`baptized`/`anointed`/`elder`/`assistant-servant`; the new
-- `member`/`brother`/`sister`/`ministry-school-student`/`pioneer` predicates
-- never had matching User-side assignments, so we compute them from scratch.

-- member: every Member that hasn't left
INSERT INTO "MemberRoleAssignment" ("memberId", "roleId", "congregationId")
SELECT m."id", r."id", m."congregationId"
FROM "Member" m
JOIN "Role" r ON r."congregationId" = m."congregationId" AND r."key" = 'member' AND r."isBuiltIn"
WHERE m."leftAt" IS NULL
ON CONFLICT DO NOTHING;

-- ministry-school-student: not yet a publisher
INSERT INTO "MemberRoleAssignment" ("memberId", "roleId", "congregationId")
SELECT m."id", r."id", m."congregationId"
FROM "Member" m
JOIN "Role" r ON r."congregationId" = m."congregationId" AND r."key" = 'ministry-school-student' AND r."isBuiltIn"
WHERE m."leftAt" IS NULL AND m."isPublisher" = false
ON CONFLICT DO NOTHING;

-- brother: baptized male (no longer publisher-gated)
INSERT INTO "MemberRoleAssignment" ("memberId", "roleId", "congregationId")
SELECT m."id", r."id", m."congregationId"
FROM "Member" m
JOIN "Role" r ON r."congregationId" = m."congregationId" AND r."key" = 'brother' AND r."isBuiltIn"
WHERE m."leftAt" IS NULL AND m."baptismDate" IS NOT NULL AND m."isMale" = true
ON CONFLICT DO NOTHING;

-- sister: baptized female
INSERT INTO "MemberRoleAssignment" ("memberId", "roleId", "congregationId")
SELECT m."id", r."id", m."congregationId"
FROM "Member" m
JOIN "Role" r ON r."congregationId" = m."congregationId" AND r."key" = 'sister' AND r."isBuiltIn"
WHERE m."leftAt" IS NULL AND m."baptismDate" IS NOT NULL AND m."isMale" = false
ON CONFLICT DO NOTHING;

-- pioneer: baptized publisher with type pionnier-permanant or pionnier-auxiliaires
INSERT INTO "MemberRoleAssignment" ("memberId", "roleId", "congregationId")
SELECT m."id", r."id", m."congregationId"
FROM "Member" m
JOIN "Role" r ON r."congregationId" = m."congregationId" AND r."key" = 'pioneer' AND r."isBuiltIn"
WHERE m."leftAt" IS NULL
  AND m."isPublisher" = true
  AND m."baptismDate" IS NOT NULL
  AND m."type" IN ('pionnier-permanant', 'pionnier-auxiliaires')
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 11. Reset sequences to actual MAX (in case backfill skipped any)
-- =========================================================================

SELECT setval(
  pg_get_serial_sequence('"UserAccount"', 'id'),
  COALESCE((SELECT MAX("id") FROM "UserAccount"), 1)
);
SELECT setval(
  pg_get_serial_sequence('"Role"', 'id'),
  COALESCE((SELECT MAX("id") FROM "Role"), 1)
);
