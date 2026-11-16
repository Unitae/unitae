-- Meeting attendance: the two counts of each meeting, how each template's events count, and room for events the
-- recurring-events job will create without an author. Contract: nothing anyone can see or do today changes.
--
-- Additive for the running image: a new table, two columns with defaults, and `Event.createdById` made nullable while
-- nothing writes a null yet (the job and the import of author-less events ship later). Its foreign key stays
-- ON DELETE RESTRICT, so deleting an account still never empties the owner of a day-off.
--
-- RLS: the new table gets the standard tenant_isolation policy in the CASE/NULLIF form; this file runs with
-- app.congregation_id unset, so the backfills below cross tenants as intended.


-- 1. How a template's events count in attendance.
ALTER TABLE "EventTemplate" ADD COLUMN "attendanceKind" TEXT NOT NULL DEFAULT 'none';

-- A closed enumeration read back into a union type: a typo written by a future importer must fail loudly rather than
-- become a kind nothing counts.
ALTER TABLE "EventTemplate"
  ADD CONSTRAINT "EventTemplate_attendanceKind_check"
  CHECK ("attendanceKind" IN ('none', 'midweek', 'weekend', 'separate'));

-- The seeded meetings count from day one. Every other template, including a key this file does not know, keeps the
-- default 'none' — nothing is dropped, and a congregation can change it in its settings.
UPDATE "EventTemplate" SET "attendanceKind" = 'midweek' WHERE "key" = 'midweek-meeting' AND "attendanceKind" = 'none';
UPDATE "EventTemplate" SET "attendanceKind" = 'weekend' WHERE "key" = 'weekend-meeting' AND "attendanceKind" = 'none';
UPDATE "EventTemplate" SET "attendanceKind" = 'separate' WHERE "key" = 'memorial' AND "attendanceKind" = 'none';

-- 2. How far the recurring-events job has created a template's events: a local day, `YYYY-MM-DD`. Null until it runs.
ALTER TABLE "EventTemplate" ADD COLUMN "generatedUntil" TEXT;

-- 3. `isRecurring` was set from the weekday on create only and drifted on edit; recurrence has always been decided by
-- `weekDay IS NOT NULL`. Realign the column with that rule (updateTemplate now keeps it aligned).
UPDATE "EventTemplate" SET "isRecurring" = ("weekDay" IS NOT NULL) WHERE "isRecurring" <> ("weekDay" IS NOT NULL);

-- 4. An event created by the recurring-events job has no author. The foreign key is left exactly as it is.
ALTER TABLE "Event" ALTER COLUMN "createdById" DROP NOT NULL;

-- 5. The counts.
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "inPerson" INTEGER,
    "inPersonById" INTEGER,
    "inPersonAt" TIMESTAMP(3),
    "online" INTEGER,
    "onlineById" INTEGER,
    "onlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- A count is a number of people: never negative.
ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_counts_check"
  CHECK (("inPerson" IS NULL OR "inPerson" >= 0) AND ("online" IS NULL OR "online" >= 0));

CREATE UNIQUE INDEX "Attendance_eventId_key" ON "Attendance"("eventId");
CREATE INDEX "Attendance_congregationId_idx" ON "Attendance"("congregationId");
CREATE UNIQUE INDEX "Attendance_id_congregationId_key" ON "Attendance"("id", "congregationId");

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_inPersonById_fkey" FOREIGN KEY ("inPersonById") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_onlineById_fkey" FOREIGN KEY ("onlineById") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attendance" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );
