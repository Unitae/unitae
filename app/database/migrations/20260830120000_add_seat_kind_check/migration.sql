-- Pin UserRoleAssignment.kind to the three words the application writes.
--
-- The column is TEXT rather than an enum, and the read side already ranks an unknown kind
-- last rather than crashing — but tolerating drift on read is not a reason to accept it on
-- write. Every writer (seating, committee sync, adoption, import) uses exactly these values,
-- so anything else reaching the table is a bug, and a loud insert failure is worth more than
-- a seat that silently sorts to the bottom of its node.
--
-- No backfill is needed: the column arrived with DEFAULT 'member' and only the seating UI has
-- ever written anything else, so every existing row already passes.
--
-- Guarded so a hand-applied or restored environment can run it twice without failing, matching
-- the other organigram migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserRoleAssignment_kind_check'
  ) THEN
    ALTER TABLE "UserRoleAssignment"
      ADD CONSTRAINT "UserRoleAssignment_kind_check"
      CHECK ("kind" IN ('leader', 'deputy', 'member'));
  END IF;
END $$;
