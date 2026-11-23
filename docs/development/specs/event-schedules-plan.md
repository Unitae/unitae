# Implementation plan: event schedules and event documents

**Status:** Draft — implementation plan for [event schedules](./event-schedules.md) and
[event documents](./event-documents.md). Decisions D1–D35 are in the spec; the plan adds no product
decision of its own, only the technical choices listed in §1.
**Author:** Nathanaël Cherrier
**Related:** [Meeting Attendance](../meeting-attendance.md), [Data Transfer](../data-transfer.md),
[Architecture Conventions](../architecture-conventions.md), [Permissions & Roles](../permissions-and-roles.md)

> Paths are relative to `app/` unless they start with `docs/` or `scripts/`. Line counts are from
> November 2026 and only matter where a file-size budget forces a split.

## 1. Technical choices taken in the plan

| # | Choice | Why |
|---|---|---|
| T1 | ~~**The service-part tables keep their names.**~~ Superseded by T12 (2026-11-21): items are unified, so the four item tables go in PR 9 and pending notices are rewritten when they do. | Kept the item ids and names frozen in notices, debounce keys, audit rows and the archive's entity map; T12 pays that rewrite once. |
| T2 | **`EventTemplate` becomes the event kind in place**, and its table is never renamed: the Prisma model becomes `EventKind` with `@@map("EventTemplate")` in PR 6, and audit rows keep the entity type `EventTemplate`. | A table rename breaks the image still running at the migration; a mapped model costs nothing but a cosmetic SQL name. |
| T3 | **Allowed roles hang off items, not schedules**, in one table per side keyed by slot (`main`, `second`: today's speaker and reader, a duty's single list as `main`). `PartPreset.scope` (`part` / `service`) stays; `service` means « duty » from PR 5 on, in labels only. | They describe one item; moving items into schedules does not change them. |
| T4 | **The freeform template becomes the kind « Autre évènement »**: no suggested schedules, no rules, managers only, as today. The stale « freeform = templateId null » comments go in PR 0. | It is already a template row; nothing to migrate. |
| T5 | **`applyTemplateToEvent` splits in two** (PR 5): « Ajouter un planning » (from a schedule template, appended as a new schedule) and « Changer le type » (the event's kind, an event edit). | Today one action re-points `templateId` — which changes who is responsible — and appends parts and services. |
| T6 | **Rules get their own expand step** (PR 7), after schedules are switched, instead of being backfilled with schedules. The kind-level weekday, hours and `generatedUntil` are written until PR 8 and dropped in PR 10; the lock stays on the kind's row. | Keeps PR 3 to one concern; the recurring job changes in one PR. |
| T7 | **Every expand PR's successor re-runs its backfill** for rows the previous image wrote during the rollout (absences in PR 2, the whole schedules backfill in PR 4), keyed so a re-run attaches to what exists, before anything reads or drops the old shape. | The old image keeps writing the old shape until the new one replaces it. |
| T9 | **A contract is two releases**: one image stops reading and writing the old shape, the next release's migration drops it. `Event.status` stops being written in PR 5, `TemplateResponsible` and the template items' `templateId` in PR 6, the kind-level weekday/hours/mark in PR 8, `Absence.legacyEventId` in PR 2. The items keep their `eventId`, held equal to their schedule's by a composite foreign key. | The migration runs while the previous image still serves. |
| T10 | **`Event.origin`** (`job` / `manual` / `import`) replaces « null author » as the sign of a job-made meeting (PR 0). | Clearing an author (account deletion) must never turn a hand-made event into one a template move may delete. |
| T11 | **One event per occurrence, by constraint**: `Event.occurrenceDay` and a unique index on (`recurrenceRuleId`, `occurrenceDay`) (PR 7). The job inserts with `ON CONFLICT DO NOTHING`; dedupe and moves key on the rule, never on the kind and the day. | Eight rules of one kind share weekdays; a day-keyed check would skip one rule's events and let a split delete another rule's meeting. |
| T8 | **One archive bump per PR that changes the format**, numbered in merge order from 2.16. Each previous version joins `SUPPORTED_ARCHIVE_VERSIONS` and has an import mapping, tested by importing an archive of that version kept as a fixture. | Same rule as every bump so far. |
| T12 | **Parts and duties become one item** (spec D36): `TemplateItem`, `TemplateItemAllowedRole`, `Item`, `ItemAllowedRole` replace the eight item tables. Expanded right before the read switch (PR 3c) so PR 4 moves every item reader once, to items in schedules; PR 9 drops the old tables. | 61 of the 84 files reading items read both tables with the same logic twice; the read switch rewrites them anyway, so unifying then costs two PRs instead of a second rewrite. |

## 2. Ground rules for every PR

- **Deploy between PRs.** Each PR is deployed, and its image is the one running, before the next
  one's migration merges. The migration runs before the image is replaced, so the previous image must
  work on the new schema — every PR below says what the previous image does.
- **TDD** for every new service function and every regression (failing test first, watched failing).
  Migrations follow the data-migration conventions: a colocated
  `app/database/migrations/<slug>.integration.test.ts` that runs the shipped SQL in a rolled-back
  transaction, asserts before/after, idempotence, an unknown input and a collision.
- **Gates:** `test:unit`, `test:lint`, `test:typecheck`, `test:integration`, `test:e2e`, plus
  `test:boundaries`, `test:aggregate-boundaries`, `test:tenant-scoping`, `test:server-barrel-exports`,
  `test:service-test-coverage`, `test:file-sizes`, `test:permission-coverage`, `test:action-permissions`.
- **Size budgets first.** A file at its budget is split in a `refactor` commit before the feature
  commit touches it (listed per PR).
- **Locks.** Any path that creates events of a kind — the job, a series, a single day, a move, a rule
  change — locks the kind's row (`lockTemplates`, id order) until PR 10 and after it.
- **Docs.** Each PR updates the page it changes (`meeting-attendance.md`, `data-transfer.md`,
  `permissions-and-roles.md`, `row-level-security.md`, the app's `CLAUDE.md`); the last PR folds the
  spec's steady state into `docs/` and archives the specs.
- **Another service with its own copy of the schema** must have it refreshed and deployed before
  each contract step (PR 2, PR 9, PR 10) and before any column it reads changes meaning.
- **Rollback.** Until a contract's drop, the previous release can be redeployed; an archive export of
  every congregation is taken before PR 2, PR 9 and PR 10.
- **Tenant tables.** Every new table carries `congregationId`, the standard RLS policy, and joins
  `TENANT_MODELS` in `scripts/check-tenant-scoping.ts`.

## 2a. Testing: nothing that works today may stop working

The refactor rewrites how every programme, duty, assignment and board document is stored and read.
Existing documents and assignments must keep working through every PR, so the tests are written
first and the refactor is held to them.

**Invariants** — true before PR 0a, after every PR, and checked by tests:

1. A published programme reads the same on the board, on screen and in the PDF: same events, parts,
   duties, assignees, order, headings.
2. Every assignment keeps its assignee, its assistant, its allowed roles and its conflict flag;
   assigning, unassigning, publishing and unpublishing send the same notices to the same people, and
   the links in notices already waiting still open the right page.
3. Every board document keeps showing the same events with its stored configuration.
4. Personal views read the same: dashboard (next meeting, open parts, my assignments, responsible
   conflicts), calendar feed, publisher record, candidate facts and cadence, share messages.
5. Absences block and flag exactly as before.
6. An archive of any supported version imports to the same data.
7. Attendance figures and exports are unchanged.

**The reference suite (PR 0a).** A deterministic fixture congregation (`app/tests/fixtures/
events-reference.ts`: fixed seed, fixed clock, built through today's service functions) covering
two meeting kinds and the Mémorial, programmes published and draft, services, parts with assistants
and external speakers, allowed roles, absences with conflicts, template responsibles of both scopes,
empty meetings, counted meetings, and a board programme document per configuration (by date, by
template, parts only, services only). Integration tests (`*.reference.integration.test.ts`) run the
real readers on it and compare to committed reference files:

- board: the builder's data for every document and the PDF read back with `tests/helpers/pdf-text.ts`
  (the programme render gate already does this for layout; this pins content);
- assignments: assign / unassign part and service, publish / unpublish single and bulk, the notices
  queued (recipients, type, link), the conflict refusals and flags;
- personal views: the dashboard readers, the ICS text of the feed, the record's engagements, candidate
  facts, cadence, share message, external speakers' next visit;
- archive: export of the fixture, then import into a fresh congregation, compared row by row.

Reference files change only in a PR that changes behaviour on purpose, and only on the lines it
names in its description. A refactor PR (1a–4e, 9, 10) leaves them untouched.

**E2E before the refactor (PR 0a).** Today nothing covers absences, service assignment and
publishing, or the board programme's content. New specs: `absences.spec.ts` (declare, list, delete,
the conflict mark), `assignments.spec.ts` (assign a part and a service, the absence warning, publish,
the board shows them, unpublish), `board-programme.spec.ts` (the programme document's text for a
published week). Each later PR keeps them green and extends them for what it adds.

**Data written in the old shape.** Every expand PR's migration test builds its fixture in the old
shape (as the previous image writes it), runs the shipped SQL, then runs the reference readers on the
result: the references must not change. The read-switch PRs run them on data written by the previous
image's code paths and backfilled by the catch-up.

**Upgrade rehearsal.** Before each migration PR merges, a script (`scripts/events-snapshot.ts`)
dumps the invariants' outputs for every congregation of a scratch copy of the demo database, the
migration and the new image run, and the dump is compared. Run on a production backup only if the
operator decides to.

**Per PR, always:** failing test first for every new service function and every regression (TDD);
an integration test for every query and aggregate it touches; a migration test (before/after,
idempotence, a re-run after old-shape writes, an unknown input, a collision); an RLS test for each new
table (another congregation's rows invisible); E2E for each flow it adds or changes; the reference
suite green and unchanged; the whole gate list of §2. Coverage does not go down.

## 3. Phasing at a glance

Small PRs, one concern each, each deployed before the next migration merges. A PR touches at most
about thirty non-test files; the read switch goes feature by feature.

| PR | Content | Format | UI |
|---|---|---|---|
| 0a | **Safety net**: the reference suite and the missing E2E (§2a), against today's code | — | none |
| 0b | Archive carries statuses and the board configuration | bump | none |
| 0c | Pending notices on delete, whom to warn, apply-template, stale comments | — | none |
| 0d | `Event.origin`; account deletion | bump | small |
| 1a | Absences: table, backfill, dual write | — | none |
| 1b | Absences: conflict readers switched | — | none |
| 1c | Absences: lists, dashboard, feed, record switched; ownership follows the record | — | none |
| 1d | Absences: archive | bump | none |
| 2 | Absences — contract | — | none |
| 3a | Schedules: tables, backfill, dual write | — | none |
| 3b | Schedules: archive | bump | none |
| 3c | Items: one table per side, backfill, dual write (T12) | — | none |
| — | Design round A (event view, publishing, settings) | — | canvas |
| 4a | Read switch: catch-up migration; programme list, event view, share message, external speakers | — | none visible |
| 4b | Read switch: assignments, conflicts, candidates, cadence, engagement | — | none visible |
| 4c | Read switch: dashboard | — | none visible |
| 4d | Read switch: board documents and links | — | none visible |
| 4e | Read switch: the last readers (part types' usage); notifications, feed and export accounted for | — | none visible |
| 5-0 | Status read switch: visible = a published schedule, or no schedule and released (D46); `Event.status` still written | — | none |
| 5i | Writers move to items: id flip, notices rewritten, archive (bump) | bump | none |
| 5a | Rights per schedule (server) | — | none |
| 5b | Per-schedule publishing (server, routes, bulk) | — | small |
| 5c | Event view, editor and creation form by schedule | — | yes |
| 6a | Réglages: schedule templates | — | yes |
| 6b | Réglages: event kinds | — | yes |
| 6c | Board configuration per kind | bump | yes |
| — | Design round B (rules, fields, audiences, list, calendar) | — | canvas |
| 7a | Rules, the job by occurrence, « et les suivantes », « Arrêter la répétition » | bump | yes |
| 7b | Custom fields | bump | yes |
| 7c | Multi-day kinds | — | yes |
| 7d | Group and text assignees, conductors inline | bump | yes |
| 7e | Demo seed with the new kinds | — | none |
| 7f | Event audiences (D35) | bump | yes |
| 8a | Redesigned list | — | yes |
| 8b | Weekly calendar | — | yes |
| 9 | Schedules — contract | — | none |
| 10 | Rule contract | — | none |
| Doc 1–3 | Event documents: Liste d’évènements, Tableau, Semaine type | — | yes |

The sections below describe each stage; a stage split above ships its parts in that order, each with
its own tests.

## 4. PR 0 — Fixes found on the way

Bugs in today's code that would otherwise flow into the backfills, and the origin column (T10).

| Area | Change |
|---|---|
| Archive | `events.ndjson` carries `status` (export `export-congregation.server.ts`, import `import-events.server.ts`; pre-2.16 events import as today: `draft`, day-offs `released`). `board-dynamic-document-settings` carries `dynamicConfig` (export, `import-board.server.ts`), template ids remapped through the id map. Bump. |
| Notices | `deleteEvent` / `bulkDeleteEvents` (`delete-events.server.ts`) and `deletePartAssignment` / `deleteServicePartAssignment` (`event-parts.server.ts`) cancel the pending `assigned` notices of the items they delete, as `unreleaseEvent` and `removeProgrammes` do. `event-parts.server.ts` is exempt at 364 lines: the cancel goes through a helper in `notify-assignment.server.ts`. |
| Whom to warn | `list-user-conflicts-in-range.server.ts` resolves a responsible role's people through the same rule as `resolveEffectiveRoleIds` (accounts holding it by hand or through a member seat), not `role.members.user` only. |
| Apply template | `listApplicableTemplates` (`events-auth.server.ts`) never offers a system template: applying « day-off » turned a meeting into an absence. |
| Account deletion | `deleteAccount` (`settings/server/delete-account.server.ts`) no longer ends in a foreign-key error: the account's day-off events whose owner has no record are deleted with it, its other events lose their author (`createdById` → null). Day-offs of an account linked to a record are handed to the record in PR 1; until then deletion is refused for them with « Ce compte a des absences » (`AccountRefusal`). Its origin stays `manual`, so a hand-made event never becomes an empty meeting a template move may delete. |
| Origin (T10) | Migration `add_event_origin`: `Event.origin` (`job` / `manual` / `import`, CHECK, default `manual`), backfilled `job` where `createdById` is null and the event has no part, service or count, `manual` otherwise. `createEmptyMeetings` writes `job`, imports `import`; `EMPTY_MEETING` (`empty-meetings.queries.ts`) and `reanchorEmptyMeetings` test `origin = 'job'` instead of a null author. The previous image creates events with the default `manual` — its empty meetings during the rollout are fixed by a second run of the backfill in PR 1. Archive: `events.ndjson` carries it. |
| Absences on the board | Found by the reference suite: the programme document's form ticks every template by default, the « day-off » template included, so the board's programme lists each absence as a dated « Absence » entry. The form (`ProgrammeConfigFields.tsx`, `dynamic-form.queries.ts`) and the builders (`dynamic-documents.server.ts`) leave system templates out; stored configurations that include it are read without it. |
| Board documents on import | Found by the reference suite: `importBoardDynamicDocumentSettings` matches an existing document on (type, ref), and every programme document has a null ref, so an archive with several keeps only the last one. Each archived document is created, matched only through the id map. |
| Order of services | Found by the reference suite: services are read without an `ORDER BY` in the board builders, the release notices and the calendar feed, so the printed sheet lists them in whatever order the database returns. Ordered by their position in the template (the template service part's id, the order they were created in) wherever they are read. |
| Import into a seeded congregation | To check first: importing part presets into a congregation that already has the seeded ones fails on `PartPreset_key_congregationId_key` in the reference suite. If a real import can meet it (a congregation registered, then restored from an archive), presets are matched on their key. |
| Size | `import-congregation.server.ts` (349/350) splits its event steps into `import-programmes.server.ts`; stale entries in `scripts/check-file-sizes.ts` `EXEMPT_FILES` removed. |
| Comments | « freeform = templateId null » in `events-auth.server.ts`, `cadence.type.ts`, `list-user-cadence.server.ts` (T4). |
| E2E | New `absences.spec.ts`: declare, list and delete an absence in « Mes absences »; the congregation list; the conflict mark on an assigned part. The regression net PR 1 needs. |

Tests: each fix gets its failing regression test first (unit for notices and whom-to-warn, integration
for account deletion and the archive round-trip with statuses and board configuration).

## 5. PR 1 — Absences, expand

An absence belongs to the person (D10, superseded by D27): the record when there is one, the account
otherwise.

**Schema and migration** `add_absences`:

```prisma
model Absence {
  id             Int       @id @default(autoincrement())
  startDate      DateTime  // copied as stored: legacy rows sit at midnight UTC (model/absence.ts)
  endDate        DateTime
  note           String    @default("")
  member         Member?      @relation(fields: [memberId], references: [id], onDelete: Cascade)
  memberId       Int?      // the person, when the account has a record
  account        UserAccount? @relation(fields: [accountId], references: [id], onDelete: Restrict)
  accountId      Int?      // who entered it; the owner when there is no record
  legacyEventId  Int?      @unique // the day-off event it was copied from, until PR 2
  congregationId Int       // + relation, RLS, TENANT_MODELS
  // CHECK (memberId IS NOT NULL OR accountId IS NOT NULL)
  // @@index([congregationId, startDate]), @@index([memberId]), @@index([accountId])
}
```

1. Create the table, the CHECK and the standard RLS policy.
2. Backfill one row per day-off event: dates copied as they are, `accountId` = `createdById`,
   `memberId` = that account's `memberId`, `legacyEventId` = the event, `note` = its description.
   `ON CONFLICT ("legacyEventId") DO NOTHING`.

**Dual write.** The new image writes both: `createDayOff` / `deleteDayOff` (`days-off.server.ts`)
create and delete the event and its `Absence` in one transaction. Every reader switches to `Absence`:

- conflicts: `refresh-conflict-flags.server.ts`, `checkDayOffConflict` in
  `event-part-assignments.server.ts`, `slot-candidate-facts.server.ts`,
  `list-user-conflicts-in-range.server.ts`;
- lists: `days-off.queries.ts`, `getNextDaysOffs`, `member-engagement.queries.ts`
  (`findNextAbsencesForMembers`, `findUpcomingAbsencesForMember`), `personal-assignments.server.ts`
  (feed), dashboard `dashboard.server.ts`, `get-open-parts.server.ts`,
  `get-upcoming-assignments.server.ts`;
- the person: by `memberId` when set, else the account's (« Mes absences » shows the viewer's member's
  absences, or the account's when it has no record).

**Ownership follows the record.** Linking an account to a record gives its record-less absences that
`memberId`; unlinking leaves them with the record (`unlink-account-from-member.server.ts`). Deleting an
account deletes its absences that have no record and clears `accountId` on the others, explicitly, in
`deleteAccount` (PR 0's refusal is lifted). `Restrict` makes any other path fail clearly instead of
breaking the CHECK. The account's legacy day-off **events** (`Restrict` until PR 2) are deleted with
it — their `Absence` rows stay with the record, `legacyEventId` being a plain column — and
`deleteDayOff` tolerates a missing event.

**Previous image on this schema:** reads and writes day-off events only. Absences it creates during
the rollout have no `Absence` row, and ones it deletes leave theirs behind — PR 2's migration copies
the first and deletes the second (T7). The migration also re-runs PR 0's origin backfill for the empty
meetings PR 0's predecessor created during that rollout.

**Archive (bump):** `absences.ndjson` (dates, note, `memberId`, `accountId` remapped); day-off events no
longer exported. Import of older archives maps day-off events to absences through the same rule as the
migration (owner's record when it has one). `import-absences.server.ts`.

**Other files:** `model/absence.ts` (window helpers keep their dates), `schemas/day-off.schema.ts`,
`app/shared/domain/export-account-data.server.ts` (exports the person's absences),
`settings/model/audit-entities.ts` (`Absence`), demo `seed-marketing.ts` and `demo/meetings.ts`
(`generateAbsences` writes `Absence`), `docs/development/row-level-security.md`.

**Tests:** migration test (every day-off copied once, dates untouched, idempotent, an event whose owner
has no record, a second run after new day-offs); service tests for the dual write, the readers and the
link/unlink/delete rules; `absences.spec.ts` stays green.

## 6. PR 2 — Absences, contract

1. Migration `reconcile_absences` then `drop_day_off_events`: copy any day-off event without an
   `Absence`, delete any `Absence` whose `legacyEventId` names an event that no longer exists (T7);
   delete every day-off event — none can hold parts, since programme paths never open an absence
   (`PROGRAMME_EVENT`), and the migration test asserts it — and the `day-off` templates.
   `Absence.legacyEventId` stays: PR 1's image still writes it; this image stops, PR 3 drops it (T9).
2. Code: `createDayOff` / `deleteDayOff` write `Absence` only; `EventTemplateKey.DayOff` leaves
   `SYSTEM_TEMPLATE_KEYS`; `PROGRAMME_EVENT` / `findProgrammeEvent` (`programme-event.queries.ts`) and
   the ~17 files filtering on the key drop the filter; `seed-templates.server.ts` stops seeding it;
   `isAwaitingProgramme`, `TemplateList.tsx`, `template.tsx`, `template.schema.ts`, the navigation
   config entries.
3. `Event.createdById` now only means « who prepared it » (`origin` says who created it). `onDelete`
   becomes `SetNull` (PR 0 already clears it by hand).

**Previous image:** PR 1's image dual-writes, so a day-off event it creates after the migration
inserts into a template that no longer exists — the migration therefore runs only once PR 1's image is
the one running, and PR 1's image looks the template up by key and skips the event write when it is
missing (shipped in PR 1).

## 7. PR 3 — Schedules, expand

**Shipped** in three PRs: making room (#589: the file splits, and a test that a deputy of a responsible role
is responsible), the tables, backfill and dual write (#590), the archive (2.21, #592). What shipped differs
from the first draft below on the points marked « Shipped: ».

**Schema and migration** `add_schedules`:

- `ScheduleTemplate` (`id`, `name?`, `key?` (null name → the catalogue's label for the key), `kind` `programme` | `duty` (CHECK), `responsibleRoleId?` →
  `Role` SetNull, `congregationId`, RLS) and `EventKindScheduleTemplate` (`eventKindId` = template id,
  `scheduleTemplateId`, `order`, unique pair, `congregationId`, RLS).
- `Schedule` (`id`, `eventId` Cascade, `scheduleTemplateId?` SetNull, `name?`, `key?`, `kind`, `order`,
  `status` `draft` | `published` (CHECK), `congregationId`, RLS); partial unique index
  `("eventId") WHERE kind = 'programme'` (D9).
- Nullable `scheduleId` on `EventPart` and `EventServicePart`, with a composite foreign key
  (`scheduleId`, `eventId`) → `Schedule(id, eventId)` (Cascade), so an item's event is always its
  schedule's; nullable `scheduleTemplateId` on `TemplatePart` and `TemplateServicePart`.
- ~~Drop `Absence.legacyEventId`~~ Shipped: done with PR 2's contract (#587, #588).

Backfill (spec §7 step 2, minus rules — T6):

- per template other than freeform: a programme schedule template if it has parts, responsible = its
  `programme` responsible; « Services — <name> » if it has service parts, responsible = its `service`
  responsible, else its `programme` one (D31: never both); both linked as suggestions, programme first. Template items
  get their `scheduleTemplateId`.
- per event: a programme schedule if it has parts, a « Services » schedule if it has service parts,
  `status` = `published` when the event is `released`; items get their `scheduleId`.
- Re-runnable: an event's existing schedule of the same template (or key) is reused, never doubled;
  where an event's status and its schedules disagree, the event's status wins (T7). Shipped: a re-run also
  brings across a template renamed, a template applied to an event (its schedules move onto that
  template's) and a template deleted (its orphaned schedule templates go). A CHECK keeps a name or a key on
  every schedule and schedule template; a partial unique index holds one programme per event (Prisma's
  `partialIndexes` preview feature).
- No language is stored (the built-in roles' rule): a backfilled programme schedule template takes
  the template's own name, which the congregation wrote; a backfilled duty one gets `name` null and
  `key` `services`, and the UI shows « Services » / « Services » from the catalogue until someone
  renames it. Schedules copy their template's name and key the same way.

**Dual write.** The new image creates a schedule with every item it writes: `giveProgramme`,
`createProgramme`, `fillMeeting`, `applyTemplateToEvent`, `addPartAssignment`,
`addServicePartAssignment`, the template item writers in `event-templates.server.ts`,
`duplicate-template.server.ts`, `seed-templates.server.ts`; `releaseEvent` / `unreleaseEvent` and the
bulk pair also set every schedule's status; responsible changes (`template-responsibles.server.ts`)
also write the schedule templates' `responsibleRoleId`. Reads do not change.

Size: `event-templates.server.ts` (327) splits into `template-items.server.ts` first;
`seed-templates.server.ts` (333) moves its data into `model/seed-templates.data.ts`;
`event-status.server.ts` (307) moves `computeNotifyTargets` into `release-notifications.server.ts`.

**Archive (bump, 2.21):** `schedule-templates.ndjson`, `kind-schedule-templates.ndjson`, `schedules.ndjson`;
items carry `scheduleId` / `scheduleTemplateId`. Import of older archives runs the migration's rule in
TypeScript (`import-schedules.server.ts`, `settleImportedSchedules`, which for a 2.21 archive only gives a
schedule to items that came without one), using the event statuses PR 0 started exporting (2.15 and
older: all draft, as their import already does).

**Demo:** the seed sets responsibles on its templates (it sets none today) and writes schedules.

Shipped: the dual write also covers a programme removed from a meeting that keeps its counts (its
schedules go), a template renamed (its programme schedule template follows) and a template deleted (its
schedule templates go). Two writers making the same schedule or schedule template at once share one: the
event's or the template's row is locked, a template's before an event's, the order series and moves use.
The app's `CLAUDE.md` names the call each writer makes. The demo's templates name responsibles from its
organigram. The upgrade rehearsal is `scripts/events-snapshot.ts` (§2a): run before #590 merged, « The
same. » apart from the new column.

**Previous image:** writes items without schedules and statuses on events only; PR 4 catches up.

**Tests:** migration test (a template with parts only, services only, both, neither; responsibles
with and without a service scope; a released and a draft event; idempotence; the partial unique
index refusing a second programme); dual-write service tests; archive round-trip and an import of the previous version's fixture.

## 7a. PR 3c — Items, expand (T12, spec D36)

**Schema and migration** `add_items`: `TemplateItem` (`scheduleTemplateId` SetNull as on the old items, `templateId` kept
while templates still own their items, `name`, `order`, `presetId?`, the programme columns `section`,
`track`, `trackOrder`, `durationMin`, `speakerLabel`, `readerLabel`, `allowExternalSpeaker`) and
`TemplateItemAllowedRole` (`slot` `main` | `second`, CHECK); `Item` (`scheduleId`, `eventId` with the
composite foreign key to `Schedule(id, eventId)`, `templateItemId?` SetNull, every column of today's
parts, the main slot's `assigneeId`, `assistantId`, `externalSpeakerId`, `topic`, `note`, `hasConflict`)
and `ItemAllowedRole`. Each carries `legacyPartId?` / `legacyServiceId?` (unique), the row it was copied
from: the key a re-run and the notice rewrite use, dropped in PR 9. `congregationId`, RLS and
`TENANT_MODELS` for all four.

**Backfill:** every template part and service, every event part and service, with its allowed roles
(a part's `speaker` → `main`, `reader` → `second`; a service's single list → `main`); items take their
row's schedule or schedule template (PR 3). Re-runnable on the legacy keys.

**Mirrored by triggers, not by the writers:** an `AFTER INSERT OR UPDATE OR DELETE` trigger on each of
the eight old tables upserts or deletes the matching new row on its legacy key. It catches what a helper
per writer would miss: foreign-key cascades and `SET NULL`, the previous image during every rollout, and
another service seeding a congregation's templates. No application code changes; reads do not change.
An `asKind` other than `speaker` / `reader` fails the write rather than land in a wrong slot. Duties may
now carry a preset in the data; the picker comes with PR 6's template editor. PR 9 drops the triggers
with the old tables.

**No archive bump yet** (decided 2026-11-21): until PR 5 the new tables hold nothing the old ones do not,
and the importer's writes to the old tables rebuild them through the triggers. PR 5 carries the items.

**Previous image:** writes the old tables only; PR 4's catch-up copies what it wrote.
**Tests:** migration test (parts and services of both sides, allowed roles per slot, a part with a
reader, idempotence, a re-run after old-shape writes); dual-write tests through every writer; the
reference suite unchanged.

## 8. Design round A

Done 2026-11-21, on the canvas page « Programmes — plusieurs plannings par réunion » (row « Tour A »):
the event view with one section per schedule (status, responsible, « Publier », « Tout publier »),
« Ajouter un planning » and « Changer le type », the bulk publish confirmation, Réglages « Types
d’évènement » and « Modèles de planning », the board programme configuration. Decisions D37–D45 in
the spec. PR 5 starts on the user's go.

## 9. PR 4 — Schedules, read switch

1. Migration `catch_up_schedules`: the whole PR 3 backfill again, idempotently (T7) — templates
   created during the rollout get their schedule templates, responsible changes reach
   `responsibleRoleId`, items without `scheduleId` get their schedule, statuses are realigned (the
   event's status wins). `scheduleId` stays nullable until PR 9 makes it required. It also realigns
   what PR 3's image cannot: deleting a role leaves a duty schedule template without its responsible
   where D31 falls back to the programme one (`deleteRole` lives in `shared/` and cannot call the events
   feature). Before this PR merges, any other service that seeds a congregation's templates must write
   their schedule templates too, or congregations it creates afterwards keep none. The same migration
   runs PR 3c's item backfill again.
   Readers read `Item` in its schedule but hand back the old row's id and kind (`legacyPartId` /
   `legacyServiceId`, part or service), through one projection helper, so writers, routes, form fields,
   links and notices keep their ids; the triggers keep `Item` in step (T12). PR 5 flips the helper to
   `Item.id` and the schedule's kind, with the writers.
2. Every reader of items and status reads items in schedules: the ~40 status readers and ~60 + ~50 item readers
   listed in Appendix A, grouped into commits by feature — events (lists, view, cadence,
   conflicts, candidates, share message, engagement, feed, notifications), dashboard (next meeting,
   open parts, upcoming assignments, responsible conflicts, urgent items), board (`dynamic-documents`,
   `event-link`, `board-reader`, `programme-sheet`), the account data export.
3. « Visible » = has a published schedule; the attendance readers keep reading every event of a
   counted kind (spec §5.3) — `attendance.queries.ts` is untouched and its tests prove it.
4. `Event.status` is still written (released when any schedule is published) for the previous image;
   PR 5 stops (T9).

No visible change: one programme and one services schedule per event publish together until PR 5.
**Tests:** every touched query keeps its tests green unchanged: their fixtures write the old tables, the
triggers fill `Item`, the readers read it. The events snapshot diff is empty before and after.

**As shipped (4a–4e, 2026-11-22):** the event view, programme list, external speakers (4a); a person's assignments
and feed, conflicts, candidates, cadences, engagement (4b); the dashboard (4c); the board's programme documents
(4d); the part types' usage count (4e). Notifications read only their stored payloads, so none moved; the calendar
feed moved with the assignments in 4b. The account export is the control plane's: it reads the old tables through
its own schema copy and must move to items before PR 9 drops them. What still reads the old tables in the app
feeds a write or a permission (`EMPTY_MEETING`, the delete guards, `events-auth`, the archive export) and moves
with the writers in PR 5. The status readers did not move: they still filter on `Event.status` (PR 5-0).

## 10. PR 5 — Per-schedule publishing, event view, rights

**Rights** (D3, D7, D8, D28). One client-safe shape replaces the scopes:

```ts
// model/programme-access.ts
interface ScheduleViewer {
  permissions: ReadonlySet<Permission>
  responsibleScheduleTemplateIds: ReadonlySet<number> // through resolveEffectiveRoleIds
}
```

| Action | Who |
|---|---|
| Create an event of a kind | « Gérer les programmes », or a responsible of a schedule template the kind suggests (their schedule created with the event; the other suggested schedules too, as drafts) |
| Change its date, hours, fields, kind | the same |
| Delete it | « Gérer les programmes », or such a responsible when the event has no schedule but theirs |
| Add a schedule | « Gérer les programmes », or the responsible of that schedule template |
| Fill a schedule (items, assignees) | « Attribuer », « Gérer », or the responsible of its template |
| Publish / unpublish a schedule | « Publier les programmes », or the responsible of its template |
| Bulk publish | per selected schedule, by the rule above; « 12 publiés, 4 ignorés » |
| Open an event with no published schedule | anyone holding one of the rights above for it |

Files: `model/programme-access.ts`, `server/events-auth.server.ts` (`canEditEvent` → `canEditEvent`
+ `canEditSchedule` + `canPublishSchedule`; `filterToManageableEventIds` → per schedule;
`listApplicableTemplates` → schedule templates), `programs/list.tsx`, `programs/days-off.tsx`,
`programs/new.tsx`, every `routes/programs/events/*.tsx`, dashboard `next-meeting-for-viewer`,
`load-dashboard` (open parts), `get-responsible-conflicts`, settings `settings-access.server.ts`.
`responsibility-scope.type.ts` and `scopesCovering` are deleted; `TemplateResponsible` is no longer
read (still written for PR 4's image, which reads it). `Event.status` is still written by PR 5 (released when any
schedule is published): PR 4's image reads it. PR 5-0 moves the status readers to schedules; the write stops one
release later (PR 6), T9.

**5a, in three slices (decided 2026-11-22, D47–D49):** 5a-1 the fill checks per schedule (assign, remove, reorder,
the editor's item intents, slot facts): « Attribuer » / « Gérer », or the responsible of the schedule's template, read
from `ScheduleTemplate.responsibleRoleId` (the sync writes it from `TemplateResponsible`); `canEditEvent` keeps its
signature and reads the event's schedule of the kind asked. 5a-2 the event-level rights (edit, apply a kind, delete,
release and unrelease per D49, the bulk filters, `listApplicableTemplates`). 5a-3 the readers move to `ScheduleViewer`;
`responsibility-scope.type.ts` goes and `TemplateResponsible` is no longer read. Prod on 2026-11-22: no schedule without
a template; 6 templates name both responsibles (our own tenants), the D31 case.
**As shipped (5a, #602, #603, #605):** fill rights per schedule (5a-1); event-level rules `canChangeEventsOfKind`,
`canDeleteEvent` (D50: a schedule is needed), `canPublishEvent`, `filterEventsByRight` in a fixed number of queries
(5a-2); the programmes list, absences and dashboard read `scheduleRightsFor` and each item's own schedule responsible
(5a-3). `canEditEvent`, `filterToManageableEventIds`, `ProgrammeViewer` go. Réglages keeps reading and writing
`TemplateResponsible` and its scopes until PR 6 rewrites it per schedule template, so `getResponsibleTemplateIds` and
`responsibility-scope.type.ts` stay for it, and for the absences' « who to contact » (`listUserConflictsInRange`,
which names the template's responsibles whatever the slot's schedule: identical today through the sync, moved with
Réglages in PR 6). 5a-2 and 5a-3 ship in one deploy.

**5-0, visibility (D46):** an event is visible where it has a published schedule, or no schedule at all and
`Event.status` released; an item is visible where its schedule is published. Identical to today while both schedules
publish together. When the status write stops (PR 6) the second branch becomes « no schedule at all », the surfaces'
kinds and audiences deciding.

**Order inside PR 5 (decided 2026-11-22):** 5-0 the status readers (« visible » = has a published schedule, no
visible change while both schedules publish together); 5i the writers move to items, in one PR because the id flip
is atomic; one deploy for both, with the control-plane PR that pins it; then 5a rights, 5b publishing, 5c the
event view and editor.

**5i, the id flip across the rollout:** the two id spaces overlap. A form of the new image posts an item id under a
new field name the previous image's actions do not read; the new image's actions also accept the old name, as a
legacy id they translate through `legacyPartId` / `legacyServiceId`. An old pod given a new form refuses; a new pod
given an old form translates; never the wrong row. The events snapshot diff is no longer empty at this deploy (ids
flip: compare with ids ignored); calendar-feed uids change once, replaced on the subscriber's next sync. The
control plane's GDPR export and congregation deletion move to items in the same control-plane PR that pins 5i:
from then the old tables stop receiving new rows.

**Publishing.** `publishSchedule` / `unpublishSchedule` (new `schedule-status.server.ts`, TDD) replace
`releaseEvent` / `unreleaseEvent`: refusal on a schedule with a conflict or an empty programme,
notification targets from that schedule's items only, pending notices of that schedule cancelled on
unpublish. Assignment writers hard-fail on a published schedule, flag on a draft one (today's rule per
event). Routes: `events/:eventId/schedules/:scheduleId/publish` and `/unpublish`; the bulk routes take
schedule ids. The old routes redirect.
The board documents' « à jour » stamp (`getContentVersion`) takes the schedules' `updatedAt` too: publishing one
schedule touches no event any more. The share message's draft check and the managers' draft labels follow the
schedule's status.

**5b slices (decided 2026-11-23):** 5b-1 the server: `publishSchedule`, `unpublishSchedule` and `canPublishSchedule`
(« Publier », or the responsible of that schedule's template) in `schedule-status.server.ts`; `Event.status` stays
written until PR 6, derived: released when any schedule is published (D51). A schedule is refused when its own items
hold a conflict, and a programme schedule when it is empty; duties have no such refusal. 5b-2 the readers: every
decision about an item reads its schedule's status, not the event's (assignment writers, the notification gate and
its context, the share message, external speakers, open parts, empty meetings, the board's « à jour »), and the
writers that make a schedule later (`eventScheduleId`, `attachEventItems`) follow D52. 5b-3 the
routes: `events/:eventId/schedules/:scheduleId/publish` and `/unpublish`; the event-level routes become « Tout
publier » / « Tout retirer » (D43), saying how many schedules they skipped; the bulk routes keep taking event ids,
each acting as « Tout publier », until the list selects schedules (8a). One deploy after 5b-3.

**5b-3 must also (from the 5b-2a review):** a released event can hold a draft schedule since D52 (a duty added beside
a published programme), so « Tout publier » never stops at « the event is released » (`releaseEvent`'s early
return), the event page offers it while a schedule the person may publish is a draft, and the bulk page selects events
holding such a schedule rather than events whose status is a draft. Each with its test.

**Creation** (D12): the form pre-selects the kind's suggested schedules, each untickable; a
responsible sees their own ticked and the others as drafts created with it. `programs/new.tsx`,
`ui/creation/use-programme-creation.ts`, `CreationSingleSections.tsx`, `schemas/program-new.schema.ts`,
`programme-creation.server.ts` (`createProgrammeSeries` / `createProgrammeOnDay` take schedule
template ids).

**Board reader.** `parseProgrammeDynamicConfig` learns the PR 6 shape now (PR 6 writes it), with
its test on both shapes.

**Event view and editor.** `EventView`, `EventEditor` and their panels show one section per schedule
(`ScheduleSection`, new), each with its status, responsible and « Publier »; « Ajouter un planning »
and « Changer le type » (T5). `EventView.tsx` (364) splits its header and its schedule sections first.

**Tests:** service tests for each row of the rights table and for publishing one schedule; E2E
`schedules.spec.ts`: publish the duties before the programme, the board shows the duties alone, then
both; `program-permissions.spec.ts` updated to the new rights.

**Items (T12):** writers move to `Item` and its allowed roles, and the public id becomes `Item.id` (the
projection helper of PR 4 flips; a form rendered by the previous image carries an old id, so posts say which
id space they use). While it rolls out, PR 4's image still serves and reads only items that mirror an old row
(`MIRRORED_ITEMS`): an item PR 5's writers make without one is missing from that image's pages until the
rollout ends, never an error. Callers that look an item up by its legacy id (`legacyPartId`, e.g. the
external speaker's cadence) are found by grep when the helper flips; the triggers stay until PR 9 for the previous
image, which still writes the old tables during the rollout (a row it writes lands in `Item` as before). The
migration rewrites pending notices from `EventPart` / `EventServicePart` to `Item` (`entityType`, `entityId`
through the legacy keys, `debounceKey`); the notice worker reads both kinds until PR 9.
**Archive (bump):** `template-items.ndjson`, `template-item-allowed-roles.ndjson`, `items.ndjson`,
`item-allowed-roles.ndjson` replace the four item files; an older archive's item files are mapped by the
backfill's rule in TypeScript (speaker → `main`, reader → `second`, a duty's list → `main`), as for schedules.

**As shipped (5i-b, #601):** the writers write items and the public id is `Item.id`. Forms and links carry it
under new names (`itemId`, `partItemId` / `serviceItemId`, `?item=`, `itemIds`). POST actions also read the old
names as the old row's id, translated by `itemIdFromRequest` for their own kind only. GET parameters and the deep
link read nothing under the old names. Item orders break ties on the old row's id first (`PART_TIE_BREAK` /
`SERVICE_TIE_BREAK`), because the backfill copied rows in no set order. Notices name `Item`
(`name_items_in_notices`), and cancelling also finds notices about old rows. Audit history keeps its old names.
**No archive bump:** the four item files keep their shape, filled from items, and the import still writes the old
tables, which the triggers mirror. The new item files and the bump come when the import writes items. Template
files stay until PR 6. Still on the old tables: the demo seed, the archive import and `attachEventItems`. An item
the app edits leaves its old row as it was, and the event mirrors' update branch (`mirror_event_items_by_change`)
copies only what an old row changed onto an item still in step with it, never inserting: a key Postgres sets to null
on a lagging row neither undoes the app's edits nor brings back a deleted item. The reference suite's outputs are unchanged; three of its test files
changed in id plumbing only.

## 11. PR 6 — Réglages: event kinds and schedule templates

- Réglages › Programmes becomes two lists: **Types d’évènements** (name, colour, duration, default
  hours, attendance (one-day kinds only, D23), suggested schedule templates, the meetings-to-move
  offer) and **Modèles de plannings** (name, kind, responsible role, parts or duties). Routes under
  `settings/routes/templates/` split into `kinds/` and `schedule-templates/`; `template.tsx` (216) and
  `_template-action.server.ts` (227) are rewritten rather than extended.
- Prisma: `model EventKind { … @@map("EventTemplate") }` (T2); `templateId` fields keep their column
  names through `@map`.
- Gates: « Gérer les modèles » for both lists; a responsible edits the items of their own schedule
  template (today's programme responsible rule, now per schedule template; the inconsistency between
  `list.tsx` and `template.tsx` goes).
- `TemplateResponsible` writes stop, and so do the template items' writes to `templateId` (they
  belong to a schedule template now); the settings audit becomes `ScheduleTemplateResponsibleChanged`.
- **Board configuration** (D29): `dynamic-config.schema.ts` becomes
  `{ kinds: [{ kindId, scheduleTemplateIds }], groupBy }`, suggested templates ticked by default;
  `parseProgrammeDynamicConfig` reads both shapes (old: parts → the kind's programme template,
  services → its duty templates) — the reader ships in PR 5, so PR 5's image already reads a
  configuration PR 6 saves; stored configurations are never rewritten, the new shape is written on the
  next save. `ProgrammeConfigFields.tsx`,
  `dynamic-form.queries.ts`, `new-dynamic.tsx` (255: the config fields move out first),
  `update-dynamic-document.server.ts`, `event-link.server.ts`. Archive (bump): the new shape, schedule
  template ids remapped on import; older configurations go through the same reader.
- Seeded kinds stay the three of today (D25) with their two suggested schedule templates each.

**Tests:** settings service tests (kinds, schedule templates, responsibles, attendance refused on a
multi-day kind once PR 7 adds durations), the reader on both shapes, `role-gated-assignees.spec.ts`
and `programme-reorder.spec.ts` updated.

## 12. Design round B

Before PR 7 and PR 8: the event form with custom fields and « Répéter chaque semaine », the two-way
save dialog (« Cette réunion seulement » / « … et les suivantes », with the prepared meetings offer),
the duty assignee picker (person, group, free text), the redesigned list and the weekly calendar.

## 13. PR 7 — Rules, fields, multi-day kinds, group and text assignees

**Schema and migration** `add_rules_and_fields`:

- `EventKind` (still the template table) gains `durationDays Int @default(1)`, and the CHECK
  `"attendanceKind" = 'none' OR "durationDays" = 1` (D23).
- `RecurrenceRule` (spec §5, with its optional `name`, D34; Cascade from the kind), `EventKindField`,
  `EventFieldValue` (Cascade from its field and its event) — each with `congregationId`, RLS and a
  `TENANT_MODELS` entry. `Event` gains `recurrenceRuleId?` (SetNull), `occurrenceDay?` and
  `changedOnce`, with a unique index on (`recurrenceRuleId`, `occurrenceDay`) (T11).
- `Item` gains `assigneeGroupId?` (PublisherGroup, SetNull) and `assigneeText?`, with a CHECK keeping
  the three assignees exclusive; offered only in duty schedules (T12).
- Backfill (spec §7 step 2): one rule per recurring template; its events on the template's weekday
  linked with their `occurrenceDay`, those whose hours differ marked `changedOnce`; events on another
  weekday left unlinked.

**Recurring job.** `extendRecurringEvents` extends each rule inside its validity, keyed on its
occurrences (`ON CONFLICT DO NOTHING` on the unique index, T11); it locks the kind's row, reads the
greater of the rule's and the template's mark, and raises both — and a split of a kind's only rule also
writes the template's weekday and hours — so PR 6's worker, still running during the rollout, neither
refills a passed day nor creates on the old weekday. PR 8 stops writing the template's fields (T9).
`moveEmptyMeetings` becomes the rule split of spec §5.6 (D20–D22): new `split-rule.server.ts` (TDD;
the new rule inherits the old mark; moves and collisions key on the rule, never on another rule's
meeting), `stop-rule.server.ts` for « Arrêter la répétition » (D32),
the empty-meeting definition of §5.1a in `empty-meetings.queries.ts`. `reanchorEmptyMeetings`,
`createProgrammeSeries`, `createProgrammeOnDay` read rules. Import creates rules before events, so the
first run does not refill imported weeks.

**Group and text assignees** (D13, D24):

- `assignServicePart` accepts a group or a text; no absence conflict and no cadence for them.
- Notification on publish: the group's overseer (`PublisherGroup.responsibleId`) and assistant
  (`deputyId`), through their accounts — `release-notifications.server.ts`, `notify-assignment.server.ts`.
  One without an account gets none, as for any assignee today. A deleted group leaves the duty open.
- Every member of the group sees the duty in « Mes prochaines affectations » on the dashboard
  (`get-upcoming-assignments.server.ts`, labelled with the group's name) and in their calendar feed
  (`personal-assignments.server.ts`).

**Multi-day events:** `durationDays` sets `endDate`; a multi-day kind's rule creates Monday-to-Sunday
events; lists and conflicts already work on ranges. A counted kind cannot become multi-day: the
settings form asks to set it « Non comptée » first; its counts stay (D23).

**Conductors** (D33): the event form shows a kind's single duty schedule inline (« Conducteur(s) »),
its duties filled in place; publishing it is the event's « Publier ».

**Archive (bump):** `recurrence-rules.ndjson`, `event-kind-fields.ndjson`, `event-field-values.ndjson`;
events carry `recurrenceRuleId` and `changedOnce`; duties carry the group and text assignees.

**Demo** (D26): « Semaine de nettoyage » by group, « Réunion pour la prédication » with eight rules
and their fields, « Témoignage public » with its points by group.

**Tests:** the rules list of spec §9; the race test extended to two rules of a kind on one weekday, a
series and the job; the unique index refusing a second event for an occurrence; a split beside another
rule's meeting on the same day; a split with an empty, a prepared and a counted meeting (D22); group notification targets; the
CHECKs.

## 13b. PR 7f — Event audiences

- Migration `add_event_audience`: `EventAudience` (spec §5), CHECKs keeping « event or rule » and
  « group or person » exclusive, `congregationId`, RLS, `TENANT_MODELS`; refused on a counted kind.
- **One visibility rule** (TDD): `events/server/event-visibility.server.ts` exports the condition
  « for everyone, or the viewer is in its audience, or assigned on it, or prepares programmes » and
  combines it with « has a published schedule ». Every event reader of Appendix A takes it — lists,
  calendar, event view (refuses an address the viewer may not see), dashboard, feed, notifications
  (an assignee is always in), cadence and facts, board builders, search — in one commit per feature.
- Rules carry an audience copied onto the events they create; changing it with « … et les suivantes »
  applies to the moved events, « Cette réunion seulement » to one.
- Board: the builders return, per slot, the reader's visible events and a collapsed marker when the
  slot holds only hidden group events; `ProgrammeView`, the documents' views and PDFs render
  « Par groupe ». PDFs are always rendered as for a reader without an account.
- UI from design round B: an « Pour » field (Tout le monde · groupes · personnes) on the event and
  rule forms; a marker on restricted events in lists.
- **Archive (bump):** `event-audiences.ndjson`, groups and members remapped.
- **Tests:** the audience rows of spec §9 against every reader (a test helper lists the readers so a
  new one without the condition fails), the board collapse on screen and in the PDF, the CHECKs.

## 14. PR 8 — Redesigned list and weekly calendar

The image stops writing the kind-level weekday, hours and mark (PR 7's image reads rules; T9).

- `programs/list.tsx` (169) and `ProgrammeList`, `ProgrammeRow`, `ProgrammeWeekTable`,
  `ProgrammeBulkActions` rebuilt from design round B: kind filter, schedule chips with their status,
  events without schedules, multi-day events.
- Calendar: a « Liste / Calendrier » switch on the title row, route `programs/calendar`
  (`?week=`), `CalendarWeek` component; multi-day events as a band; draft/published marker; opens the
  event.
- E2E: `programme-creation.spec.ts` and a calendar walk.

## 15. PR 9 — Schedules, contract

Once PR 8's image runs, and nothing reads or writes them any more (T9): drop `Event.status` (unwritten
since PR 5), `TemplateResponsible` and the template items' `templateId` (unwritten since PR 6), the eight
old item tables (`TemplatePart`, `TemplateServicePart`, `EventPart`, `EventServicePart` and their allowed
roles, unwritten since PR 5) and the items' legacy keys (T12);
`scheduleId` becomes required on items and `scheduleTemplateId` on template items. The items keep
their `eventId` (composite foreign key, PR 3). Readers left on the dropped columns fail the full suite
against the migrated schema first (the data-migration check).

## 16. PR 10 — Rule contract

Once PR 9's image runs: drop the kind-level `weekDay`, `startTime`, `endTime`, `isRecurring` and
`generatedUntil` (unwritten since PR 8; rules hold them, `defaultStartTime` / `defaultEndTime` prefill).
No table is renamed (T2). Fold the steady state into `docs/` (`meeting-attendance.md` — kinds and
rules —, a new `events.md`, `data-transfer.md`, `permissions-and-roles.md`) and archive both specs.

## 17. Event documents (after PR 7)

Each PR adds one `DynamicType`, its config schema in `dynamic-config.schema.ts`, a builder in
`display-board/server/` (published schedules only, displayed fields only), a screen view
(`ui/dynamic/*View.tsx`), a react-pdf document sharing its layout through a pure planner in
`display-board/model/`, the text block, render-gate tests and a route test of the PDF guards.

| PR | Type | Notes |
|---|---|---|
| Doc 1 | `events-list` | kinds, horizon; grouped by kind, sorted by date |
| Doc 2 | `table` | one kind, one schedule, orientation duties / groups, row label, range; current week highlighted on screen only |
| Doc 3 | `week` | rules in force today, part-of-day grid, changes to come and one-time changes within the horizon |

`dynamicConfig` travels in the archive since PR 0, so the new types need no format change. The
« Semaine type » prints a named rule's name in its cell (D34): no note of its own.

## Appendix A — Where today's code reads what changes

Inventory of November 2026 (test files excluded). Paths under `features/`.

**`Event.status` (~40 files).** Writers: `events/server/event-status.server.ts`,
`event-status.policy.ts`, `event-status-bulk.server.ts`, `delete-events.server.ts`,
`recurring-events.server.ts`, `days-off.server.ts`. Readers: events `model/programme-access.ts`,
`programme-list.queries.ts`, `empty-meetings.queries.ts`, `event-part-assignments.server.ts`,
`notify-assignment.server.ts`, `build-share-message.server.ts`, `days-off.queries.ts`,
`list-user-conflicts-in-range.server.ts`, `personal-assignments.server.ts`,
`member-engagement.queries.ts`, `cadence-shared.server.ts`, `list-user-cadence.server.ts`,
`list-user-service-cadence.server.ts`, `list-external-speaker-cadence.server.ts`,
`external-speakers.queries.ts`, `model/cadence.type.ts`, `programme-list.type.ts`,
`external-speaker.type.ts`; UI `EventView`, `ProgrammeRow`, `ProgrammeList`, `ProgrammeBulkActions`,
`ProgrammeWeekTable`, `RotationPanel`, `SpeakerDirectoryTable`, `compute-cadence-warnings.ts`;
routes `programs/list.tsx`, `events/view.tsx`, `release.tsx`, `unrelease.tsx`, `bulk-release.tsx`,
`bulk-unrelease.tsx`; dashboard `dashboard.server.ts`, `get-open-parts.server.ts`,
`get-responsible-conflicts.server.ts`, `get-upcoming-assignments.server.ts`; board
`dynamic-documents.server.ts`, `event-link.server.ts`; `shared/domain/export-account-data.server.ts`.

**Items (~60 files each).** Writers: `event-parts.server.ts`, `give-programme.server.ts`,
`programme-creation.server.ts`, `create-meeting-programme.server.ts`,
`event-part-assignments.server.ts`, `delete-events.server.ts`, `refresh-conflict-flags.server.ts`,
`allowed-roles.server.ts`, `event-templates.server.ts`, `duplicate-template.server.ts`,
`delete-template.server.ts`, `seed-templates.server.ts`. Readers: the status readers above, plus
`events-auth.server.ts`, `list-user-same-event-assignments.server.ts`, `slot-candidate-facts.server.ts`,
`assignment-candidates.server.ts`, `programme-creation.queries.ts`, `part-presets.*`,
`external-speakers.server.ts`, `resolve-*-cadence.server.ts`, `model/empty-meetings.ts`; routes
`assign-part`, `assign-service`, `remove-assignment`, `edit` + `_edit-event-intents.server.ts`,
`candidate-facts`, `external-speaker-info`, `reorder-parts`; UI `EventEditor`, `EventView`,
`EventProgrammePanel`, `EventAssignmentsPanel`, `EventServicesPanel`, `EventServiceAssignmentsPanel`,
`ServiceEditor`, `ServiceEditSheet`, `AssignServiceEditor`, `AssignServiceSheet`; dashboard
`model/meeting-visibility.ts`, `NextMeetingCard`, `build-urgent-items.ts`; board `board-reader.ts`,
`programme-sheet*.ts`, `programme-pdf-options.ts`, `ProgrammeView`, `pdf/ProgrammeDocument`,
`DynamicDocumentView`, `routes/dynamic/viewer.tsx` and `pdf.tsx`; settings `_template-action.server.ts`,
`templates/list.tsx`, `template.tsx`, `template-page.queries.ts`, `part-types.tsx`, the export and the
`import-event-templates` / `import-events` steps, `import-audit-consent.server.ts`,
`model/audit-entities.ts`; `shared/domain/role-reservations.server.ts`; `database/seed-marketing.ts`,
`database/demo/meetings.ts`.

**Responsibility (scopes).** `events/model/responsibility-scope.type.ts`, `model/programme-access.ts`,
`event-templates.server.ts` (responsible helpers), `events-auth.server.ts`,
`template-responsibles.server.ts`, `list-user-conflicts-in-range.server.ts`; routes
`programs/list.tsx`, `days-off.tsx`, `new.tsx`, the bulk routes, every `events/*.tsx` calling
`canEditEvent`; dashboard `get-responsible-conflicts`, `next-meeting-for-viewer`, `load-dashboard`;
settings `settings-access.server.ts`, `templates/list.tsx`, `template.tsx`, `reorder-parts.tsx`,
`_template-action.server.ts`, `template-page.queries.ts`, `TemplateInfoPanel`, `TemplateList`,
`template.schema.ts`, `settings-sections.ts`, the template import and export.

**Day-off (absences).** `events/model/event-template.type.ts`, `seed-templates.server.ts`,
`programme-event.queries.ts` (and the ~14 routes behind it), `days-off.server.ts`,
`days-off.queries.ts`, `refresh-conflict-flags.server.ts`, `event-part-assignments.server.ts`,
`event-part.policy.ts`, `slot-candidate-facts.server.ts`, `list-user-conflicts-in-range.server.ts`,
`member-engagement.queries.ts`, `personal-assignments.server.ts`, `model/absence.ts`,
`schemas/day-off.schema.ts`, `days-off.routes.ts` and `routes/days-off/*`, `routes/programs/days-off.tsx`,
UI `AbsenceForm`, `MyAbsenceRow`, `ProgrammeAbsenceRow`, `ProgrammeAbsences`, `AbsenceWeekList`,
`DayOffConflictModal`; dashboard `dashboard.server.ts`, `get-open-parts`, `get-upcoming-assignments`,
`AbsencesSection`, `build-urgent-items.ts`, `dashboard-creations.ts`; publishers
`list-publishers.server.ts`, `_record-blocks.server.ts`, `RecordEngagements`, `PublisherTable`;
settings `import-events.server.ts`, `TemplateList`, `template.tsx`; `shared/ui/navigation-config.ts`;
registration seeding in `authentication/server/register-congregation.server.ts` and
`setup-first-account.server.ts`; `database/seed*.ts`, `database/demo/*`.

**Files near a budget.** `import-congregation.server.ts` 349/350 (PR 0), `seed-templates.server.ts`
333, `event-templates.server.ts` 327, `event-status.server.ts` 307 (PR 3), `EventView.tsx` 364/400
(PR 5), `new-dynamic.tsx` 255/300 (PR 6).
