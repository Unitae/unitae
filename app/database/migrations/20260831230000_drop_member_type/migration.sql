-- Drops `Member.type`. It cached a member's standing pioneer status; PioneerEnrolment is the source
-- of truth for the same fact and has been since the plan/actual split. The preceding release moved
-- every reader onto the stints and backfilled the members who had a type but no stint, so this file
-- only removes what nothing reads any more.
--
-- Contract: no change in who is a pioneer. Anyone whose status came from this column already has an
-- ongoing stint carrying it.
--
-- The CHECK constraint has to go first — it references the column, so the DROP COLUMN would fail on
-- a dependency error rather than cascading.

ALTER TABLE "Member" DROP CONSTRAINT IF EXISTS "member_pioneer_requires_baptism";

ALTER TABLE "Member" DROP COLUMN "type";
