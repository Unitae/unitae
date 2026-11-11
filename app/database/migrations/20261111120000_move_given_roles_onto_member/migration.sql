-- Roles given by hand move from the login onto the person's record, so that a publisher without
-- an account can hold one. Contract: nobody's roles, seats or permissions change.

-- 1. The record carries the seat (leader, deputy, member) like the account did, pinned to the same three words.
--    Dropped then added, so a restored environment can run this twice.
ALTER TABLE "MemberRoleAssignment" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "MemberRoleAssignment" DROP CONSTRAINT IF EXISTS "MemberRoleAssignment_kind_check";
ALTER TABLE "MemberRoleAssignment"
  ADD CONSTRAINT "MemberRoleAssignment_kind_check" CHECK ("kind" IN ('leader', 'deputy', 'member'));

-- 2. Every role given to an account linked to a record moves onto that record, seat included.
--    System roles (admin) are access, not a qualification: they stay on the login. A row the
--    record already holds keeps the higher seat.
INSERT INTO "MemberRoleAssignment" ("memberId", "roleId", "congregationId", "kind")
SELECT ua."memberId", ura."roleId", ura."congregationId", ura."kind"
FROM "UserRoleAssignment" ura
JOIN "UserAccount" ua ON ua."id" = ura."userId"
JOIN "Role" r ON r."id" = ura."roleId"
WHERE ua."memberId" IS NOT NULL AND r."key" NOT IN ('admin')
ON CONFLICT ("memberId", "roleId") DO UPDATE SET "kind" = EXCLUDED."kind"
WHERE "MemberRoleAssignment"."kind" = 'member';

-- 3. The moved rows leave the login.
DELETE FROM "UserRoleAssignment" ura
USING "UserAccount" ua, "Role" r
WHERE ua."id" = ura."userId"
  AND r."id" = ura."roleId"
  AND ua."memberId" IS NOT NULL
  AND r."key" NOT IN ('admin');
