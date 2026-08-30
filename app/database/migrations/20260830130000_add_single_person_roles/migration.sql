-- A role can now say explicitly that it is personal: one titular holder, seated as `leader`,
-- with a handover when someone new is seated. Deputies are still allowed on a personal role —
-- an adjoint is either a `deputy` seat on it or a child personal role in the tree.
--
-- No change in who can do what: the flag only tightens how future seating behaves. Existing
-- seats are left exactly where they are.
--
-- Written with the same re-runnable guards as the other organigram migrations.

ALTER TABLE "Role"
  ADD COLUMN IF NOT EXISTS "isSinglePerson" BOOLEAN NOT NULL DEFAULT false;

-- The three committee posts are the personal roles every congregation already has. The
-- committee itself stays a group: its membership is derived from the posts. Custom personal
-- roles («Responsable audio/vidéo», …) are flagged by each congregation from the organigram —
-- guessing them here from names would be the silent mis-map the adoption flow exists to avoid.
UPDATE "Role"
SET "isSinglePerson" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('coordinator', 'secretary', 'service-overseer')
  AND "isSinglePerson" = false;
