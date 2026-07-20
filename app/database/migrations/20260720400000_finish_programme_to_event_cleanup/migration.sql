-- Follow-up cleanup for `20260720300000_rename_programme_to_event`:
--
-- 1. Rewrites `NotificationEvent.debounceKey` for still-pending rows so the
--    new event-part debounce lookup (`buildDebounceKey('EventPart', ...)`)
--    matches pre-rename entries. Without this, publishers reassigned in the
--    30-min post-deploy window would get duplicated "assigned" mails and/or
--    out-of-order "unassigned" mails because the cancel/replace path filters
--    by `debounceKey`, which was computed from the old entityType string.
--
-- 2. Renames the FK columns on the two join tables from `assignmentId` (the
--    old `Programme*Assignment*AllowedRole` name) to the target model name
--    (`eventPartId` / `eventServiceRoleId`). Keeps table/PK/FK/index rename
--    consistent with the model rename.

-- 1. NotificationEvent.debounceKey rewrite — only for pending rows (sent
--    rows are historical and get auto-cleaned in 7-30 days).
UPDATE "NotificationEvent"
SET "debounceKey" = 'EventPart:' || substring("debounceKey" from length('ProgrammePartAssignment:') + 1)
WHERE "status" = 'pending' AND "debounceKey" LIKE 'ProgrammePartAssignment:%';

UPDATE "NotificationEvent"
SET "debounceKey" = 'EventServiceRole:' || substring("debounceKey" from length('ProgrammeServiceRoleAssignment:') + 1)
WHERE "status" = 'pending' AND "debounceKey" LIKE 'ProgrammeServiceRoleAssignment:%';

-- 2. Column renames on the two join tables. `ALTER TABLE ... RENAME COLUMN`
--    preserves indexes, constraints, and RLS policies bound to the column
--    since they reference the column by OID.
ALTER TABLE "EventPartAllowedRole"        RENAME COLUMN "assignmentId" TO "eventPartId";
ALTER TABLE "EventServiceRoleAllowedRole" RENAME COLUMN "assignmentId" TO "eventServiceRoleId";

-- 3. Rename the FK constraints to match the new column names.
ALTER TABLE "EventPartAllowedRole"
  RENAME CONSTRAINT "EventPartAllowedRole_assignmentId_fkey" TO "EventPartAllowedRole_eventPartId_fkey";
ALTER TABLE "EventServiceRoleAllowedRole"
  RENAME CONSTRAINT "EventServiceRoleAllowedRole_assignmentId_fkey" TO "EventServiceRoleAllowedRole_eventServiceRoleId_fkey";
