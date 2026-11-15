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
- **`EventTemplate.isRecurring`** is not a separate control: saving a template sets it to
  `data.weekDay != null` (`settings/server/event-template.server.ts:21`). « Recurring » means « has a
  weekday ».
- **Each meeting held is an `Event`** with its real `startDate`/`endDate`. Series creation
  (`events/model/programme-creation.ts` → `plannedSeries`, `daysOnWeekday`; server
  `programme-creation.server.ts` → `createProgramme`) creates one event per day **with its parts and
  service parts copied from the template**. A day the person « passes » (a circuit assembly week)
  leaves no row at all. Local times go through `combineLocalDateTime(day, time, timezone)` with
  `Congregation.timezone`.
- **`Event.status`** (`draft` | `released`) publishes the whole event. Drafts are invisible to the
  board, notifications and publisher-facing dashboards.
- **`Event.createdById` is required** and points to a `UserAccount`. For meetings it is only
  provenance; for **day-offs it is the owner** — absences resolve to a person through
  `Event.createdBy.memberId` (`refresh-conflict-flags.server.ts`, `slot-candidate-facts.server.ts`,
  `event-part-assignments.server.ts`, `member-engagement.queries.ts`, `days-off.*`,
  `personal-assignments.server.ts`). `import-events.server.ts` **skips** an event whose creator is
  not in the archive.
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
  `audit()` accepts a missing `actorId` (system action).
- **Exports:** `exceljs` already backs the yearly activity export and the territory S-13;
  react-pdf backs the PDF exports. `serviceYearMonths()` lives in
  `publishers/model/pioneer-pace.ts` (not importable from `events` across the feature boundary).

## 5. Design overview

### 5.1 Data model

```prisma
model Attendance {
  id        Int   @id @default(autoincrement())
  event     Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  eventId   Int   @unique

  // Null = not entered yet, never 0. Both must be set for the meeting to count in averages.
  inPerson         Int?
  inPersonById     Int?        // UserAccount — who entered or last changed it
  inPersonAt       DateTime?
  online           Int?
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
  // How far the recurring-events job has created this template's events: a local day, inclusive.
  // Date-only on purpose — a timestamp holding "a day" is the midnight-UTC trap absence.ts documents.
  generatedUntil DateTime? @db.Date
}

model Event {
  // …existing fields
  createdBy   UserAccount? @relation("createdBy", fields: [createdById], references: [id])
  createdById Int?          // null = created by the recurring-events job
  attendance  Attendance?
}
```

- One attendance row per event, created on the first count. Deleting an event deletes its counts —
  an event is the meeting; no meeting, no attendance.
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
`weekend`, `memorial` → `separate`, everything else → `none`. System templates are forced to `none`
(the field is not editable on them). A special talk is held at the weekend meeting, so it counts as
an ordinary weekend meeting with no extra rule.

### 5.3 Recurring events are created automatically

A daily worker job (`recurring-events`, registered with `upsertJobScheduler`, at 01:00 UTC — before
campaigns and retention) keeps every recurring template's events created **2 months ahead**.

For each non-suspended congregation, inside `withScope`, for each template with
`isRecurring = true` and `weekDay != null`:

1. `from` = the day after `generatedUntil`; on the first run, the day after the template's last
   existing event, or today if it has none. Never before today.
2. `to` = today + 2 months (congregation's local day).
3. For each `daysOnWeekday(weekDay, from, to)` with no event of that template that day
   (`programmeKey`), create a **bare event**: template name, template hours via
   `combineLocalDateTime`, `status: draft`, `createdById: null`, no parts, no service parts.
4. Set `generatedUntil = to`. One system `audit()` per template run (count in metadata).

Consequences:

- **A deleted event never comes back** — the job only moves forward past `generatedUntil`. Deleting
  the assembly week's meeting is how a congregation says « no meeting ».
- **A moved event stays moved** (a circuit overseer's Tuesday): the job never edits existing rows.
- A new congregation gets its first 2 months at registration (run the same function once from the
  seed path).
- **Template weekday or hours change:** the save offers « Déplacer les N réunions à venir ». It
  moves each future event of the template that is still bare (no parts, no service parts, no
  attendance, `draft`) to the new weekday **within its own week** and to the new hours, so deleted
  weeks stay deleted. Events with a programme are never moved.
- **Series creation and bare events:** `plannedSeries` treats an existing event as « already
  there ». An existing **bare** event must instead receive the template's parts and service parts
  (the event is reused, not duplicated). The same copy is exposed per event as « Créer le
  programme » on an event with no parts — the programme list shows such events, never hides them,
  labelled with the template's name and « Pas encore de programme » (e.g. « Réunion de semaine ·
  Pas encore de programme ») instead of a draft status.

### 5.4 Screens

Mockups: design canvas, page « Assistance aux réunions » (three artboards).

- **Sidebar:** the « Programmes » group becomes **« Réunions »**: Programmes, Absences, Orateurs
  extérieurs, **Assistance**. Same rename for the permission category (§8).
- **Dashboard card** (`features/dashboard`), for holders of `can-record-attendance` or
  `can-correct-attendance`: appears at the event's `startDate` and stays until the end of that local
  day, for every event of a counted template (any status — a draft programme's meeting still
  happens). Two large numeric fields, each saved on its own, with « Par vous à 10:44 » under a saved
  one; a complete state (total, « modifiable jusqu’à minuit »). Needs a new query, « meetings under
  way today », beside `getNextMeeting`.
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
- Service year: September → August (`serviceYearMonths`, moved to `shared/` so both features use it).

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
| Meeting under way, count empty | set it | set it |
| Meeting under way, count set by the same account | change it | change it |
| Meeting under way, count set by someone else | read only | change it |
| After local midnight of the meeting day | nothing | set or change anything |

The entry window is `[event.startDate, end of the event's local day]`. Corrections outside the
window, or of another account's count, are audited as `AttendanceCorrected` with old and new values.

### 6.4 Deleting an event that has counts

Until the schedule refactor (§11), deleting a programme deletes its `Event`, and the cascade would
take its counts with it — a secretary tidying old programmes (`programs/bulk-delete`) would wipe the
S-88 history. So:

- Deleting a single event with counts asks for confirmation and says the counts are deleted too
  (« Cette réunion a une assistance enregistrée (119). Elle sera supprimée avec la réunion. »).
- Bulk delete leaves out events with counts and says how many were kept.
- Deleting a future event without counts (an assembly week) is unchanged.

This is a stopgap: once schedules exist, deleting a programme removes a schedule and never touches
the event or its attendance.

## 7. Data & code changes

| Area | Change |
|---|---|
| `schema.prisma` + migration | `Attendance` (+ RLS), `EventTemplate.attendanceKind` (+ CHECK, backfill by key), `EventTemplate.generatedUntil`, `Event.createdById` nullable, `Permission` rows for the three keys |
| `events/model/` | `attendance-stats.ts` (monthly, yearly, comparison, online share, « Pas de réunion » gaps), `attendance-window.ts` (§6.3), `attendance-kind.type.ts` |
| `events/server/` | `attendance.aggregate.ts` (record, correct — audited), `attendance.queries.ts` (service year, meetings under way), `recurring-events.server.ts` (§5.3, shared by the job and registration), `attach-template-programme.server.ts` (copy parts onto a bare event), move-future-events on template save |
| `events/jobs/` | `handle-recurring-events-work.server.ts`; scheduler in `workers/worker.server.ts` |
| `events/attendance.routes.ts` + `events/routes/attendance/` | page, record/correct actions, `s88.pdf`, `export.xlsx`; registered in `app/routes.ts` |
| `events/routes/programs/` | delete and bulk delete guard events with counts (§6.4) |
| `dashboard/` | meetings-under-way card + server function |
| `display-board/` | programme document line (setting on) |
| `settings/` | template « Assistance » select; programme switch; `CongregationSettingKey.ProgrammeShowsAttendance` |
| `shared/` | `serviceYearMonths` moved out of `publishers/model`; permission enum, descriptions, category label « Réunions » / « Meetings » |
| Absence code | every `createdBy.memberId` read on day-offs keeps working on a nullable relation (day-offs always have a creator); typecheck flags each site |
| Data transfer | export/import `attendance.ndjson`; `attendanceKind` on templates; `import-events` accepts a null creator for non-day-off events instead of skipping them |
| Demo seed | attendance for every counted past event, from aggregate figures |
| `CLAUDE.md` | permission count (45 → 48) |
| Audit | `AttendanceRecorded`, `AttendanceCorrected`, `RecurringEventsCreated`, `EventsMoved`; entity name for `Attendance` in the journal |

## 8. Permissions

| Key | Label (FR) | Description |
|---|---|---|
| `can-record-attendance` | Saisir l’assistance | Les nombres de la réunion en cours, jusqu’à minuit. |
| `can-correct-attendance` | Corriger l’assistance | Toute réunion, à tout moment. Chaque correction va au journal. |
| `can-view-attendance` | Consulter l’assistance | Moyennes, historique, exports S-88 et Excel. |

- Category `programs`, relabelled **« Réunions »** (key unchanged — label only, no data change);
  11 permissions after this spec.
- `PERMISSION_REQUIRES`: `can-correct-attendance` → `can-view-attendance` (the correction screen is
  the attendance page).
- The migration inserts the `Permission` rows only. Admins hold them through `can-do-anything`; each
  congregation then grants them to its own roles.

## 9. Deployment safety

The migration runs before the running image is replaced, so the old image must keep working on the
new schema:

- **PR 1** makes `createdById` nullable but writes no null; old code never meets one.
- The recurring-events job (the first writer of null creators) ships in a **later PR**, once the image
  that reads `createdBy` as optional is the one running.
- `attendanceKind` and `generatedUntil` are additive with defaults; `Attendance` is a new table.

## 10. Phasing

| PR | Content |
|---|---|
| 1 | Schema + migration, permissions + category label, `serviceYearMonths` move, stats/window model, attendance aggregate and queries (TDD), template « Assistance » select, data transfer, demo seed |
| 2 | Recurring-events job + registration seeding, bare-event reuse in series creation, « Créer le programme », move future events on template save |
| 3 | Dashboard card, « Assistance » page and side panel, recorder-only view, programme line + switch, sidebar « Réunions » |
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
  year average vs average of averages, comparison window, gaps), entry window (before start, during,
  after local midnight, other account), recurring-events planning (first run after last event,
  deleted day not recreated, moved event untouched, suspended congregation skipped), move-in-week.
- **Service:** record/correct permissions and audit entries; attach-template-programme on a bare
  event; template-save move offer counts only bare future events.
- **Integration:** RLS on `Attendance`; job end to end on a scratch congregation; import/export
  round-trip including null creators.
- **E2E:** recorder enters the hall count from the dashboard card and a second account the online
  count; corrector fixes a past meeting from the side panel.

## 13. Open questions

Decided: whole-number averages (§6.2); two service years side by side on the S-88 (§5.4); an event
without programme reads « <template name> · Pas encore de programme » (§5.3). No switch to turn the
recurring-events job off: bare events are drafts, invisible outside the programme list, and they are
what the attendance card records against.

No open question remains.
