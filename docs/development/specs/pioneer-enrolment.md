# Spec: Pioneer Enrolment (plan/actual split)

**Status:** Draft — design discussed with the maintainer. Two decisions **locked** (full enrolment
model; the manager sets the auxiliary goal from the publisher edit page, no dedicated screen). The
remaining integration forks are marked **Proposed** and need a nod before coding. Not yet implemented.
**Author:** Nathanaël Cherrier
**Feature area:** `features/publishers`
**Related:** [Pioneer Activity Monitoring](./pioneer-activity-monitoring.md), [Emergency-Preparedness Info](./emergency-preparedness-info.md) (structural template), [Architecture Conventions](../architecture-conventions.md), [Row-Level Security](../row-level-security.md), [Data Transfer](../data-transfer.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state behavior
> should be folded into `docs/product/publishers.md` and this file archived.

## 1. Problem

Pioneer enrolment today is **implicit** — inferred from the per-month `type` snapshot on
`PublisherActivity` (the inference engine shipped in [Pioneer Activity Monitoring](./pioneer-activity-monitoring.md):
`computePioneerPace` + `notEnrolledMonths` + the "concluded = latest snapshot isn't a pioneer"
heuristic). There is no record that says *"this member is a pioneer of type X, for period Y, with
goal Z."* Two structural consequences:

1. **`PioneerGoal` is per `(serviceYear, type)`** — every auxiliary pioneer gets the same rate
   (default 30 h). There is no way to express a **per-person** goal, even though auxiliary pioneering
   is historically **per person, per month** (some take 15 h, some 30 h, in the same month).
2. **Plan and actual are fused.** A pioneer month only "exists" once an hours report row is filed.
   You cannot represent *"signed up as auxiliary for 15 h this month, report pending"*, and
   stop-vs-missed-report is guesswork (the edge we deliberately accepted in the monitoring feature —
   see its §"limitation").

The auxiliary two-phase workflow is the real driver: a manager **enrols** a publisher as auxiliary
at the **start** of the month with a chosen goal, and the hours **report** lands at the **end**.

## 2. Goals / Non-goals

**Goals**

- Introduce an explicit **`PioneerEnrolment`** record: who / what type / what period / what goal.
- Make enrolment the **source of truth** for pace: which months are owed, and at what goal.
- Support **per-person, per-month** auxiliary goals (15 / 30 h), set by a manager.
- Represent **stop-and-restart** and **appointment dates** exactly (two stints), retiring the
  inference heuristics.
- **Migrate** existing data by backfilling enrolments from the historical activity-row type
  snapshots (the inference logic becomes a one-time backfill).
- Preserve current pace behavior for existing data — proven by the monitoring test suite as a parity
  harness.

**Non-goals**

- A dedicated monthly "auxiliary enrolment" roster screen. **Decided against** — enrolment is edited
  from the **publishing section of the publisher edit page** (§10). Revisit a bulk view only if the
  per-member cadence chafes.
- Self-service enrolment by publishers. Managers enrol (matches today's manager-enters-everything).
- Campaign scheduling, reminders, notifications. *(Speculative — out of scope.)*
- Changing what a **report** stores (`PublisherActivity` hours/studies unchanged).
- Rewriting built-in role sync to read enrolments (fork §7.1 keeps `Member.type` as the synced cache).

## 3. Domain background & the plan/actual split

- **Pioneer types** (`PublisherType`): `PionnierPermanant`, `PionnierAuxiliaires`, `PionnierSpecial`,
  `Missionnaire`. `Normal` is not a pioneer.
- **Two rhythms:** permanent/special/missionary carry an **annual** commitment (a multi-month stint);
  auxiliary **re-enrols month-to-month** with its own monthly goal.
- **Service year** = Sept→Aug; `month` is 0-indexed calendar month; a service year `SY` spans
  `(year=SY, month≥8) OR (year=SY+1, month≤7)`.
- **Core idea — separate plan from actual:**
  - *Plan* = `PioneerEnrolment` (who's a pioneer of what, when, at what goal).
  - *Actual* = `PublisherActivity` (hours/studies filed).
  - Pace = actual vs plan. This one split fixes per-person goals, report-pending visibility, and
    stop/restart precision in a single stroke.
- **Existing setting:** `CongregationSettingKey.AuxiliaryPioneerProfileActivated` already gates
  whether the auxiliary option appears on the edit page (`edit-publisher.tsx` loader). Enrolment UI
  must respect it.

## 4. Conventions consulted

- **`Member` is a guarded aggregate** (`db.member.*` writes only in `*.aggregate.ts`, checked by
  `pnpm test:aggregate-boundaries`). `member.aggregate.ts` is **323 / 350** lines — near the hard
  budget, so it must not grow materially.
- **Aggregate doctrine:** `PioneerEnrolment` **does** carry invariants (no overlapping stints,
  `end ≥ start`, pioneer-type-only, auxiliary = single month) → it warrants its **own**
  `pioneer-enrolment.aggregate.ts`, and is added to `AGGREGATE_MODELS`.
- **Cross-aggregate orchestration** goes in a `*.workflow.ts` (enrol/close touches both
  `PioneerEnrolment` and `Member.type`).
- **CQRS-lite:** writes in `*.aggregate.ts` / `*.workflow.ts`, reads in `*.queries.ts` — never mixed.
- **RLS:** denormalised `congregationId` + `@@unique([id, congregationId])` + a `tenant_isolation`
  policy using the `CASE WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN
  true …` guard (never `OR`).
- **TDD** for the pure pace math and new service functions: test first, watch fail, implement.
  **No React component tests.**
- **Barrels:** client-safe `features/publishers/index.ts`, server `index.server.ts`.
- **i18n:** French primary; snake_case keys in `en.json` + `fr.json`.
- **Migration:** `migrate diff` + hand-edited SQL + `migrate deploy` (never `migrate dev`); copy
  `schema.prisma` to `unitae-platform` and regenerate. Latest migration is
  `20260802000000_add_member_email`, so ours timestamps after it.

## 5. Design overview

```
model/pioneer-enrolment.ts           (pure: service-year intersection, goal resolution helpers)
schemas/pioneer-enrolment.schema.ts  (type + period + optional goal)
server/pioneer-enrolment.aggregate.ts (open/close/update/delete enrolment; invariants)
server/pioneer-enrolment.workflow.ts (enrol/close → enrolment aggregate + member type sync)
server/pioneer-enrolment.queries.ts  (enrolments for a member / service year)
server/member.aggregate.ts           (+ small setPioneerType writer, syncs built-in roles)
        ├─► pioneer-activity.queries.ts  — build the enrolled-month plan from enrolments (retire inference)
        ├─► model/pioneer-pace.ts        — consume the plan instead of inferring it
        └─► edit-publisher.tsx           — publishing section: appointment + auxiliary enrolment
```

## 6. Data model — `app/database/schema.prisma`

```prisma
model PioneerEnrolment {
  id          Int           @id @default(autoincrement())
  member      Member        @relation(fields: [memberId, congregationId], references: [id, congregationId], onDelete: Cascade)
  memberId    Int
  type        PublisherType // a pioneer type, never Normal

  // Inclusive month range, 0-indexed month + calendar year. endMonth/endYear null = ongoing.
  // Auxiliary enrolments are always a single month (startMonth/Year == endMonth/Year).
  startMonth  Int
  startYear   Int
  endMonth    Int?
  endYear     Int?

  monthlyGoal Int?          // null = fall back to PioneerGoal(serviceYear, type) → built-in default

  congregation   Congregation @relation(fields: [congregationId], references: [id])
  congregationId Int
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@unique([id, congregationId])
  @@index([congregationId])
  @@index([memberId, congregationId])
}
```

Add `pioneerEnrolments PioneerEnrolment[]` reverse relations to `Member` and `Congregation`.

**Migration** (`{timestamp}_add_pioneer_enrolment/migration.sql`): `migrate diff` for the table +
indexes + FKs (member composite `ON DELETE CASCADE`, congregation `ON DELETE RESTRICT`), then hand-add
the RLS block (copy from `20260801100000_add_pioneer_goal`). **Then run the backfill** (§6.1) as part
of the same migration or a follow-up data migration. `migrate deploy && prisma generate`; copy schema
to `unitae-platform`.

### 6.1 Backfill (the inference logic, run once)

For each member, over all `PublisherActivity` rows (deduped latest-id-per-month, ordered):

- Group **maximal runs of the same pioneer type** into enrolments. A run is broken by a month with an
  explicit **non-matching-type** row (regular publisher or a different pioneer type); a **no-row gap**
  inside a run does **not** break it (stays owed — matches today's behavior).
- **Annual types** → one enrolment per run: `startMonth/Year` = first month of the run;
  `endMonth/Year` = last month of the run **if the member is no longer that type as of their latest
  row** (concluded), else `null` (ongoing).
- **Auxiliary** → one single-month enrolment per reported auxiliary month, `monthlyGoal = null`
  (historical per-person goals are unknowable → default; **acceptable**, called out in §15).

This backfill is the exact stop/restart + concluded logic already unit-tested in
`pioneer-pace.test.ts`, so parity is verifiable.

## 7. Key integration forks (Proposed)

### 7.1 `Member.type` ↔ enrolment  *(Proposed)*

`Member.type` **stays** as the current-type cache that drives `syncBuiltInRoleAssignments`
(`member.aggregate.ts` → `built-in-roles.server.ts`). Rewriting role sync to read enrolments is a
large blast radius and out of scope. Instead:

- Add a small `setPioneerType(db, memberId, congregationId, actorId, type)` to `member.aggregate.ts`
  (update `type` + `syncBuiltInRoleAssignments`; ~15 lines — watch the 350-line budget, refactor a
  helper out if needed).
- The **enrol/close workflow** (`pioneer-enrolment.workflow.ts`) opens/closes the enrolment **and**
  calls `setPioneerType` (open annual → set `type`; close the last ongoing stint → set `Normal`).
- Auxiliary enrolment does **not** change `Member.type` (auxiliary is monthly, not a standing type)
  unless the congregation models it that way today — **open question** (§15).

### 7.2 `PublisherActivity.type` going forward  *(Proposed)*

Keep `type` on each report as the recorded fact, but **pace/goal logic reads enrolments, not the row
type**. On a new report, derive its `type` from the member's active enrolment for that month so the two
cannot diverge. The backfill (§6.1) reads historical row types once to seed enrolments.

### 7.3 Goal resolution  *(layering)*

```
monthlyGoal(member, month) = enrolment.monthlyGoal
                          ?? PioneerGoal(serviceYear, enrolment.type)
                          ?? built-in default (pioneer-goals.constants.ts)
```

`PioneerGoal` stays as the per-year **default** source; the enrolment overrides per person (mainly
auxiliary). No change to the existing `pioneer-goals.queries.ts` resolver — it becomes the fallback.

## 8. Server & code changes

**Aggregate** `server/pioneer-enrolment.aggregate.ts` (+ unit test mocking `db`/`audit`, TDD-first;
+ integration test). Added to `AGGREGATE_MODELS`. Invariants (pure `_assert*` helpers, 100 % branch
coverage):

- `type` is a pioneer type (`isPioneerType`); reject `Normal`.
- `end ≥ start` when end is set.
- **No overlapping enrolments** for the same member.
- Auxiliary ⟹ single month (`start == end`).
- `monthlyGoal`, if set, `> 0`.

Functions: `openEnrolment`, `closeEnrolment(endMonth/Year)`, `updateEnrolment` (goal/period),
`deleteEnrolment`; each `audit(...)` after the write.

**Workflow** `server/pioneer-enrolment.workflow.ts`: `enrolPioneer` / `endPioneerEnrolment` —
orchestrates the aggregate + `memberAggregate.setPioneerType` (§7.1) in one transaction.

**Reads** `server/pioneer-enrolment.queries.ts`: `getEnrolmentsForMember`,
`getEnrolmentsForServiceYear(serviceYear)` (feeds the roster/pace query).

**Pace rewrite** `model/pioneer-pace.ts` + `server/pioneer-activity.queries.ts`:

- The roster/detail query builds the **enrolled-month plan** from `PioneerEnrolment` (intersected with
  the service year) + per-month goal, and the **actuals** from `PublisherActivity`.
- `computePioneerPace` consumes the plan directly. **Retire** `notEnrolledMonths`,
  `enrolledSinceYearStart`, and the concluded heuristic — "concluded" = latest enrolment `end` is
  before the current expected month.
- **Parity step:** keep the existing `pioneer-pace.test.ts` / `pioneer-activity.queries.test.ts`
  green against the enrolment-driven path (adapt inputs, same expected numbers) — this proves the
  refactor preserves shipped behavior before the inference code is deleted.

**Barrels:** `index.ts` re-exports the schema + pure helpers; `index.server.ts` re-exports the
aggregate, workflow, and queries.

## 9. Permissions & audit

- **Enrolment editing** is on the publisher edit page → gated on **`PublisherManager`** (existing).
  Goal-setting reuses the existing `PioneerGoalManager` where relevant. *(Proposed — confirm whether
  enrolment needs its own permission; lean: reuse `PublisherManager`.)*
- **Audit** (`audit.server.ts`, free String column, no migration):
  `PioneerEnrolled`, `PioneerEnrolmentEnded`, `PioneerEnrolmentUpdated`.

## 10. UI — publisher edit page (decided: no dedicated screen)

Extend the **publishing section** of `edit-publisher.tsx` (today `PublisherNominationForm` /
`PublisherFieldServiceForm`), respecting `AuxiliaryPioneerProfileActivated`:

- **Annual appointment** — set/clear the permanent/special/missionary enrolment (start month, optional
  end). Replaces the raw `type` dropdown as the way a standing pioneer type is set. *(Interaction with
  the existing type field — open question §15.)*
- **Auxiliary enrolment** — for the current/next month, a manager marks the publisher as auxiliary and
  picks the goal (15 / 30). Small enough for the per-member cadence at typical volumes.
- Keep the form component under the 400-line budget; extract a `PioneerEnrolmentFields` component if
  needed. No form logic in the route.

## 11. Data transfer (export/import)

New tenant table → wire into the `.unitae` archive ([data-transfer.md](../data-transfer.md)):

- **Export** — add `PioneerEnrolment` to `ENTITY_FILES` + `buildExportSteps`
  (`export-congregation.server.ts`) **after `Member`** (FK dependency).
- **Import** — an `importPioneerEnrolments` step remapping `memberId` through `EntityIdMap`.
- **Version** — bump `ARCHIVE_VERSION` and extend `SUPPORTED_ARCHIVE_VERSIONS` (older archives import
  with the table empty; the backfill only runs on the schema migration, not on import — **open
  question §15**: do imported archives need a post-import backfill from their activity rows?).

## 12. Anonymize / retention

Enrolments are membership facts, not third-party PII — like activity rows, they are **preserved** on
anonymize (an UPDATE) and removed only when the member is hard-deleted (FK cascade). No
`purge*` call needed. Confirm against `member.aggregate.ts` `anonymize` + the retention cron.

## 13. Phasing

1. **Model + backfill** — schema/migration, `PioneerEnrolment` aggregate + workflow + queries, goal
   resolution, one-time backfill from activity history.
2. **Pace on enrolments (parity)** — rewire `pioneer-activity.queries.ts` + `pioneer-pace.ts` to read
   enrolments; keep the monitoring test suite green; then delete the inference paths.
3. **Edit-page UI** — annual appointment + auxiliary monthly enrolment in the publishing section;
   report `type` derived from the active enrolment.
4. **Data transfer** — export/import wiring + version bump.

## 14. Testing

- `pioneer-enrolment.aggregate.test.ts` (unit, mock db/audit) — every invariant, TDD-first; +
  `*.integration.test.ts` (RLS round-trip, overlapping-stint rejection).
- `pioneer-enrolment.workflow.test.ts` — enrol/close updates `Member.type` + re-syncs roles.
- Backfill test (integration) — a member with stop/restart + auxiliary months yields the expected
  enrolments; pace parity vs the pre-migration numbers.
- `pioneer-pace.test.ts` — adapted to enrolment inputs, **same expected values** (parity harness).
- Guards: `test:service-test-coverage`, `test:aggregate-boundaries`, `test:boundaries`,
  `test:server-barrel-exports`. Routes/UI TDD-exempt.

## 15. Open questions

1. **Type dropdown vs enrolment controls** (§10) — does the edit page keep a raw `type` field, or is
   the standing type fully driven by opening/closing an annual enrolment? *(Lean: enrolment drives it;
   the dropdown becomes read-only/derived.)*
2. **Auxiliary and `Member.type`** (§7.1) — while enrolled as auxiliary for a month, is `Member.type`
   set to `PionnierAuxiliaires` (so role sync/UI reflect it), or does `type` stay `Normal` and only
   the enrolment carries it? *(Affects built-in role sync.)*
3. **Imported archives** (§11) — run a post-import backfill from the archive's activity rows, or
   import enrolments verbatim (and skip backfill entirely for archives)? *(Lean: export/import
   enrolments verbatim; no import-time backfill.)*
4. **Historical auxiliary goals** (§6.1) — backfill with the default rate (per-person 15/30 history is
   unrecoverable). *(Lean: accept; managers can correct going forward.)*
5. **`bulkUpdateType`** (`member.aggregate.ts`) — how does a mass type change reconcile with existing
   enrolments? *(Likely: out of scope / manual for now.)*
