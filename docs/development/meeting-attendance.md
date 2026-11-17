# Meeting Attendance

« Assistance aux réunions »: the two counts taken at every meeting, the figures the secretary reports
to the branch, and the meetings created ahead so there is always one to count. Code lives in
`features/events` (attendance, recurring events, empty meetings), with an entry card on the dashboard
and a line on the board's programme document.

## Counts

- One `Attendance` row per event (`eventId` unique), created on the first count: `inPerson`
  (« En salle ») and `online` (« En visioconférence », Zoom and phone together). Each count carries who
  entered or last changed it (`…ById`, null once that account is deleted) and when (`…At`). The total
  is computed, never stored.
- Null means « not entered », never 0. A meeting is **complete** when both counts are set; until then
  it stays out of every figure.
- Writes go through `attendance.aggregate.ts` only (`attendance` is in `AGGREGATE_MODELS`). Each count
  is written on its own by an upsert that touches only its three columns, so the hall count and the
  online count can arrive at the same moment; the « set by someone else » rule is a conditional
  update, never a read-modify-write.
- RLS: the standard congregation policy ([Row-Level Security](./row-level-security.md)).
- Audit: `AttendanceRecorded`, and `AttendanceCorrected` (old and new values) for a change outside
  the entry window or of another account's count.

## Which meetings count

The template's `attendanceKind` (Réglages › Programmes, « Assistance »), constrained in SQL:

| Value | Effect |
|---|---|
| `none` | Not counted: no entry, never listed. System templates are always `none`. |
| `midweek` | Midweek average, midweek column of the S-88. |
| `weekend` | Weekend average, weekend column of the S-88. |
| `separate` | Entered and listed apart, kept out of averages and the S-88 (the Memorial). |

Seeded keys get their default (`defaultAttendanceKind`: `midweek-meeting` → `midweek`,
`weekend-meeting` → `weekend`, `memorial` → `separate`); duplicating a template copies it. An event
without a template never counts. Attendance reads every event of a counted template **whatever its
programme's status**: a meeting whose programme is a draft still takes place.

## Rights

Three permissions, granted only from « Rôles et autorisations » (category « Réunions »):

| Key | Grants |
|---|---|
| `can-record-attendance` | Enter the counts of a meeting under way, until local midnight. |
| `can-correct-attendance` | Change any count at any time (requires `can-view-attendance`). |
| `can-view-attendance` | The service-year page: figures, history, exports. |

The rule is `events/model/attendance-access.ts` (`entryWindow`, `canWriteCount`, `attendanceRights`):

| Situation | Recorder | Corrector |
|---|---|---|
| Before the meeting starts | nothing | anything |
| Under way, count empty or entered by the same account | set / change it | anything |
| Under way, count entered by someone else | read only | anything |
| After local midnight of the meeting day | nothing | anything |

The entry window runs from the event's `startDate` to the end of its local day (congregation time
zone).

## Screens

- **Dashboard card** (recorders and correctors): every counted meeting under way today
  (`listMeetingsUnderWay`), two fields each saved on its own, « Par vous à 10:44 » under a saved one.
- **`/attendance`:** with `can-view-attendance`, the service year: metric strip (averages against the
  same months last year, online share, meetings entered), monthly chart, meetings by month and a side
  panel with one meeting's counts and history. With recording rights alone, only today's meetings
  under way, or when the entry opens next. « Exporter » opens a dialog: format (S-88 PDF at
  `/attendance/record.pdf`, spreadsheet at `/attendance/attendance.xlsx`) and any service year from the
  first counted meeting on (`listAttendanceServiceYears`).
- **Programme line:** when « Afficher l’assistance sur le programme » is on
  (`CongregationSettingKey.ProgrammeShowsAttendance`, off by default), the board's programme document
  carries last week's totals (`listLastWeekAttendance`, Monday to Sunday): total only, complete meetings
  only, « — » otherwise.

## Figures

`events/model/attendance-stats.ts` and `attendance-report.ts`:

- A meeting belongs to the month of its local start day; service years run September to August.
- Monthly average = total of complete meetings ÷ their number. A year's average is its total over its
  meetings, never an average of monthly averages. Averages are whole numbers, rounded half up;
  computations keep full precision.
- « Pas de réunion » weeks are computed (`emptyWeeks`): a week missing from a recurring counted
  template's run. Nothing is stored for them — no meeting is no event.
- The S-88 prints two service years side by side; the spreadsheet has one row per meeting and a
  monthly summary.

## Meetings created ahead

A daily worker job (`recurring-events`, 01:00 UTC, see [Background Processing](./background-processing.md))
calls `extendRecurringEvents` for every active, non-suspended congregation. New congregations get
their first run when they are created.

- A template is **recurring** when it has a `weekDay` and is not a system template (`isRecurring` is
  kept equal to `weekDay != null`).
- Its events are kept created `RECURRING_HORIZON_MONTHS` (2) calendar months ahead, as **empty
  meetings**: template name and hours, `status: draft`, `createdById: null`, no parts, no services.
- **High-water mark.** `EventTemplate.generatedUntil` (a local day `YYYY-MM-DD`) means « this
  template's events exist, or were left out on purpose, up to here ». The job only ever creates after
  it, so a deleted or passed week never comes back. Every path that creates a template's events
  raises it: the job, and series creation up to the end of the series.
- **Locks.** Nothing keys an event on (template, day). The job, series creation and moving empty
  meetings lock the template row first (`lockTemplates`, in id order), so two of them never create
  the same day. `recurring-events-race.integration.test.ts` runs the job and a series together.

### Empty meetings

`EMPTY_MEETING` (`empty-meetings.queries.ts`): no author, no part, no service, no attendance. Only
empty meetings are touched automatically:

- **Moved** when a template's weekday or hours change, by the explicit « Déplacer les N réunions à
  venir » (`moveEmptyMeetings`): each goes to the new day of its own week, so a deleted week stays
  deleted; one whose week already has its meeting on that day is deleted. Prepared meetings and
  meetings with counts never move.
- **Re-anchored** when the congregation's time zone changes (`reanchorEmptyMeetings`): same local day,
  template hours in the new zone.
- **Deleted** with their template (they do not count as « in use »), and on a day a series passes on
  purpose.
- **Filled**, not duplicated, when someone creates a programme on their day: series creation and
  single-day creation give an existing event without a programme the template's parts and services
  (`fillMeeting`). An empty meeting takes the template's current name and hours and the person as
  author; an event someone prepared, then emptied, keeps its own.

The programme list shows meetings without a programme as « <template name> · Pas encore de
programme ».

## Deleting

An event is the meeting: deleting it deletes its counts (cascade). Deleting a **programme** never
does: `deleteEvent` and `bulkDeleteEvents` delete an event without counts, but an event with counts
only loses its parts and services and goes back to draft, its attendance intact (audited
`ProgrammeRemoved`; a real deletion is `EventDeleted`). The events are locked first, so a count
entered at the same moment is not cascaded away.

## Data transfer

Archive 2.15: `attendance.ndjson` (counts, who and when, keyed to the event) and `attendanceKind` on
templates. `generatedUntil` is not exported: a null mark makes the first run start after the last
imported event. See [Data Transfer](./data-transfer.md).
