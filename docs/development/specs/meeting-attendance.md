# Spec: Meeting attendance (« Assistance aux réunions »)

**Status:** Draft — design agreed with the author; not yet implemented
**Author:** Nathanaël Cherrier
**Feature area:** `features/events` (attendance, recurring events) + `features/dashboard` (entry card) + `shared/types/permission`
**Related:** [Permissions & Roles](../permissions-and-roles.md), [Architecture Conventions](../architecture-conventions.md), [Row-Level Security](../row-level-security.md), [Background Processing](../background-processing.md), [Data Transfer](../data-transfer.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state behavior
> should be folded into the relevant `docs/` pages and this file archived.

## 1. Problem

Every meeting, one or two brothers count the audience: the attendants count the people in the
Kingdom Hall, the videoconference host counts those connected by Zoom or phone. The secretary keeps
these figures on the S-88 card (« Assistance aux réunions »), sends the monthly averages in the
congregation's report to the branch, and the elders look at the trend. Unitae has no place for any
of it: the counts live on paper or in a spreadsheet, and the averages are computed by hand.

## 2. Goals / Non-goals

**Goals**

- Record **two counts per meeting** — « En salle » and « En visioconférence » (Zoom and phone
  together, as the branch report counts them). The total is computed, never stored.
- Let the people who count **enter them during the meeting**, from the dashboard, each count on its
  own (the attendant and the Zoom host never wait for each other).
- Give the secretary and the elders an **« Assistance » page**: averages for the service year,
  month-by-month trend against last year, the list of meetings with corrections, and the special
  events (Mémorial) kept apart.
- **Export** the S-88 card (PDF) and a spreadsheet (Excel).
- Optionally show **last week's attendance on the programme** to everyone, per congregation.
- **Create recurring events automatically**, so a meeting exists to record against even in a
  congregation that does not build its programmes in Unitae.

**Non-goals**

- The schedule refactor (§11) — attendance is designed to survive it unchanged, but ships first.
- Weekly schedules (cleaning by group) — not designed yet.
- Reminders and notifications about missing counts — a later addition on the existing
  notifications system.
- A « monthly report to the branch » page combining activity and attendance — made possible by this
  spec, not part of it.
- Counting attendance for anything other than events whose template is counted (§5.2).

## 3. Users & jobs-to-be-done

| Who | Job | Right |
|---|---|---|
| Attendant, Zoom host | Type one number at the meeting, in seconds, from a phone | `can-record-attendance` |
| Secretary | Fix a wrong or missing count at any time; fill the S-88; report averages to the branch | `can-correct-attendance` + `can-view-attendance` |
| Elders | See averages and the trend; compare with last year | `can-view-attendance` |
| Everyone (optional) | Read last week's total on the programme | none — congregation setting |

Rights are granted **only** from « Rôles et autorisations », like every other permission. Neither the
template settings nor the attendance page grant anything.

## 4. Current implementation background (verified)

- **Meetings already exist as templates.** `seedDefaultTemplates` (`events/server/seed-templates.server.ts`)
  gives every congregation `midweek-meeting` and `weekend-meeting` (recurring, with `weekDay`,
  `startTime`, `endTime`) and `memorial` (one-off, `weekDay: null`). `day-off` and `freeform` are
  system templates (`SYSTEM_TEMPLATE_KEYS`), read-only except their colour.
- **`EventTemplate.isRecurring`** is not a separate control, and the column drifts: it is set to
  `data.weekDay != null` **on create only** (`settings/server/event-template.server.ts:21`);
  `updateTemplate` (`events/server/event-templates.server.ts`) never recomputes it, while seed,
  duplicate and import copy whatever they are given. The code that decides recurrence ignores the
  column and tests `weekDay != null` (`isRecurring()` in `events/model/programme-creation.ts:44`,
  the series filter in `programme-creation.server.ts`). « Recurring » means « has a weekday ».
- **Each meeting held is an `Event`** with its real `startDate`/`endDate`. Series creation
  (`plannedSeries` in `events/model/programme-creation.ts`; `daysOnWeekday` and `programmeKey` in
  `events/model/programme-dates.ts`; server `createProgrammeSeries` / `createProgrammeOnDay` →
  private `createProgramme` in `programme-creation.server.ts`) creates one event per day **with its
  parts and service parts copied from the template**, `createdById: ctx.actorId` (a required
  `number`). A day the person « passes » (a circuit assembly week) leaves no row at all. There is no
  unique key on `(templateId, day)`. Local times go through `combineLocalDateTime(day, time,
  timezone)` with `Congregation.timezone`; days are `YYYY-MM-DD` strings (`dayOf`, `startOfDay`,
  `endOfDay` in `shared/utils/calendar-day.ts`).
- **`Event.status`** (`draft` | `released`) publishes the whole event. Drafts are invisible to the
  board, notifications and publisher-facing dashboards.
- **`Event.createdById` is required** and points to a `UserAccount`. For meetings it is only
  provenance; for **day-offs it is the owner** — absences resolve to a person through
  `Event.createdBy.memberId` (`refresh-conflict-flags.server.ts`, `slot-candidate-facts.server.ts`,
  `event-part-assignments.server.ts`, `member-engagement.queries.ts`, `days-off.*`,
  `personal-assignments.server.ts`); no other app code reads `Event.createdBy`. The foreign key is
  `ON DELETE RESTRICT` (init migration), and account deletion deletes the `UserAccount` row
  (`delete-account.server.ts`, `unlink-account-from-member.server.ts`). `import-events.server.ts`
  **skips** an event whose creator is not in the archive.
- **Templates in use:** `deleteTemplate` refuses while the template has any event
  (`delete-template.server.ts`), and the template page disables the button on the same count.
- **Dashboard:** `getNextMeeting` (`dashboard/server/dashboard.server.ts`) selects
  `startDate >= now` and `status = released` — a meeting **under way** is never returned.
  `nextMeetingForViewer` trims it per viewer.
- **Service parts** seeded on both meetings: `sono`, `stage`, `welcome` (Accueil), `cleaning`. The
  assignee is on `EventServicePart`.
- **Settings:** `CongregationSettingKey` + the `Setting` table (key/value per congregation).
- **Permissions:** `Permission` enum; `PERMISSION_TO_CATEGORY` (`shared/types/permission-display.ts`)
  puts the 8 programme, absence and external-speaker rights in `programs`, labelled « Programmes ».
  `can-do-anything` expands to every permission (`shared/auth/permissions.server.ts:84`), so admins
  receive new permissions without any grant.
- **Background jobs:** daily schedules are registered with `upsertJobScheduler` in
  `app/workers/worker.server.ts` (retention at 03:00 UTC, campaigns at `CAMPAIGN_CRON_HOUR_UTC = 2`).
  Both iterate active, non-suspended congregations with a per-tenant try/catch and a
  `SYSTEM_ACTOR_ID`, and are listed in the worker's readiness `schedulers`. `audit()` accepts a
  missing `actorId` (system action).
- **Exports:** `exceljs` already backs the yearly activity export and the territory S-13;
  react-pdf backs the PDF exports. `serviceYearMonths()` and `toServiceYear()` live in
  `publishers/model/pioneer-pace.ts` and are exported from the publishers barrel.
- **CI gates that this spec touches:** `test:permission-coverage` fails on a permission nothing
  enforces; `test:action-permissions` needs access helpers registered (`DELEGATES`); the audit
  catalogue test requires a row per `AuditAction`; `test:service-test-coverage` covers queue files
  and job handlers.

## 5. Design overview

### 5.1 Data model

```prisma
model Attendance {
  id        Int   @id @default(autoincrement())
  event     Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  eventId   Int   @unique

  // Null = not entered yet, never 0. Both must be set for the meeting to count in averages.
  inPerson         Int?
  inPersonBy       UserAccount? @relation("attendanceInPerson", fields: [inPersonById], references: [id], onDelete: SetNull)
  inPersonById     Int?        // who entered or last changed it; null once that account is deleted
  inPersonAt       DateTime?
  online           Int?
  onlineBy         UserAccount? @relation("attendanceOnline", fields: [onlineById], references: [id], onDelete: SetNull)
  onlineById       Int?
  onlineAt         DateTime?

  congregation   Congregation @relation(fields: [congregationId], references: [id])
  congregationId Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([id, congregationId])
  @@index([congregationId])
}

model EventTemplate {
  // …existing fields
  // 'none' | 'midweek' | 'weekend' | 'separate'. Constrained in SQL by a CHECK, like TemplateResponsible.scope.
  attendanceKind String    @default("none")
  // How far recurring events exist for this template: a local day `YYYY-MM-DD`, inclusive.
  // A string like every other "day" in the events model — never a timestamp read through the zone
  // helpers (the midnight-UTC trap absence.ts documents).
  generatedUntil String?
}

model Event {
  // …existing fields
  // onDelete stays Restrict, written out: an optional relation defaults to SetNull, which would
  // empty the owner of every day-off when an account is deleted.
  createdBy   UserAccount? @relation("createdBy", fields: [createdById], references: [id], onDelete: Restrict)
  createdById Int?          // null = created by the recurring-events job; day-offs always have one
  attendance  Attendance?
}
```

- One attendance row per event, created on the first count. Deleting an event deletes its counts —
  an event is the meeting; no meeting, no attendance. Deleting a *programme* never deletes counts (§6.4).
- **Writes are atomic per count.** The hall count and the online count routinely arrive at the same
  moment, so a count is written by an upsert keyed on `eventId` that touches only that count's three
  columns, and the « set by someone else » rule (§6.3) is a conditional update
  (`… WHERE inPerson IS NULL OR inPersonById = actor`), never a read-modify-write.
- `attendance` joins `AGGREGATE_MODELS` (`scripts/check-aggregate-boundaries.ts`), so writes outside
  `attendance.aggregate.ts` fail CI.
- **No `held` flag.** No meeting means no event. The greyed « Pas de réunion » row on the attendance
  page is **computed**: a week missing from a recurring counted template's run, between its first
  and last event of the period.
- Per-count `…ById`/`…At` feed the history line (« Saisi par Paul MARTIN à 10:41 ») and the
  recorder's edit rule (§6.3).
- RLS policy on `Attendance` with the standard `CASE WHEN NULLIF(current_setting(…), '') IS NULL`
  form.

### 5.2 Meeting type on the template

A new « Assistance » select on each template in Réglages › Programmes:

| Value | Label | Effect |
|---|---|---|
| `none` | Non comptée | No entry, never listed |
| `midweek` | Réunion de semaine | Midweek average, midweek column of the S-88 |
| `weekend` | Réunion de week-end | Weekend average, weekend column of the S-88 |
| `separate` | Comptée à part | Entered and listed under « Comptées à part », kept out of averages and the S-88 (Mémorial) |

The migration pre-fills it from the seeded keys: `midweek-meeting` → `midweek`, `weekend-meeting` →
`weekend`, `memorial` → `separate`, everything else → `none`. The backfill only covers existing rows,
so `seedDefaultTemplates` sets the same values on the seeded keys and `duplicateTemplate` copies the
field. System templates are forced to `none` (the field is not editable on them). A special talk is held at the weekend meeting, so it counts as
an ordinary weekend meeting with no extra rule.

### 5.3 Recurring events are created automatically

A daily worker job (`recurring-events`, registered with `upsertJobScheduler`, at 01:00 UTC — before
campaigns and retention) keeps every recurring template's events created **2 months ahead**.

**The high-water mark.** `generatedUntil` means « events of this template exist, or were
deliberately left out, up to this day ». It is the only thing that keeps the job from refilling a
week someone removed, so **every path that creates a template's events raises it**:

- the job: `generatedUntil = to` after its run;
- series creation (`createProgrammeSeries`, `createProgrammeOnDay`):
  `generatedUntil = max(generatedUntil, last day of the series)` — so a day passed in a series
  that runs beyond the horizon is never filled later;
- first run, when `generatedUntil` is null: `max(to, the template's last existing event day)`.

**The run.** For each congregation with `active: true, suspendedAt: null` (selecting its
`timezone`), inside `withScope`, with a per-congregation try/catch and `SYSTEM_ACTOR_ID` like the
retention and campaign jobs; for each template with `weekDay != null` and a key outside
`SYSTEM_TEMPLATE_KEYS` (the same rule as series creation — the drifting `isRecurring` column is not
used, §4):

1. Lock the template row (`SELECT … FOR UPDATE`), so the job and a concurrent series creation
   cannot both create the same day — there is no unique key on `(templateId, day)`.
2. `today` = `dayOf(new Date(), timezone)`; `from` = the day after `generatedUntil` (or after the
   last existing event, on the first run), never before `today`.
3. `to` = `today` + 2 months, by calendar month (a small exported month adder next to `monthEnd`).
4. For each `daysOnWeekday(weekDay, from, to)` with no event of that template that day
   (`programmeKey`), create a **bare event**: template name, template hours via
   `combineLocalDateTime`, `status: draft`, `createdById: null`, no parts, no service parts. The job
   has its own create path; series creation keeps requiring an actor.
5. Raise `generatedUntil` (above). One system `audit()` per template run (count in metadata).

PR 1 also realigns the `isRecurring` column with the rule (`updateTemplate` recomputes it from
`weekDay`; the migration sets it to `weekDay IS NOT NULL`), so the column stops contradicting
behaviour.

Consequences:

- **A deleted event never comes back** — nothing creates a day at or below `generatedUntil`.
  Deleting the assembly week's meeting is how a congregation says « no meeting ».
- **A moved event stays moved** (a circuit overseer's Tuesday): the job never edits existing rows.
- **New congregations** get their first 2 months from the same function, called from both seeding
  paths in this repo (`register-congregation.server.ts`, `setup-first-account.server.ts`). Any other
  provisioning path that seeds templates outside this repository must do the same, and set
  `attendanceKind` on the seeded keys.
- **Seeded weekdays** are Tuesday and Saturday; a congregation that never adjusted its templates gets
  bare events on those days until it does — the move offer below fixes them in one step.
- **Template weekday or hours change:** the save offers « Déplacer les N réunions à venir ». It
  moves each future event of the template that is still bare (no parts, no service parts, no
  attendance, `draft`) to the new weekday **within its own week** and to the new hours, so deleted
  weeks stay deleted. Events with a programme are never moved.
- **Deleting a template:** bare future events do not count as « in use »; deleting the template
  deletes them with it. Any other event still blocks the deletion, as today.
- **Series creation and bare events:** both `createProgrammeSeries` (which counts an existing event
  as « existing ») and `createProgrammeOnDay` (which throws `ProgrammeExistsError`) must instead
  give an existing **bare** event the template's parts and service parts — the event is reused, not
  duplicated. The same copy is exposed per event as « Créer le programme » on an event with no
  parts. The programme list shows such events, never hides them, labelled with the template's name
  and « Pas encore de programme » (e.g. « Réunion de semaine · Pas encore de programme ») instead of
  a draft status.

### 5.4 Screens

Mockups: design canvas, page « Assistance aux réunions » (three artboards). The examples below come
from a congregation meeting on Thursday and Sunday; the seeded defaults are Tuesday and Saturday.

- **Sidebar:** the « Programmes » group becomes **« Réunions »**: Programmes, Absences, Orateurs
  extérieurs, **Assistance**. Same rename for the permission category (§8).
- **Dashboard card** (`features/dashboard`), for holders of `can-record-attendance` or
  `can-correct-attendance`: appears at the event's `startDate` and stays until the end of that local
  day, for every event of a counted template (any status — a draft programme's meeting still
  happens). Two large numeric fields, each saved on its own, with « Par vous à 10:44 » under a saved
  one; a complete state (total, « modifiable jusqu’à minuit »). It reads « meetings under way
  today » from `attendance.queries.ts` through the events server barrel — one query, used by the card
  and the recorder-only page.
- **« Assistance » page** (`/attendance`), with `can-view-attendance`:
  - title row: service-year stepper (« Année de service 2026–2027 »); top bar: « Exporter » menu
    (S-88 PDF, Excel);
  - metric strip: midweek average, weekend average (each vs the same period last year), online
    share, meetings entered « 21 sur 22 tenues »;
  - chart card: monthly average, current year emphasised over last year muted; toggles Semaine /
    Week-end, Total / En salle / Visio, Chart / Table;
  - meeting list grouped by month (month header carries its averages; past months folded): state
    first (Saisie, À compléter, En cours, Pas de réunion), date, type, hall, online, total; views
    « Toutes », « À compléter · n », « Comptées à part »;
  - side panel (≥ 1280 px, bottom sheet on a phone): the two counts, live total, « Tant qu’un des
    deux nombres manque, la réunion ne compte pas dans les moyennes », history, ↑/↓ walk. Editable
    only with `can-correct-attendance` (or a recorder inside the window, §6.3).
- **Recorder-only page:** with `can-record-attendance` alone, `/attendance` shows only today's
  meeting(s) under way with the same two fields — no metrics, history or export. Outside a meeting:
  « Aucune réunion en cours. La saisie s’ouvre au début de la prochaine, jeudi 19 novembre à 19:00. »
- **Programme line:** when the congregation setting is on, the week under way on the board's
  programme document and in the programme reader view carries « Assistance la semaine passée :
  jeudi 12 nov. — · dimanche 15 nov. 119 » — **total only**, complete meetings only (« — » otherwise).
- **Exports**, for the service year shown:
  - **S-88 (PDF):** the printed card's layout — **two service years side by side** (the one shown and
    the previous one), each with midweek and weekend columns: per month, number of meetings, total
    attendance, average per meeting; the year's averages at the foot;
  - **Excel:** one row per meeting (date, type, in person, online, total) plus a monthly summary
    sheet.
- **Settings:** the template's « Assistance » select (§5.2); a switch in Réglages › Programmes,
  « Afficher l’assistance sur le programme », off by default, applied at once.
- **Empty state:** « Aucune réunion n’est encore comptée. Choisissez dans vos modèles de programme
  quelles réunions le sont. » + link, for whoever can configure templates.

## 6. Rules

### 6.1 What counts

- A meeting **counts** when its template is `midweek` or `weekend` **and** both counts are set.
- A meeting belongs to the month of its **local** start date (congregation time zone).
- Service year: September → August (`serviceYearMonths` / `toServiceYear`, already exported from the
  publishers barrel; importing them is allowed. Moving them to `shared/` is optional tidying, to avoid
  deepening the existing two-way coupling between `events` and `publishers`).

### 6.2 Figures

- Monthly average per type = total attendance of counted meetings ÷ number of counted meetings.
- Year average = year total ÷ year count (never an average of monthly averages).
- « Même période l’an dernier » = the same months of the previous service year, up to the current
  month.
- Online share = Σ online ÷ Σ (in person + online), over counted meetings.
- Averages are rounded half up to a whole number for display and export, as the branch expects;
  computations keep full precision.

### 6.3 Who may write what

| Situation | `can-record-attendance` | `can-correct-attendance` |
|---|---|---|
| Before the meeting starts | nothing | set or change anything |
| Meeting under way, count empty | set it | set it |
| Meeting under way, count set by the same account | change it | change it |
| Meeting under way, count set by someone else | read only | change it |
| After local midnight of the meeting day | nothing | set or change anything |

The entry window is `[event.startDate, endOfDay(dayOf(event.startDate, tz), tz)]` (helpers in
`shared/utils/calendar-day.ts`). Corrections outside the window, or of another account's count, are
audited as `AttendanceCorrected` with old and new values. The rule lives in
`events/model/attendance-access.ts`, mirroring the activity pair `canRecordAnyActivity` /
`canCorrectAnyActivity`; actions delegate to it, so it is registered in `DELEGATES`
(`check-action-permissions`) and `POLICY_HELPERS` (`check-permission-coverage`).

### 6.4 Deleting a programme never deletes attendance

Programmes and attendance are unrelated: programme rights must not decide the fate of counts, and
attendance rights must not be needed to tidy programmes. Until the schedule refactor (§11), though,
« delete the programme » deletes its `Event`, and the cascade would take the counts with it. So the
server functions (`deleteEvent`, `bulkDeleteEvents` in `events/server/event-parts.server.ts`) split
the two:

- **Event without counts:** unchanged — the event is deleted (that is also how a future assembly week
  is removed).
- **Event with counts:** only the programme goes — its parts and service parts are deleted, the event
  stays as a bare event (« <template name> · Pas encore de programme ») with its attendance intact.
  No confirmation and no attendance right involved: nothing of the attendance is touched.
- Bulk delete applies the same rule per event and reports how many were deleted and how many were
  emptied.
- The event's deletion or emptying is audited (`EventDeleted` / `ProgrammeRemoved`), as today's
  `deleteEvent` audits nothing.

This is exactly what the schedule refactor will make structural: deleting a programme removes a
schedule and never touches the event or its attendance.

## 7. Data & code changes

| Area | Change |
|---|---|
| `schema.prisma` + migration | `Attendance` (+ RLS, standard `CASE WHEN` policy), `EventTemplate.attendanceKind` (+ CHECK, backfill by key), `EventTemplate.generatedUntil` (string day), `Event.createdById` nullable **with `onDelete: Restrict` kept**, `isRecurring` realigned to `weekDay IS NOT NULL` |
| `events/model/` | `attendance-stats.ts` (monthly, yearly, comparison, online share, « Pas de réunion » gaps), `attendance-access.ts` (§6.3), `attendance-kind.type.ts`, an exported calendar-month adder |
| `events/server/` | `attendance.aggregate.ts` (atomic per-count writes, audited), `attendance.queries.ts` (service year, meetings under way, last week's totals), `recurring-events.server.ts` (§5.3, shared by the job and both seeding paths), `recurring-events-queue.server.ts`, `attach-template-programme.server.ts`, move-future-events on template save, `generatedUntil` raised by series creation, bare-event reuse in `createProgrammeSeries` / `createProgrammeOnDay`, template deletion ignoring bare future events, programme deletion that keeps an event with counts (§6.4); new exports in `events/index.server.ts` |
| `events/jobs/` + worker | `handle-recurring-events-work.server.ts`; `QUEUE_NAMES` entry; scheduler and its readiness entry in `workers/worker.server.ts` |
| `events/attendance.routes.ts` + `events/routes/attendance/` | page, record/correct actions, `s88.pdf`, `export.xlsx`; registered in `app/routes.ts` |
| `events/server/seed-templates.server.ts`, `duplicate-template.server.ts` | set / copy `attendanceKind` |
| `events/server/event-templates.server.ts` | `updateTemplate` recomputes `isRecurring` from `weekDay` |
| `dashboard/` | meetings-under-way card (reads the events query) |
| `display-board/` | programme document line (setting on), in a new file — `dynamic-documents.server.ts` is already large (exempt from the size check) |
| `settings/` | template « Assistance » select (new component, not more lines in `templates/edit.tsx`); programme switch; `CongregationSettingKey.ProgrammeShowsAttendance` |
| `shared/types/` | permission enum, `permission_desc_*` messages (fr + en), `PERMISSION_TO_CATEGORY`, category label « Réunions » / « Meetings » |
| Absence code | every `createdBy` read on day-offs keeps working on a nullable relation (day-offs always have a creator — guaranteed by `Restrict`); typecheck flags each site |
| Data transfer | see §7.1 |
| Demo seed | attendance for every counted past event, from aggregate figures |
| Audit | `AttendanceRecorded`, `AttendanceCorrected`, `RecurringEventsCreated`, `EventsMoved`, `EventDeleted`, `ProgrammeRemoved` — rows in `settings/model/audit-actions.ts` (group `programmes`) with fr/en labels; `Attendance` in `audit-entities.ts` |
| CI scripts | `attendance` in `AGGREGATE_MODELS`; the access helper in `DELEGATES` / `POLICY_HELPERS`; queue and job handler covered by co-located tests |
| Docs | `CLAUDE.md` and `permissions-and-roles.md` (45 → 48 permissions), `row-level-security.md` table list, `data-transfer.md` (version, files, the templates row that wrongly says « Skip ») |

### 7.1 Data transfer

- `ARCHIVE_VERSION` 2.14 → 2.15; 2.14 joins `SUPPORTED_ARCHIVE_VERSIONS`; `attendance` in
  `ENTITY_FILES`; its export step comes after `events` in `buildExportSteps`.
- `inPersonById` / `onlineById` are remapped through `idMap.getOptional('user-accounts', …)`; an
  unmapped account becomes null.
- Templates: `attendanceKind` is exported. Importing a pre-2.15 archive must not overwrite an existing
  template's value (the same `record.x != null` guard as `color`), and templates it creates get the
  key-based defaults. `generatedUntil` is **not** exported: a null mark makes the first run start after
  the last imported event.
- Events: a creator that is null **or unmapped** becomes null for non-day-off events instead of
  skipping the event (day-offs without an owner are still skipped).
- **No duplicates:** a fresh congregation already has bare events from seeding (§5.3). Importing an
  event on the same `programmeKey` as a bare event replaces the bare event instead of adding a second
  one.
- `import-congregation.server.ts` is at 346 of 350 lines: the attendance step goes in its own
  `import-attendance.server.ts`, like the other steps.

## 8. Permissions

| Key | Description shown on « Rôles et autorisations » (`permission_desc_*`, fr) |
|---|---|
| `can-record-attendance` | Saisir l’assistance de la réunion en cours, jusqu’à minuit. |
| `can-correct-attendance` | Corriger l’assistance de toute réunion, à tout moment. Chaque correction va au journal. |
| `can-view-attendance` | Consulter l’assistance : moyennes, historique, exports S-88 et Excel. |

- Category `programs`, relabelled **« Réunions »** (key unchanged — label only, no data change);
  11 permissions after this spec.
- `PERMISSION_REQUIRES`: `can-correct-attendance` → `can-view-attendance` (the correction screen is
  the attendance page).
- The migration inserts the `Permission` rows only. Admins hold them through `can-do-anything`; each
  congregation then grants them to its own roles.
- They ship with the first route that enforces them (PR 3): `test:permission-coverage` fails on a
  permission nothing enforces.

## 9. Deployment safety

The migration runs before the running image is replaced, so the old image must keep working on the
new schema:

- **`onDelete: Restrict` is written out** on the now-optional `Event.createdBy`. Without it Prisma
  emits `ON DELETE SET NULL`, and deleting an account would empty the owner of its day-offs — which
  the absences list (old and new image alike) reads without a null check.
- **PR 1** makes `createdById` nullable but nothing writes a null: the job, the import change for
  null or unmapped creators and the seeding of bare events all ship in **PR 2**, once the image that
  reads `createdBy` as optional is the one running.
- Any other service that reads `Event` through its own copy of the schema must have that copy
  refreshed and deployed before PR 2's first null creator is written.
- `attendanceKind` and `generatedUntil` are additive with defaults; `Attendance` is a new table.

## 10. Phasing

| PR | Content |
|---|---|
| 1 | Schema + migration (incl. `isRecurring` realignment), stats and access model, attendance aggregate and queries (TDD), template « Assistance » select, seeding/duplicate of `attendanceKind`, data transfer of `attendance` and `attendanceKind` (archive 2.15), demo seed, programme deletion that keeps counts (§6.4) |
| 2 | Recurring-events job, queue and readiness, seeding of the first 2 months on both paths, `generatedUntil` raised by series creation, bare-event reuse, « Créer le programme », move future events on template save, template deletion with bare events, import of null/unmapped creators and bare-event replacement |
| 3 | Permissions + category label « Réunions », dashboard card, « Assistance » page and side panel, recorder-only view, programme line + switch, sidebar « Réunions » |
| 4 | S-88 PDF and Excel exports |

## 11. Later: schedules (agreed direction, separate spec)

`Event` stays « anything on the congregation's calendar ». Its content moves to **schedules**: a
`Schedule` linked to an event — the spiritual programme (today's `EventPart`) and duty schedules
(today's `EventServicePart`: services, and later others) — each with its own draft/published status,
so duties can be published without waiting for the programme. Templates mirror it with a
`TemplateSchedule` carrying the responsible role (generalising `TemplateResponsible.scope`).
Proposed steps: move personal absences out of `Event`; add `Schedule`/`TemplateSchedule` with a
backfill (expand/contract over several releases); drop the old columns. **`Attendance` stays on
`Event` and is unaffected.**

## 12. Testing

- **Unit (TDD):** stats (counted vs partial meetings, month by local date across a DST change,
  year average vs average of averages, comparison window, gaps); access rule (before start, during,
  after local midnight, other account's count); recurring-events planning (first run after the last
  event, first run with programmes beyond the horizon, deleted day not recreated, a day passed in a
  series past the horizon never refilled, moved event untouched, suspended or inactive congregation
  skipped, system templates skipped); move-in-week; calendar-month adder.
- **Service:** record/correct permissions, audit entries and the atomic write (two first counts
  arriving together both stick); attach-template-programme on a bare event; `createProgrammeOnDay`
  reusing a bare event; template-save move offer counts only bare future events; template deletion
  with only bare events; delete rule (an event with counts loses only its programme, single and bulk).
- **Integration:** RLS on `Attendance`; job end to end on a scratch congregation; job and series
  creation concurrently on one template; account deletion with day-offs still refused
  (`Restrict`); import/export round-trip including null creators, a pre-2.15 archive, and an import
  over seeded bare events.
- **E2E:** recorder enters the hall count from the dashboard card and a second account the online
  count; corrector fixes a past meeting from the side panel.

## 13. Open questions

Decided: whole-number averages (§6.2); two service years side by side on the S-88 (§5.4); an event
without programme reads « <template name> · Pas encore de programme » (§5.3). No switch to turn the
recurring-events job off: bare events are drafts, invisible outside the programme list, and they are
what the attendance card records against.

Also decided: deleting a programme never deletes attendance — an event with counts loses only its
programme (§6.4); programme and attendance rights stay unrelated.

No open question remains.
