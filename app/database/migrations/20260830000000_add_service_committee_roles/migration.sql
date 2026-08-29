-- Give every existing congregation the service committee roles. No change in who can do what:
-- the four rows are created with no permissions and no place in the chart.
--
-- Every congregation has one service committee of three elders — the coordinator, the secretary
-- and the service overseer. Until now each congregation typed those in as ordinary custom roles,
-- so the names were French text in the database and the keys were whatever the slugifier made of
-- them. Stable keys are what let a default permission set ship for "the secretary", and what lets
-- a handover revoke the outgoing holder's permissions the moment the new one is seated.
--
-- Deliberately NOT placed in the organigram (`showInOrganigram` stays false, `parentRoleId` stays
-- null). Congregations that already built a chart have their own «Coordinateur» / «Comité de
-- service» with people seated on them; switching these on here would show every one of them a
-- duplicated, empty committee. They adopt the structure from the organigram page instead, where
-- the mapping is proposed and confirmed rather than guessed. New congregations get the structure
-- placed by `placeDefaultOrganigram` at provisioning.
--
-- Additive only: the deployed application image does not roll when this runs, so the code serving
-- traffic must keep working against the new rows. It does — an unplaced role with no permissions
-- is invisible to every existing query.

-- 1. The committee and its three posts, per congregation.
--
-- `name`/`description` stay NULL on purpose: display strings resolve per-locale through
-- getRoleDisplayName, the same way `elder` and `assistant-servant` already do. Writing French
-- here would break English congregations and could not be re-localised afterwards.
--
-- `updatedAt` has no database default — Prisma maintains it in the client — so raw SQL must
-- pass it explicitly or the insert fails on a NOT NULL column.
INSERT INTO "Role" ("key", "isBuiltIn", "congregationId", "createdAt", "updatedAt")
SELECT k."key", true, c."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Congregation" c
CROSS JOIN (VALUES ('service-committee'), ('coordinator'), ('secretary'), ('service-overseer')) AS k("key")
ON CONFLICT ("key", "congregationId") DO NOTHING;

-- 2. A congregation that already used one of these exact keys for a custom role keeps its row,
-- because of the DO NOTHING above. Mark it built-in so it behaves as the appointed post it now is
-- — undeletable, un-renameable — while keeping every seat and permission already on it.
--
-- Its stored `name` is deliberately LEFT ALONE. Clearing it would read better (the localised
-- string would win) but it destroys something the congregation typed, and getRoleDisplayName
-- already prefers a stored name, so nothing breaks by keeping it. The adoption flow can offer to
-- clear it, where the admin can see what they are giving up. French slugs produce `coordinateur`
-- rather than `coordinator`, so this branch is rare in practice — which is exactly why it must
-- not be the destructive one.
--
-- Note the one visible consequence: `isBuiltIn = true` takes the role out of
-- accountAssignableRole(), so it disappears from the user-management role checkboxes. Existing
-- assignments survive untouched — that filter is applied to both sides of the diff, so a role it
-- excludes is never stripped — and the post is granted from the organigram from now on.
UPDATE "Role"
SET "isBuiltIn" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('service-committee', 'coordinator', 'secretary', 'service-overseer')
  AND "isBuiltIn" = false;
