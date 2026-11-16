-- Templates created while the previous image was still running count as the seeded meetings should. Contract: no
-- choice anyone made is overwritten.
--
-- 20261116120000_add_meeting_attendance backfilled `attendanceKind` once, but the running image keeps serving until the
-- new one rolls out, and its seeding and template duplication wrote the column's default, 'none'. So a congregation
-- registered in that window got its midweek, weekend and Mémorial templates « not counted ».
--
-- Only templates that are all of: a seeded key, still 'none', created after that migration finished, and never edited
-- since (`updatedAt` within seconds of `createdAt`) — so a manager who deliberately set one to « Non comptée » keeps it.
-- Same key rule as defaultAttendanceKind() in app/features/events/model/attendance-kind.type.ts.

UPDATE "EventTemplate" AS t
SET "attendanceKind" = CASE t."key"
    WHEN 'midweek-meeting' THEN 'midweek'
    WHEN 'weekend-meeting' THEN 'weekend'
    WHEN 'memorial' THEN 'separate'
  END
WHERE t."key" IN ('midweek-meeting', 'weekend-meeting', 'memorial')
  AND t."attendanceKind" = 'none'
  AND t."createdAt" >= (
    SELECT m."finished_at" FROM "_prisma_migrations" AS m
    WHERE m."migration_name" = '20261116120000_add_meeting_attendance'
  )
  AND t."updatedAt" <= t."createdAt" + INTERVAL '5 seconds';

-- The previous image's updateTemplate also let `isRecurring` drift from the weekday; realign it again before the
-- recurring-events job relies on the weekday rule it mirrors.
UPDATE "EventTemplate" SET "isRecurring" = ("weekDay" IS NOT NULL) WHERE "isRecurring" <> ("weekDay" IS NOT NULL);
