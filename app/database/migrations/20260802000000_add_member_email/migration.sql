-- AlterTable: contact email on Member (distinct from the login email on UserAccount)
ALTER TABLE "Member" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

-- Backfill: seed each member's contact email from their linked login account's
-- email so existing contact data isn't lost. They can diverge afterwards.
UPDATE "Member" m
SET "email" = ua."email"
FROM "UserAccount" ua
WHERE ua."memberId" = m."id"
  AND ua."email" IS NOT NULL
  AND m."email" = '';
