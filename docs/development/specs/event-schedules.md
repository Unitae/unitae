# Spec: Event schedules — programmes and duty schedules, each published on its own

**Status:** Draft — direction agreed with the author; design level. Meeting attendance has shipped
([Meeting Attendance](../meeting-attendance.md)); the implementation plan is
[event-schedules-plan.md](./event-schedules-plan.md).
**Author:** Nathanaël Cherrier
**Feature area:** `features/events` (events, templates, programmes, absences) + `features/dashboard` +
`features/display-board` + `features/settings` (templates, data transfer)
**Related:** [Meeting Attendance](../meeting-attendance.md), [Permissions & Roles](../permissions-and-roles.md),
[Architecture Conventions](../architecture-conventions.md), [Data Transfer](../data-transfer.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state behavior
> should be folded into the relevant `docs/` pages and this file archived.

## 1. Problem

An `Event` today is three things at once:

- **the meeting** — a template, a date, start and end times;
- **its content** — the spiritual programme (`EventPart`) and one fixed list of service duties
  (`EventServicePart`: sono, estrade, accueil, nettoyage);
- **its publication** — one `status` (`draft` | `released`) for all of it.

So the brother who prepares the duties waits for the programme to be ready (or the reverse) before
anything can be published. A congregation cannot add a rota of its own (a separate « Accueil » team, a
« Visioconférence » rota) without it landing in the one services list. And personal absences
(« Mes absences ») are stored as events with the `day-off` template, which every query on meetings has
to filter out.

## 2. Goals / Non-goals

**Goals**

- `Event` = **anything on the congregation's calendar** (meetings, Mémorial, other events) — nothing
  else.
- An event holds **any number of schedules**, each with its **own draft/published status**: the
  spiritual programme and as many duty schedules as the congregation wants, named freely.
- Templates describe **schedules** (one template per schedule, one responsible each); what an event
  is (weekday, times, attendance) moves to an **event kind**.
- Personal absences get **their own table**.
- Cover the other schedules a congregation produces — cleaning by group, public witnessing points,
  field service meetings, theocratic and shared-building events — **with events alone**: multi-day
  events, duties assigned to groups, custom fields on event kinds, weekly repetition rules. What each
  printed sheet looks like is a matter of board documents ([event documents](./event-documents.md)).
- A **weekly calendar view** of events beside a redesigned list (§6.1).
- No behaviour regression: the board, dashboard, notifications, conflicts, calendar feed and archive
  keep working throughout, with the old image running on the new schema during each rollout.

**Non-goals**

- **Rotation** (filling a duty across a series of events by cycling through groups or places) — a
  later feature on top of this model.
- Events organised by other congregations sharing the building, visible cancellations, room booking —
  later.
- New permissions — the existing programme permissions cover every schedule (§3).
- Attendance — it stays on `Event` and is unaffected ([Meeting Attendance](../meeting-attendance.md)).

## 3. Decisions already taken

| # | Decision |
|---|---|
| D1 | Personal absences move out of `Event` into their own table. |
| D2 | An event can have as many schedules as wanted; congregations create custom ones. |
| D3 | The congregation-wide programme permissions (« Gérer », « Attribuer », « Publier les programmes ») keep covering **every** schedule. Rights specific to one kind of schedule go through the schedule's template (its responsible role), as today. |
| D4 | The board's programme document keeps showing the duties under the meeting, as it already shows the service parts — now schedule by schedule, published ones only. |
| D5 | ~~Weekly schedules stay out of scope.~~ Superseded by D14: a week is a multi-day event. |
| D6 | Deleting a programme never deletes the event or its attendance. Shipped with attendance: today an event with counts loses its parts and services and goes back to draft; with schedules, deleting a schedule simply never touches the event. |
| D7 | **Templates describe schedules, not events.** One template per schedule (« Programme de la réunion de semaine », « Services », « Nettoyage »…), each with **one responsible role**. There is no whole-event responsible any more. |
| D8 | Publishing respects the template's rights: a responsible may publish the schedules of their template only; bulk publish acts only on the selected schedules the person may publish and says how many it skipped. |
| D9 | **At most one programme schedule per event**; duty schedules are unlimited. |
| D10 | ~~Absences stay owned by a user account.~~ Superseded by D27. |
| D11 | Event kinds and shared schedule templates (§5): confirmed. |
| D12 | Creating events by hand (single day or series): the schedules suggested by the kind are **pre-selected** in the creation form and can be unticked — today's « create a programme » keeps creating it in one step. Recurring events stay empty meetings (§5.1a). To revisit with usage. |
| D13 | A duty is assigned to a **person, a publisher group or free text** (another congregation, an outside body). |
| D14 | **Multi-day events**: an event kind can last several days (« Semaine de nettoyage », Monday to Sunday). Weekly schedules are duty schedules on such events. |
| D15 | **Custom fields** defined on the event kind (« Lieu », « Salle », « Format »…), values on each event; no dedicated place model. A field decides once whether it shows on documents — **including on print**: people without an account rely on the printed sheet (e.g. the videoconference access details). |
| D16 | **Several events of the same kind every week** (eight field service meetings): repetition lives in **rules**, not on the kind. « Répéter chaque semaine » on an event creates one. |
| D17 | Printed layouts (events list by kind, tables, weekly timetable) are **board documents** built on events, specified separately. |
| D18 | A **weekly calendar view** of events joins the list, which is redesigned. |
| D19 | Word: « planning » (FR) / « schedule » (EN) for a schedule; « Programme » / « Program » for the spiritual one. |
| D20 | **Rules have validity dates.** « Modifier à partir du … » ends the current rule the day before and starts a new one; the « Semaine type » sheet shows changes to come (« à partir du 1er déc. »). |
| D21 | **One-time change**: an event created by a rule can be changed on its own (time, place, any field) or deleted, without touching the rule; a later rule change never overwrites it. |
| D22 | **« Cette réunion et les suivantes » keeps the rule shipped with attendance**: empty meetings move by themselves; prepared ones are offered (« Déplacer aussi les N réunions préparées »), and their assignees are told; a meeting with attendance counts never moves. |
| D23 | **Attendance only on one-day kinds**: a kind lasting several days is always « Non comptée » (`attendanceKind = 'none'`). |
| D24 | **A duty assigned to a group** notifies the group's overseer and assistant (e-mail; push later); every member of the group sees it on the dashboard (« Mes prochaines affectations ») and in their calendar feed. No absence conflict and no cadence for a group or text assignee. |
| D25 | New congregations get the **same three seeded kinds** as today (midweek meeting, weekend meeting, Mémorial); congregations add the others. |
| D26 | The **demo seed** shows the new kinds (cleaning weeks by group, field service meetings, public witnessing) from the PR that ships rules, fields and group assignees. |
| D27 | **An absence belongs to the person**: the publisher record when the account has one, the account otherwise. It follows the record when an account is unlinked or linked; deleting an account deletes only its absences without a record. Events an account prepared keep their schedules and lose only their author. |
| D28 | **Event-level rights** (no whole-event responsible, D7): « Gérer les programmes » everywhere; a responsible of a schedule template the kind suggests may create events of that kind (its suggested schedules created as drafts), change their date, hours, fields and kind, and delete one that has no schedule but theirs. |
| D29 | **The board's programme document** is configured per event kind with the schedule templates it shows, the suggested ones ticked by default. |
| D30 | **No « Fusionner »** for schedule templates: a congregation points its kinds at one template and deletes the other. |

## 4. Current implementation (verified)

- `Event` has `status`, `eventParts`, `eventServiceParts`, `templateId`, `createdById` (null = created
  by the recurring-events job) and `attendance`. Both item tables hang off `eventId` with
  `onDelete: Cascade`.
- `EventTemplate` has `parts` (`TemplatePart`), `serviceParts` (`TemplateServicePart`) and
  `responsibles` (`TemplateResponsible`, one row per `scope`: `programme` | `service`). The scopes are
  not peers: `programme` covers the whole event including service parts, `service` covers only the
  service parts (`events/model/responsibility-scope.type.ts`, `scopesCovering`). It also carries
  what attendance added: `attendanceKind` (`none` | `midweek` | `weekend` | `separate`) and
  `generatedUntil`, the high-water mark of its recurring events. `isRecurring` is kept equal to
  `weekDay != null`.
- **Publication** is `releaseEvent` / `unreleaseEvent` (`events/server/event-status.server.ts`), which
  compute notification targets from both part lists at once. About 26 files read `Event.status`
  (dashboard queries, board documents and links, programme list, conflicts, share messages, cadence).
  Attendance deliberately ignores it: the dashboard card, the attendance page, its exports and the
  programme's « last week » line read every event of a counted template, draft or not.
- **Items:** `eventParts` / `eventPart.*` appear in ~25–29 files, `eventServiceParts` /
  `eventServicePart.*` in ~18–22.
- **Meetings created ahead** ([Meeting Attendance](../meeting-attendance.md)): a daily job
  (`extendRecurringEvents`) keeps every recurring template's events created two months ahead as
  **empty meetings** — no author, no part, no service, no attendance (`EMPTY_MEETING`,
  `events/server/empty-meetings.queries.ts`). It only creates after the template's `generatedUntil`,
  which every creation path raises, so a deleted or passed week never comes back. Nothing keys an event
  on (template, day): the job, series creation and moving empty meetings all lock the template row
  first (`lockTemplates`), and `recurring-events-race.integration.test.ts` proves the job and a series
  together never create a day twice.
- **Only empty meetings are touched automatically.** They move with their template's weekday or hours
  through the explicit « Déplacer les N réunions à venir » (`moveEmptyMeetings`, each to the new day of
  its own week), take the new zone's hours when the congregation's time zone changes
  (`reanchorEmptyMeetings`), are deleted with their template and on a day a series passes on purpose.
  Meetings with a programme, an author or counts are never moved or deleted that way.
- **Creation** (`programme-creation.server.ts`): `createProgrammeSeries` and `createProgrammeOnDay`
  give an existing event without a programme the template's parts and services (`fillMeeting`)
  instead of creating a second one; an empty meeting takes the person as author. The programme list
  shows such events as « <template name> · Pas encore de programme ».
- **Deletion** (`delete-events.server.ts`): an event without counts is deleted; an event with counts
  only loses its parts and services and goes back to draft (D6), its attendance intact.
- **Absences:** day-off events, owned through `Event.createdBy` (an account, resolved to a member
  through `createdBy.memberId`); ~17 files reference the `day-off` template key.
- **Board:** `ProgrammeView` renders an event's parts, then its services in two foldable columns, and
  the « Assistance la semaine passée » line when the congregation turned it on.
- **Archive:** version 2.15; events, templates, parts, service parts and attendance are separate
  files.

## 5. Target model

Today's `EventTemplate` mixes two things that D7 separates:

- **what an event is** — name, weekday, start and end times, colour, attendance kind, recurrence:
  an **event kind** (the « event kind name » the programme list already shows on a meeting without
  a programme);
- **what a schedule contains** — parts or duties and who fills them: a **schedule template**.

```prisma
model EventKind {                   // today's EventTemplate, minus its content and its single weekday
  id, key, name, colour
  attendanceKind String @default("none") // as shipped; 'none' whenever durationDays > 1 (D23, CHECK)
  durationDays Int @default(1)      // D14: 7 for « Semaine de nettoyage », Monday to Sunday
  defaultStartTime, defaultEndTime  // prefilled on new events and rules
  fields                    EventKindField[]               // D15
  rules                     RecurrenceRule[]               // D16
  defaultScheduleTemplates  EventKindScheduleTemplate[]    // suggested when adding schedules (§5.1)
  events                    Event[]
}

model EventKindField {              // D15 — a custom field of a kind
  id, eventKindId, name, type ('text' | 'longText' | 'choice' | 'link'), options String[], order
  showOnDocuments Boolean @default(true)   // board documents, screen and print alike
}

model RecurrenceRule {              // D16 — « Répéter chaque semaine »
  id, eventKindId, weekDay, startTime, endTime
  fieldValues    Json               // copied onto each event it creates (place, format…)
  validFrom      String             // D20 — local day `YYYY-MM-DD`, inclusive
  validUntil     String?            // D20 — null = open-ended
  generatedUntil String?            // today's template high-water mark, now per rule
}

model ScheduleTemplate {            // one per schedule, shared by any event kind
  id, name, kind ('programme' | 'duty')
  responsibleRole Role?             // ONE responsible (D7): may fill and publish schedules made from it
  parts  TemplatePart[]             // kind = programme
  duties TemplateDuty[]             // kind = duty (today's TemplateServicePart)
}

model EventKindScheduleTemplate {   // which schedule templates an event kind starts with, in order
  eventKindId, scheduleTemplateId, order
}

model Event {                       // anything on the calendar, one day or several (D14)
  id, name, description, startDate, endDate, eventKindId?, recurrenceRuleId?, createdById?, congregationId
  changedOnce Boolean @default(false) // D21 — edited on its own; later rule changes leave it alone
  fieldValues EventFieldValue[]     // D15
  schedules   Schedule[]
  attendance  Attendance?           // as shipped, unchanged
  // no status: an event is visible where it has at least one published schedule (exceptions: §5.3)
}

model EventFieldValue { eventId, fieldId, value }

model Schedule {                    // one schedule of one event
  id, eventId (onDelete: Cascade), scheduleTemplateId? (onDelete: SetNull), name, kind, order
  status  String @default("draft")  // 'draft' | 'published' — per schedule
  parts   EventPart[]               // kind = programme
  duties  EventDuty[]               // kind = duty (today's EventServicePart)
  // at most one programme schedule per event (D9): partial unique index on (eventId) where kind = 'programme'
}

model EventDuty {                   // today's EventServicePart, with a wider assignee (D13)
  // exactly one of these, or none (open): a CHECK keeps them exclusive
  assigneeId      Int?              // Member
  assigneeGroupId Int?              // PublisherGroup
  assigneeText    String?           // another congregation, an outside body
}

model Absence {                     // « Mes absences »
  id, startDate, endDate, note, congregationId
  memberId?                         // D27 — the person, when the account has a record
  accountId?                        // who entered it; the owner when there is no record
}
```

### 5.0 What the other schedules become

| Printed sheet | Events | Schedules / fields |
|---|---|---|
| Cleaning by group | « Semaine de nettoyage », 7 days, one weekly rule | duty schedule « Nettoyage », duty assigned to a **group** |
| Public witnessing points | « Témoignage public », weekend, one weekly rule | duty schedule whose duties are the points, each assigned to a **group** |
| Field service meetings | « Réunion pour la prédication », **eight weekly rules** | fields « Lieu », « Format »; duty schedule « Conducteurs » (one or two people) |
| Theocratic events | circuit assembly, convention (multi-day), pioneer meeting, visit week, special talk, Mémorial | field « Lieu » |
| Shared-building events | one kind per kind of event | fields « Concerne », « Salle », « Modifications » (free text until G is designed) |

### 5.1 Event kinds and schedule templates

- A schedule template is **shared**: one « Services » template can serve both meeting kinds, with one
  responsible, instead of being copied into each.
- An event kind lists the schedule templates its events start with (e.g. « Réunion de week-end » →
  « Programme du week-end », « Services »). They are suggestions: « Ajouter un planning » on an event
  offers them first, then any other schedule template, then a blank one.
- Recurring events are still created as empty meetings; their schedules are added when someone
  prepares them, from the kind's suggestions.

### 5.1a Empty meetings

Today's `EMPTY_MEETING` becomes: **no author, no schedule, no attendance, not `changedOnce`**, and no
field value other than the ones its rule copied. It stays the single definition of what may be moved,
re-anchored or deleted without asking — on a rule change (§5.6), a time zone change, a series passing
the day, or the kind's deletion — and what a creation fills instead of duplicating: adding the kind's
suggested schedules to an empty meeting gives it the person as author, exactly as `fillMeeting` does
today.

### 5.2 Kinds of schedule

- **`kind` fixes the shape of the items**, not the name: a `programme` schedule holds parts (section,
  track, duration, reader slot, external speaker…); a `duty` schedule holds duties (name, preset,
  assignee, allowed roles). Names, number and order of duty schedules are free.
- At most one programme schedule per event (D9), enforced in the database.
- An event with **no schedule** is valid — « <event kind name> · Pas encore de programme ».

### 5.3 Publication

- Each schedule is published or unpublished on its own. Publishing notifies **that schedule's
  assignees only**.
- An event « appears » (board, dashboard, calendar feed, publisher views) through its **published
  schedules**; a draft schedule stays invisible exactly as a draft event is today.
- **Exceptions, as today:** attendance reads every event of a counted kind whether or not it has a
  published schedule — the dashboard card, the attendance page and side panel, the S-88 and spreadsheet
  exports, and the programme's « Assistance la semaine passée » line. A meeting whose programme is a
  draft still takes place. The programme list and the calendar show events without a published
  schedule to the people who prepare them, as the list shows « Pas encore de programme » today.
- Who may publish a schedule: holders of « Publier les programmes » (every schedule, D3), or holders of
  its template's responsible role (that template's schedules only, D8) — today's
  `filterToManageableEventIds` rule, applied per schedule.
- Bulk publish (programme list): acts on the selected schedules the person may publish, skips the rest
  and reports « 12 publiés, 4 ignorés (vous n’êtes pas responsable de ces plannings) ».
- The board's programme document shows, under each event, its published schedules in order: the
  programme's parts as today, each duty schedule as the services block is today (D4).

### 5.4 Responsibility

- Each schedule template has **one** responsible role (D7): holders may fill and publish the schedules
  made from it, on every event. Today's `programme`/`service` scopes and the « programme covers
  services » asymmetry (`scopesCovering`) disappear.
- Congregation-wide permissions cover every schedule (D3). No new permission key.

### 5.5 Absences

- `Absence` belongs to the person (D27): the record when there is one, read directly for conflicts,
  the account otherwise. Conflict checks, candidate facts, engagement and personal assignments read `Absence`
  instead of filtering day-off events.
- The `day-off` system template disappears once nothing writes day-off events.

### 5.6 Changing a repetition

Like a calendar application, an event that comes from a rule offers two ways to change it:

- **« Cette réunion seulement »** (D21): the change applies to this event, which is marked
  `changedOnce`. Deleting one occurrence is the same: it is gone and never recreated (high-water mark).
  A date beyond the 2-month horizon can be created early by hand to change it; the job sees an event
  of that rule on that day and leaves it.
- **« Cette réunion et les suivantes »** (D20, D22): the current rule gets `validUntil` = the day
  before, a new rule starts on that day with the new values. The future events of the old rule from
  that day on that were not `changedOnce` go to the new rule, each to the new weekday within its own
  week, with its times and field values — so a deleted week stays deleted. What moves is today's
  « Déplacer les N réunions à venir » rule, extended to prepared meetings:
  - **empty meetings** (§5.1a) move by themselves; one whose week already has its meeting on the new
    day is deleted;
  - **prepared meetings** (with a schedule or an author) are offered: « Déplacer aussi les N réunions
    préparées ». Moved, they keep their schedules, and the assignees of their published schedules are
    told (the notice the assignment change already sends). Left, they stay where they are, linked to
    the old rule, and are marked `changedOnce`;
  - **a meeting with attendance counts never moves**, even on the day the rule is split.
- The job creates events only inside each rule's validity.

## 6. Behaviour by surface

| Surface | Change |
|---|---|
| Programme list | Redesigned (§6.1): one row per event, filtered by kind; each schedule shows as a chip with its status. Publish / unpublish act on schedules, within the person's rights (§5.3). An event without schedules — an empty meeting included — stays listed and offers « Ajouter un planning » (today's « Pas encore de programme » row). |
| Calendar (new) | Weekly view of every event (§6.1). |
| Event view | One section per schedule, each with its own « Publier » and its responsible. |
| Creation (series, single day, recurring job) | By hand: creates the events with the kind's suggested schedules pre-selected (D12). The recurring job extends **rules** (D16) — today's two-month horizon and high-water mark, per rule instead of per template — creating empty meetings with the rule's field values. An existing event without schedules is filled, not duplicated; a day passed in a series deletes its empty meeting and raises the mark. |
| Deleting | Deleting a schedule never deletes the event (D6). Deleting the event deletes its schedules and its counts; bulk « delete the programmes » on events with counts removes their schedules only, as today. Deleting a kind deletes its empty meetings; any other event keeps blocking it. |
| Settings (Réglages › Programmes) | Two lists: **event kinds** (name, colour, duration, default times, attendance — offered on one-day kinds only, D23 —, custom fields, repetition rules, suggested schedule templates) and **schedule templates** (name, kind, responsible role, parts or duties). The « Afficher l’assistance sur le programme » switch stays. |
| Event form | The kind's custom fields; « Répéter chaque semaine » creates a rule from the event. On an event that comes from a rule, saving asks « Cette réunion seulement » (D21) or « Cette réunion et les suivantes » (D20, §5.6). |
| Dashboard | « Prochaine réunion », open parts, upcoming assignments and responsible conflicts read published schedules and schedule-template responsibles. The attendance card reads events of counted kinds under way, whatever their schedules (§5.3). |
| Attendance | Page, side panel, S-88 and spreadsheet exports read `attendanceKind` from the event kind instead of the template; nothing else changes. « Pas de réunion » weeks are computed from the events of a kind's rules, as from a template's run today. |
| Board | Programme document as §5.3; event links resolve through published schedules. The « Assistance la semaine passée » line reads last week's events of counted kinds, published or not. |
| Notifications | Assignment notices fire on publishing a schedule, for its assignees. |
| Calendar feed | Assignments from published schedules. |
| Absences | « Mes absences », absence list, conflicts read `Absence`. |
| Data transfer | New files (`schedules`, `template-schedules`, `absences`); parts and duties reference a schedule; import of older archives maps one programme schedule + one « Services » duty schedule per event and template, and day-off events to absences. Archive version bump. |
| Demo seed | Generates schedules and absences in the new shape. |

### 6.1 Calendar and list

- **Calendar (new):** a week grid (Monday to Sunday, hours down the side), every event placed by its
  time and coloured by kind; multi-day events as a band across the top; filters by kind; a published /
  draft marker per event; clicking opens the event. Shows the eight field service meetings, the
  cleaning week and the meetings together, which the list cannot.
- **List (redesigned):** stays the place to prepare and publish. It is no longer only meetings: kind
  filter, schedule chips, events without schedules, multi-day events. To be drawn before it is built.

## 7. Migration (expand / contract, several releases)

The migration is applied before the running image is replaced, so every step must leave the
previous image working on the new schema.

1. **Absences.** Create `Absence`; backfill from day-off events; the new image writes both, reads
   `Absence`. Next release: stop writing day-off events, delete them and the `day-off` template.
2. **Schedules — expand.** Create `ScheduleTemplate`, `EventKindScheduleTemplate` and `Schedule`;
   `EventTemplate` becomes the event kind (renamed at the contract step); add a nullable `scheduleId`
   to parts and duties and a nullable `scheduleTemplateId` to their template counterparts. Backfill:
   - per existing template: a `programme` schedule template « Programme — <name> » holding its parts,
     responsible = the `programme` scope role; a `duty` schedule template « Services — <name> » holding
     its service parts, responsible = the `service` scope role (falling back to the `programme` role,
     which covers services today); both linked as the kind's suggestions. Identical « Services »
     templates are **not** merged automatically — the congregation can merge them afterwards;
   - per event: a programme schedule if it has parts, a « Services » schedule if it has service parts,
     each with `status` copied from the event;
   - per recurring template (in its own expand step, plan PR 7): one repetition rule (its weekday and times, `validFrom` = its first event's
     day, open-ended), carrying over its `generatedUntil`; existing events link to it by weekday — the
     empty meetings created ahead included — none marked `changedOnce`;
   - `attendanceKind` stays where it is (the template becomes the kind); the D23 CHECK is added with
     the duration, which every existing kind starts at 1;
   - duties keep their person assignee (`assigneeId`); group and text assignees start empty.
   The new image writes both shapes (event status kept in sync: released when any schedule is
   published).

   **Recurring events during the rollout.** The previous image's job locks the template row and reads
   the template's `generatedUntil`; nothing in the database stops two writers from creating the same
   day. Until the contract step, the new image therefore keeps both: it locks the **kind's row** (today's
   template row, which covers all its rules) before creating any event of the kind — job, series or
   move — and raises the template's `generatedUntil` along with each rule's mark, so an old worker
   still running never refills a day the new one passed. `recurring-events-race.integration.test.ts`
   is extended to run the old and the new path together.
3. **Schedules — switch reads.** Every reader moves to schedules and per-schedule status; per-schedule
   publishing becomes available in the UI.
4. **Contract**, in two PRs (plan PR 9 for schedules, PR 10 for the kind rename and the rules). Drop `Event.status`, the parts' and duties' direct `eventId`, `TemplateResponsible`,
   the old template relations and the kind-level `generatedUntil`, rename the event kind table, once
   the image from step 3 is the one running. The kind's row stays the lock for its rules. (A table
   named `EventKind` existed until July 2026 and was dropped; nothing of it remains.)

Any other service that reads these tables through its own copy of the schema must have that copy
refreshed and deployed before each contract step — including readers of `Event.createdById`, whose
« null = created by the job » meaning must survive the absences contract, and of `Attendance`.

## 8. Phasing

| PR | Content |
|---|---|
| 0 | Fixes found on the way (archive statuses and board configuration, pending notices, account deletion…) |
| 1 | Absences: table, backfill, dual write, readers switched |
| 2 | Absences contract: day-off events and template removed |
| 3 | Schedules expand: tables, backfill, dual write; archive format |
| 4 | Schedules read switch (no visible change) |
| 5 | Per-schedule publishing, event view, rights (D28) |
| 6 | Réglages: event kinds and schedule templates; board configuration (D29) |
| 7 | Rules, custom fields, multi-day kinds, group and text assignees; demo (D26) |
| 8 | Redesigned list and weekly calendar |
| 9 | Schedules contract |
| 10 | Kind rename and rule contract |

Design rounds on the canvas come before PR 5 and before PR 7. File by file:
[event-schedules-plan.md](./event-schedules-plan.md).

Each PR is followed by a deploy before the next one's migration ships.

## 9. Testing

- **Backfill:** every existing event and template maps to the expected schedules, statuses and
  responsibles; day-off events map one-to-one to absences (integration, on a scratch database).
- **Dual-write windows:** the previous image's queries return the same results on the expanded schema.
- **Publication:** publishing one schedule notifies only its assignees and leaves the others draft;
  board and dashboard show only published schedules.
- **Responsibility:** a schedule template's responsible may fill and publish only schedules made from
  it; bulk publish skips the others and reports them.
- **One programme per event:** a second programme schedule is refused by the database.
- **Recurring events:** the job and a series, and the previous image's job and the new one, never
  create a day twice (extend `recurring-events-race.integration.test.ts`); a day passed in a series
  deletes its empty meeting and is never refilled.
- **Empty meetings:** the definition of §5.1a decides alone what moves, re-anchors or is deleted
  without asking; adding schedules to an empty meeting fills it and makes the person its author.
- **Attendance:** deleting a schedule, or bulk-deleting programmes, never takes counts; attendance
  surfaces list events of counted kinds without a published schedule; a multi-day kind refuses an
  attendance kind (D23).
- **Rules:** validity respected (no event before `validFrom` or after `validUntil`); « et les suivantes »
  splits the rule, moves the empty meetings, offers the prepared ones and never moves one with counts
  (D22); a one-time change survives a later rule
  change; eight rules of one kind each extend their own events; a deleted event never returns; field
  values copy onto new events only; a multi-day rule creates Monday-to-Sunday events.
- **Assignees:** a duty holds exactly one of person, group or text.
- **Archive:** round-trip in the new format (version bump from 2.15); import of a 2.x archive into
  schedules and absences, attendance kept on its events.
- **E2E:** prepare and publish the duties before the programme; the board shows the duties alone, then
  both.

## 10. Open questions

None. Decided last: a schedule is a **« planning »** in the French UI (« Ajouter un planning »,
« Planning Services »); the spiritual one keeps « Programme ». English: « schedule ».
