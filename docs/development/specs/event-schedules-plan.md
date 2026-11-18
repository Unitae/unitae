# Implementation plan: event schedules and event documents

**Status:** Draft — implementation plan for [event schedules](./event-schedules.md) and
[event documents](./event-documents.md). Decisions D1–D34 are in the spec; the plan adds no product
decision of its own, only the technical choices listed in §1.
**Author:** Nathanaël Cherrier
**Related:** [Meeting Attendance](../meeting-attendance.md), [Data Transfer](../data-transfer.md),
[Architecture Conventions](../architecture-conventions.md), [Permissions & Roles](../permissions-and-roles.md)

> Paths are relative to `app/` unless they start with `docs/` or `scripts/`. Line counts are from
> November 2026 and only matter where a file-size budget forces a split.

## 1. Technical choices taken in the plan

| # | Choice | Why |
|---|---|---|
| T1 | **The service-part tables keep their names.** `EventServicePart`, `TemplateServicePart` and their allowed-role tables stay as they are in the database and in Prisma; « duty » is the word of the UI, the spec and new code. | The model names are frozen into pending notification rows, debounce keys (`EventServicePart:<id>:user:<n>`), audit rows and the legacy entity map of the archive import. A rename buys nothing and needs a map in four places. |
| T2 | **`EventTemplate` becomes the event kind in place**, and its table is never renamed: the Prisma model becomes `EventKind` with `@@map("EventTemplate")` in PR 6, and audit rows keep the entity type `EventTemplate`. | A table rename breaks the image still running at the migration; a mapped model costs nothing but a cosmetic SQL name. |
| T3 | **Allowed roles hang off items, not schedules.** The four allowed-role tables and `PartPreset.scope` (`part` / `service`) are untouched; `service` means « duty » from PR 5 on, in labels only. | They describe one item; moving items into schedules does not change them. |
| T4 | **The freeform template becomes the kind « Autre évènement »**: no suggested schedules, no rules, managers only, as today. The stale « freeform = templateId null » comments go in PR 0. | It is already a template row; nothing to migrate. |
| T5 | **`applyTemplateToEvent` splits in two** (PR 5): « Ajouter un planning » (from a schedule template, appended as a new schedule) and « Changer le type » (the event's kind, an event edit). | Today one action re-points `templateId` — which changes who is responsible — and appends parts and services. |
| T6 | **Rules get their own expand step** (PR 7), after schedules are switched, instead of being backfilled with schedules. The kind-level weekday, hours and `generatedUntil` are written until PR 8 and dropped in PR 10; the lock stays on the kind's row. | Keeps PR 3 to one concern; the recurring job changes in one PR. |
| T7 | **Every expand PR's successor re-runs its backfill** for rows the previous image wrote during the rollout (absences in PR 2, the whole schedules backfill in PR 4), keyed so a re-run attaches to what exists, before anything reads or drops the old shape. | The old image keeps writing the old shape until the new one replaces it. |
| T9 | **A contract is two releases**: one image stops reading and writing the old shape, the next release's migration drops it. `Event.status` stops being written in PR 5, `TemplateResponsible` and the template items' `templateId` in PR 6, the kind-level weekday/hours/mark in PR 8, `Absence.legacyEventId` in PR 2. The items keep their `eventId`, held equal to their schedule's by a composite foreign key. | The migration runs while the previous image still serves. |
| T10 | **`Event.origin`** (`job` / `manual` / `import`) replaces « null author » as the sign of a job-made meeting (PR 0). | Clearing an author (account deletion) must never turn a hand-made event into one a template move may delete. |
| T11 | **One event per occurrence, by constraint**: `Event.occurrenceDay` and a unique index on (`recurrenceRuleId`, `occurrenceDay`) (PR 7). The job inserts with `ON CONFLICT DO NOTHING`; dedupe and moves key on the rule, never on the kind and the day. | Eight rules of one kind share weekdays; a day-keyed check would skip one rule's events and let a split delete another rule's meeting. |
| T8 | **One archive version per PR that changes the format**: 2.16 (PR 0), 2.17 (PR 1), 2.18 (PR 3), 2.19 (PR 6: the board configuration's new shape, schedule template ids remapped), 2.20 (PR 7). Each previous version joins `SUPPORTED_ARCHIVE_VERSIONS` and has an import mapping. | Same rule as every bump so far. |

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

## 3. Phasing at a glance

| PR | Content | Format | UI |
|---|---|---|---|
| 0 | Fixes found by the inventory | 2.16 | small |
| 1 | Absences — expand | 2.17 | none |
| 2 | Absences — contract | — | none |
| 3 | Schedules — expand | 2.18 | none |
| — | Design round A (event view, publishing, settings) | — | canvas |
| 4 | Schedules — read switch | — | none visible |
| 5 | Per-schedule publishing, event view, rights | — | yes |
| 6 | Réglages: event kinds and schedule templates; board configuration | 2.19 | yes |
| — | Design round B (rules, fields, list, calendar) | — | canvas |
| 7 | Rules, custom fields, multi-day kinds, group and text assignees; demo | 2.20 | yes |
| 8 | Redesigned list and weekly calendar | — | yes |
| 9 | Schedules — contract | — | none |
| 10 | Rule contract | — | none |
| Doc 1–3 | Event documents: Liste d’évènements, Tableau, Semaine type | — | yes |

## 4. PR 0 — Fixes found on the way

Bugs in today's code that would otherwise flow into the backfills, and the origin column (T10).

| Area | Change |
|---|---|
| Archive | `events.ndjson` carries `status` (export `export-congregation.server.ts`, import `import-events.server.ts`; pre-2.16 events import as today: `draft`, day-offs `released`). `board-dynamic-document-settings` carries `dynamicConfig` (export, `import-board.server.ts`), template ids remapped through the id map. 2.15 → 2.16. |
| Notices | `deleteEvent` / `bulkDeleteEvents` (`delete-events.server.ts`) and `deletePartAssignment` / `deleteServicePartAssignment` (`event-parts.server.ts`) cancel the pending `assigned` notices of the items they delete, as `unreleaseEvent` and `removeProgrammes` do. `event-parts.server.ts` is exempt at 364 lines: the cancel goes through a helper in `notify-assignment.server.ts`. |
| Whom to warn | `list-user-conflicts-in-range.server.ts` resolves a responsible role's people through the same rule as `resolveEffectiveRoleIds` (accounts holding it by hand or through a member seat), not `role.members.user` only. |
| Apply template | `listApplicableTemplates` (`events-auth.server.ts`) never offers a system template: applying « day-off » turned a meeting into an absence. |
| Account deletion | `deleteAccount` (`settings/server/delete-account.server.ts`) no longer ends in a foreign-key error: the account's day-off events whose owner has no record are deleted with it, its other events lose their author (`createdById` → null). Day-offs of an account linked to a record are handed to the record in PR 1; until then deletion is refused for them with « Ce compte a des absences » (`AccountRefusal`). Its origin stays `manual`, so a hand-made event never becomes an empty meeting a template move may delete. |
| Origin (T10) | Migration `add_event_origin`: `Event.origin` (`job` / `manual` / `import`, CHECK, default `manual`), backfilled `job` where `createdById` is null and the event has no part, service or count, `manual` otherwise. `createEmptyMeetings` writes `job`, imports `import`; `EMPTY_MEETING` (`empty-meetings.queries.ts`) and `reanchorEmptyMeetings` test `origin = 'job'` instead of a null author. The previous image creates events with the default `manual` — its empty meetings during the rollout are fixed by a second run of the backfill in PR 1. Archive: `events.ndjson` carries it. |
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

**Archive 2.17:** `absences.ndjson` (dates, note, `memberId`, `accountId` remapped); day-off events no
longer exported. Import of ≤ 2.16 maps day-off events to absences through the same rule as the
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
- Drop `Absence.legacyEventId` (PR 2's image no longer writes it).

Backfill (spec §7 step 2, minus rules — T6):

- per template other than freeform: « Programme — <name> » if it has parts, responsible = its
  `programme` responsible; « Services — <name> » if it has service parts, responsible = its `service`
  responsible, else its `programme` one (D31: never both); both linked as suggestions, programme first. Template items
  get their `scheduleTemplateId`.
- per event: a programme schedule if it has parts, a « Services » schedule if it has service parts,
  `status` = `published` when the event is `released`; items get their `scheduleId`.
- Re-runnable: an event's existing schedule of the same template (or key) is reused, never doubled;
  where an event's status and its schedules disagree, the event's status wins (T7).
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

**Archive 2.18:** `schedule-templates.ndjson`, `kind-schedule-templates.ndjson`, `schedules.ndjson`;
items carry `scheduleId` / `scheduleTemplateId`. Import of ≤ 2.17 runs the migration's rule in
TypeScript (`import-schedules.server.ts`), using the event statuses PR 0 started exporting (2.15 and
older: all draft, as their import already does).

**Demo:** the seed sets responsibles on its templates (it sets none today) and writes schedules.

**Previous image:** writes items without schedules and statuses on events only; PR 4 catches up.

**Tests:** migration test (a template with parts only, services only, both, neither; responsibles
with and without a service scope; a released and a draft event; idempotence; the partial unique
index refusing a second programme); dual-write service tests; archive round-trip and a 2.17 import.

## 8. Design round A

On the canvas, before PR 5: the event view with one section per schedule (status, responsible,
« Publier »), « Ajouter un planning » and « Changer le type », the bulk publish report, Réglages
« Types d’évènements » and « Modèles de plannings », the board programme configuration. Questions
numbered on the board; PR 5 starts on the user's go.

## 9. PR 4 — Schedules, read switch

1. Migration `catch_up_schedules`: the whole PR 3 backfill again, idempotently (T7) — templates
   created during the rollout get their schedule templates, responsible changes reach
   `responsibleRoleId`, items without `scheduleId` get their schedule, statuses are realigned (the
   event's status wins). `scheduleId` stays nullable until PR 9 makes it required.
2. Every reader of items and status reads schedules: the ~40 status readers and ~60 + ~50 item readers
   listed in Appendix A, grouped into commits by feature — events (lists, view, cadence,
   conflicts, candidates, share message, engagement, feed, notifications), dashboard (next meeting,
   open parts, upcoming assignments, responsible conflicts, urgent items), board (`dynamic-documents`,
   `event-link`, `board-reader`, `programme-sheet`), the account data export.
3. « Visible » = has a published schedule; the attendance readers keep reading every event of a
   counted kind (spec §5.3) — `attendance.queries.ts` is untouched and its tests prove it.
4. `Event.status` is still written (released when any schedule is published) for the previous image;
   PR 5 stops (T9).

No visible change: one programme and one services schedule per event publish together until PR 5.
**Tests:** every touched query keeps its tests green against fixtures written in the new shape; a
dual-shape fixture proves PR 3's image still reads the same results.

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
read (still written for PR 4's image, which reads it). `Event.status` is no longer written: PR 4's
image already reads schedules (T9).

**Publishing.** `publishSchedule` / `unpublishSchedule` (new `schedule-status.server.ts`, TDD) replace
`releaseEvent` / `unreleaseEvent`: refusal on a schedule with a conflict or an empty programme,
notification targets from that schedule's items only, pending notices of that schedule cancelled on
unpublish. Assignment writers hard-fail on a published schedule, flag on a draft one (today's rule per
event). Routes: `events/:eventId/schedules/:scheduleId/publish` and `/unpublish`; the bulk routes take
schedule ids. The old routes redirect.

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
  `update-dynamic-document.server.ts`, `event-link.server.ts`. Archive 2.19: the new shape, schedule
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
- `EventServicePart` gains `assigneeGroupId?` (PublisherGroup, SetNull) and `assigneeText?`, with a
  CHECK keeping the three assignees exclusive.
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

**Archive 2.20:** `recurrence-rules.ndjson`, `event-kind-fields.ndjson`, `event-field-values.ndjson`;
events carry `recurrenceRuleId` and `changedOnce`; duties carry the group and text assignees.

**Demo** (D26): « Semaine de nettoyage » by group, « Réunion pour la prédication » with eight rules
and their fields, « Témoignage public » with its points by group.

**Tests:** the rules list of spec §9; the race test extended to two rules of a kind on one weekday, a
series and the job; the unique index refusing a second event for an occurrence; a split beside another
rule's meeting on the same day; a split with an empty, a prepared and a counted meeting (D22); group notification targets; the
CHECKs.

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
since PR 5), `TemplateResponsible` and the template items' `templateId` (unwritten since PR 6);
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
