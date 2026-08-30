-- Adds the congregation organigram: a reporting tree over the roles that already exist,
-- plus the seat a person occupies within a node.
--
-- Contract: no change in who can do what. Every column is nullable or defaulted, nothing is
-- backfilled, and `showInOrganigram` starts false everywhere — so the chart is empty until an
-- admin builds one, and the currently-deployed image (which never selects these columns) keeps
-- working unchanged against the new schema.
--
-- `parentRoleId` is reporting structure ONLY. It must never be traversed by permission
-- resolution: the chart's root is the `elder` roster, so inheriting downward would make every
-- seated person an elder, and inheriting upward would give every elder every permission in the
-- congregation.
--
-- Written with IF NOT EXISTS throughout so a hand-applied or restored environment can run it
-- twice without failing.

-- 1. The tree, on Role.
ALTER TABLE "Role"
  ADD COLUMN IF NOT EXISTS "parentRoleId"     INTEGER,
  ADD COLUMN IF NOT EXISTS "showInOrganigram" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "organigramOrder"  INTEGER,
  ADD COLUMN IF NOT EXISTS "organigramNote"   TEXT;

-- 2. The seat, on the assignment. Existing rows become `member`, which is what they are:
--    a leader is only ever set deliberately through the organigram editor.
ALTER TABLE "UserRoleAssignment"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'member';

-- 3. Tenancy, enforced by the database rather than by a service check a caller could forget.
--    The composite target is the existing @@unique([id, congregationId]) on Role, so a role
--    physically cannot be parented into another congregation. MATCH SIMPLE (the default) skips
--    the check when "parentRoleId" is NULL, which is how roots work with no special case.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Role_parentRoleId_congregationId_fkey'
  ) THEN
    ALTER TABLE "Role"
      ADD CONSTRAINT "Role_parentRoleId_congregationId_fkey"
      FOREIGN KEY ("parentRoleId", "congregationId")
      REFERENCES "Role"("id", "congregationId")
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
END $$;

-- 4. The chart is read by node and by parent on every render; both are small but hot.
CREATE INDEX IF NOT EXISTS "Role_organigram_idx"
  ON "Role" ("congregationId", "parentRoleId")
  WHERE "showInOrganigram";
