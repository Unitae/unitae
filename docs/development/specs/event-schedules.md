# Spec: Event schedules — programmes and duty schedules, each published on its own

**Status:** Draft — direction agreed with the author; design level. The implementation plan (file by
file) is written once [meeting attendance](./meeting-attendance.md) has landed, since both touch
programme creation and deletion.
**Author:** Nathanaël Cherrier
**Feature area:** `features/events` (events, templates, programmes, absences) + `features/dashboard` +
`features/display-board` + `features/settings` (templates, data transfer)
**Related:** [Meeting attendance](./meeting-attendance.md), [Permissions & Roles](../permissions-and-roles.md),
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
- Attendance — it stays on `Event` and is unaffected ([meeting attendance](./meeting-attendance.md)).

## 3. Decisions already taken

| # | Decision |
|---|---|
| D1 | Personal absences move out of `Event` into their own table. |
| D2 | An event can have as many schedules as wanted; congregations create custom ones. |
| D3 | The congregation-wide programme permissions (« Gérer », « Attribuer », « Publier les programmes ») keep covering **every** schedule. Rights specific to one kind of schedule go through the schedule's template (its responsible role), as today. |
| D4 | The board's programme document keeps showing the duties under the meeting, as it already shows the service parts — now schedule by schedule, published ones only. |
| D5 | ~~Weekly schedules stay out of scope.~~ Superseded by D14: a week is a multi-day event. |
| D6 | Deleting a programme never deletes the event or its attendance (already applied early by the attendance spec, §6.4 there). |
| D7 | **Templates describe schedules, not events.** One template per schedule (« Programme de la réunion de semaine », « Services », « Nettoyage »…), each with **one responsible role**. There is no whole-event responsible any more. |
| D8 | Publishing respects the template's rights: a responsible may publish the schedules of their template only; bulk publish acts only on the selected schedules the person may publish and says how many it skipped. |
| D9 | **At most one programme schedule per event**; duty schedules are unlimited. |
| D10 | Absences stay owned by a **user account**, as today. |
| D11 | Event kinds and shared schedule templates (§5): confirmed. |
| D12 | Creating events by hand (single day or series): the schedules suggested by the kind are **pre-selected** in the creation form and can be unticked — today's « create a programme » keeps creating it in one step. Recurring events stay bare. To revisit with usage. |
| D13 | A duty is assigned to a **person, a publisher group or free text** (another congregation, an outside body). |
| D14 | **Multi-day events**: an event kind can last several days (« Semaine de nettoyage », Monday to Sunday). Weekly schedules are duty schedules on such events. |
| D15 | **Custom fields** defined on the event kind (« Lieu », « Salle », « Format »…), values on each event; no dedicated place model. A field decides once whether it shows on documents — **including on print**: people without an account rely on the printed sheet (e.g. the videoconference access details). |
| D16 | **Several events of the same kind every week** (eight field service meetings): repetition lives in **rules**, not on the kind. « Répéter chaque semaine » on an event creates one. |
| D17 | Printed layouts (events list by kind, tables, weekly timetable) are **board documents** built on events, specified separately. |
| D18 | A **weekly calendar view** of events joins the list, which is redesigned. |
| D19 | Word: « planning » (FR) / « schedule » (EN) for a schedule; « Programme » / « Program » for the spiritual one. |
| D20 | **Rules have validity dates.** « Modifier à partir du … » ends the current rule the day before and starts a new one; the « Semaine type » sheet shows changes to come (« à partir du 1er déc. »). |
| D21 | **One-time change**: an event created by a rule can be changed on its own (time, place, any field) or deleted, without touching the rule; a later rule change never overwrites it. |

## 4. Current implementation (verified)

- `Event` has `status`, `eventParts`, `eventServiceParts`, `templateId`, `createdById`. Both item
  tables hang off `eventId` with `onDelete: Cascade`.
- `EventTemplate` has `parts` (`TemplatePart`), `serviceParts` (`TemplateServicePart`) and
  `responsibles` (`TemplateResponsible`, one row per `scope`: `programme` | `service`). The scopes are
  not peers: `programme` covers the whole event including service parts, `service` covers only the
  service parts (`events/model/responsibility-scope.type.ts`, `scopesCovering`).
- **Publication** is `releaseEvent` / `unreleaseEvent` (`events/server/event-status.server.ts`), which
  compute notification targets from both part lists at once. About 26 files read `Event.status`
  (dashboard queries, board documents and links, programme list, conflicts, share messages, cadence).
- **Items:** `eventParts` / `eventPart.*` appear in ~25–29 files, `eventServiceParts` /
  `eventServicePart.*` in ~18–22.
- **Absences:** day-off events, owned through `Event.createdBy` (an account, resolved to a member
  through `createdBy.memberId`); ~17 files reference the `day-off` template key.
- **Board:** `ProgrammeView` renders an event's parts, then its services in two foldable columns.
- **Archive:** version 2.14; events, templates, parts and service parts are separate files.

## 5. Target model

Today's `EventTemplate` mixes two things that D7 separates:

- **what an event is** — name, weekday, start and end times, colour, attendance kind, recurrence:
  an **event kind** (the « event kind name » the attendance spec already shows on a bare event);
- **what a schedule contains** — parts or duties and who fills them: a **schedule template**.

```prisma
model EventKind {                   // today's EventTemplate, minus its content and its single weekday
  id, key, name, colour, attendanceKind
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
  generatedUntil String?            // the attendance spec's high-water mark, now per rule
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
  attendance  Attendance?           // from the attendance spec, unchanged
  // no status: an event is visible where it has at least one published schedule
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
  id, accountId (owner, D10), startDate, endDate, note?, congregationId
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
- Recurring events are still created bare (attendance spec); their schedules are added when someone
  prepares them, from the kind's suggestions.

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

- `Absence` keeps today's semantics: owned by an account (D10), resolved to a member through the account
  for conflicts. Conflict checks, candidate facts, engagement and personal assignments read `Absence`
  instead of filtering day-off events.
- The `day-off` system template disappears once nothing writes day-off events.

### 5.6 Changing a repetition

Like a calendar application, an event that comes from a rule offers two ways to change it:

- **« Cette réunion seulement »** (D21): the change applies to this event, which is marked
  `changedOnce`. Deleting one occurrence is the same: it is gone and never recreated (high-water mark).
  A date beyond the 2-month horizon can be created early by hand to change it; the job sees an event
  of that rule on that day and leaves it.
- **« Cette réunion et les suivantes »** (D20): the current rule gets `validUntil` = the day before,
  a new rule starts on that day with the new values. Every future event of the old rule from that day
  on that was not `changedOnce` moves to the new rule's weekday within its own week and takes its
  times and field values; its schedules stay attached. Events with published schedules are moved
  too, and their assignees are told (the notice the assignment change already sends).
- The job creates events only inside each rule's validity.

## 6. Behaviour by surface

| Surface | Change |
|---|---|
| Programme list | Redesigned (§6.1): one row per event, filtered by kind; each schedule shows as a chip with its status. Publish / unpublish act on schedules, within the person's rights (§5.3). An event without schedules offers « Ajouter un planning ». |
| Calendar (new) | Weekly view of every event (§6.1). |
| Event view | One section per schedule, each with its own « Publier » and its responsible. |
| Creation (series, single day, recurring job) | By hand: creates the events with the kind's suggested schedules pre-selected (D12). The recurring job extends **rules** (D16) — same horizon and high-water-mark rules as the attendance spec §5.3, per rule instead of per template — creating bare events with the rule's field values. A bare event is reused, not duplicated. |
| Deleting | Deleting a schedule never deletes the event (D6). Deleting the event deletes its schedules (and, guarded by the attendance rules, its counts). |
| Settings (Réglages › Programmes) | Two lists: **event kinds** (name, colour, duration, default times, attendance, custom fields, repetition rules, suggested schedule templates) and **schedule templates** (name, kind, responsible role, parts or duties). |
| Event form | The kind's custom fields; « Répéter chaque semaine » creates a rule from the event. On an event that comes from a rule, saving asks « Cette réunion seulement » (D21) or « Cette réunion et les suivantes » (D20, §5.6). |
| Dashboard | « Prochaine réunion », open parts, upcoming assignments and responsible conflicts read published schedules and schedule-template responsibles. |
| Board | Programme document as §5.2; event links resolve through published schedules. |
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
   - per recurring template: one repetition rule (its weekday and times, `validFrom` = its first event's
     day, open-ended), carrying over its `generatedUntil`; existing events link to it by weekday, none
     marked `changedOnce`;
   - duties keep their person assignee (`assigneeId`); group and text assignees start empty.
   The new image writes both shapes (event status kept in sync: released when any schedule is
   published).
3. **Schedules — switch reads.** Every reader moves to schedules and per-schedule status; per-schedule
   publishing becomes available in the UI.
4. **Contract.** Drop `Event.status`, the parts' and duties' direct `eventId`, `TemplateResponsible`
   and the old template relations, rename the event kind table, once the image from step 3 is the one
   running.

Any other service that reads these tables through its own copy of the schema must have that copy
refreshed and deployed before each contract step.

## 8. Phasing

| PR | Content |
|---|---|
| 1 | Absences: table, backfill, dual write, readers switched |
| 2 | Absences contract: day-off events and template removed |
| 3 | Schedules expand: tables, backfill, dual write; archive format |
| 4 | Schedules read switch + UI: programme list, event view, per-schedule publishing, event kinds and schedule templates in settings |
| 4b | Custom fields, repetition rules (« Répéter chaque semaine », validity dates, « cette réunion seulement » / « et les suivantes »), multi-day kinds, group and text assignees |
| 4c | Weekly calendar view; redesigned list |
| 5 | Schedules contract |

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
- **Rules:** validity respected (no event before `validFrom` or after `validUntil`); « et les suivantes »
  splits the rule and moves only the events not changed once; a one-time change survives a later rule
  change; eight rules of one kind each extend their own events; a deleted event never returns; field
  values copy onto new events only; a multi-day rule creates Monday-to-Sunday events.
- **Assignees:** a duty holds exactly one of person, group or text.
- **Archive:** round-trip in the new format; import of a 2.x archive into schedules and absences.
- **E2E:** prepare and publish the duties before the programme; the board shows the duties alone, then
  both.

## 10. Open questions

None. Decided last: a schedule is a **« planning »** in the French UI (« Ajouter un planning »,
« Planning Services »); the spiritual one keeps « Programme ». English: « schedule ».
