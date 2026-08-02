# Spec: Pioneer Enrolment (plan/actual split)

**Status:** Draft — design discussed with the maintainer and revised after a three-lens review
(architecture, JW domain, UX). Locked: full enrolment model; manager sets the auxiliary goal from the
publisher edit page (no dedicated screen); auxiliary enrolment does **not** change `Member.type`
(§7.1). **One product decision still open** — removing the raw pioneer-type dropdown (§15.1). Not yet
implemented.
**Author:** Nathanaël Cherrier
**Feature area:** `features/publishers`
**Related:** [Pioneer Activity Monitoring](./pioneer-activity-monitoring.md), [Emergency-Preparedness Info](./emergency-preparedness-info.md) (structural template), [Architecture Conventions](../architecture-conventions.md), [Row-Level Security](../row-level-security.md), [Data Transfer](../data-transfer.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state behavior
> should be folded into `docs/product/publishers.md` and this file archived.

> **Revision note.** Reviewed by three lenses. The domain lens confirmed the model is faithful to real
> pioneer practice and resolved the auxiliary/`Member.type` question. The architecture lens turned up
> specification gaps in the backfill, illegal-state prevention, and the parity proof — all folded in
> below. The UX lens surfaced the "where do I see who's enrolled" gap and pushed the type-dropdown
> decision to a head. Sections below reflect those corrections.

## 1. Problem

Pioneer enrolment today is **implicit** — inferred from the per-month `type` snapshot on
`PublisherActivity` (the inference engine shipped in [Pioneer Activity Monitoring](./pioneer-activity-monitoring.md):
`computePioneerPace` + `notEnrolledMonths` + `enrolledSinceYearStart` + the "concluded = latest
snapshot isn't a pioneer" heuristic). There is no record that says *"this member is a pioneer of type
X, for period Y, with goal Z."* Two structural consequences:

1. **`PioneerGoal` is per `(serviceYear, type)`** — every auxiliary pioneer gets the same rate
   (default 30 h). There is no way to express a **per-person** goal, even though auxiliary pioneering
   is historically **per person, per month** (some take 15 h, some 30 h, in the same month).
2. **Plan and actual are fused.** A pioneer month only "exists" once an hours report row is filed.
   You cannot represent *"signed up as auxiliary for 15 h this month, report pending"*, and
   stop-vs-missed-report is guesswork (the edge we deliberately accepted in the monitoring feature).

The auxiliary two-phase workflow is the real driver: a manager **enrols** a publisher as auxiliary at
the **start** of the month with a chosen goal, and the hours **report** lands at the **end**.

## 2. Goals / Non-goals

**Goals**

- Introduce an explicit **`PioneerEnrolment`** record: who / what type / what period / what goal.
- Make enrolment the **source of truth** for pace: which months are owed, and at what goal.
- Support **per-person, per-month** auxiliary goals (15 / 30 h), set by a manager.
- Represent **stop-and-restart** and **appointment dates** exactly (separate stints), retiring the
  inference heuristics (`notEnrolledMonths`, `enrolledSinceYearStart`, the concluded heuristic).
- **Migrate** existing data by backfilling enrolments from the full activity history (the inference
  logic becomes a one-time backfill).
- Preserve current pace behavior for existing data — proven by a **backfill→pace parity integration
  test** on representative rows (§14), a Phase-1 merge gate.

**Non-goals**

- A dedicated monthly "auxiliary enrolment" roster screen. **Decided against** — enrolment is edited
  from the **publishing section of the publisher edit page** (§10). Revisit a bulk view only if the
  per-member cadence chafes.
- Self-service enrolment by publishers. Managers enrol.
- Campaign scheduling, reminders, notifications. *(Speculative — out of scope.)*
- Annual **renewal tracking** (a permanent pioneer is technically re-confirmed each Sept). The
  continuous-stint model omits this touchpoint — a documented simplification (§16), not a blocker.
- Distinguishing appointment date / service-start / first-report (§16). One `start` month is enough
  for pace.
- Changing what a **report** stores (`PublisherActivity` hours/studies unchanged).
- Rewriting built-in role sync to read enrolments (§7.1 keeps `Member.type` as the synced cache).

## 3. Domain background & the plan/actual split

- **Pioneer types** (`PublisherType`): `PionnierPermanant`, `PionnierAuxiliaires`, `PionnierSpecial`,
  `Missionnaire`. `Normal` is not a pioneer. (Domain lens confirmed: permanent 50 h/mo → 600/yr and
  auxiliary 30 h/mo are current; special/missionary ~100 h/mo are branch-set placeholders, tunable via
  `PioneerGoal`.)
- **Two rhythms:** permanent/special/missionary carry an **annual** commitment (a continuous stint,
  which may span service-year boundaries); auxiliary **re-enrols month-to-month** with its own monthly
  goal, chosen per person.
- **Service year** = Sept→Aug; `month` is 0-indexed; `SY` spans `(year=SY, month≥8) OR (year=SY+1,
  month≤7)`.
- **Core idea — separate plan from actual:** *plan* = `PioneerEnrolment`; *actual* =
  `PublisherActivity`. Pace = actual vs plan.
- **Existing setting:** `CongregationSettingKey.AuxiliaryPioneerProfileActivated` gates whether the
  auxiliary option appears (`edit-publisher.tsx` loader → `hideAuxiliaryPioneer`). Enrolment UI must
  respect it.

## 4. Conventions consulted

- **`Member` is a guarded aggregate** (`db.member.*` writes only in `*.aggregate.ts`, checked by
  `pnpm test:aggregate-boundaries`). `member.aggregate.ts` is **323 / 350** lines — near the hard
  budget, so §7.1 first extracts a helper to make room.
- **Aggregate doctrine:** `PioneerEnrolment` carries invariants (no overlapping stints, `end ≥ start`,
  end-bounds paired, pioneer-type-only, auxiliary = single month) → its own
  `pioneer-enrolment.aggregate.ts`, added to `AGGREGATE_MODELS`.
- **Cross-aggregate orchestration** in a `*.workflow.ts` (enrol/close touches `PioneerEnrolment` +
  `Member.type`).
- **CQRS-lite:** writes in `*.aggregate.ts` / `*.workflow.ts`, reads in `*.queries.ts`.
- **RLS:** denormalised `congregationId` + `@@unique([id, congregationId])` + composite member FK +
  `tenant_isolation` policy (`CASE WHEN NULLIF(current_setting('app.congregation_id', true), '') IS
  NULL THEN true …`, never `OR`).
- **TDD** for the pure pace math + new service functions. **No React component tests.**
- **Barrels:** client-safe `index.ts`, server `index.server.ts`.
- **Migration:** `migrate diff` + hand-edited SQL + `migrate deploy`; copy `schema.prisma` to
  `unitae-platform`. Latest migration is `20260802000000_add_member_email` → ours timestamps after it.

## 5. Design overview

```
model/pioneer-enrolment.ts           (pure: period ∩ service-year → enrolled months + goal; helpers)
schemas/pioneer-enrolment.schema.ts  (type + period + optional goal)
server/pioneer-enrolment.aggregate.ts (open/close/update/delete; invariants; in AGGREGATE_MODELS)
server/pioneer-enrolment.workflow.ts (enrol/close → enrolment aggregate + member type sync)
server/pioneer-enrolment.queries.ts  (enrolments for a member / service year)
server/member.aggregate.ts           (+ small setPioneerType writer; syncs built-in roles)
server/pioneer-enrolment-backfill.server.ts (one-time: activity history → enrolments)
        ├─► pioneer-activity.queries.ts  — build the enrolled-month plan from enrolments (retire inference)
        ├─► model/pioneer-pace.ts        — consume the plan instead of inferring it
        ├─► edit-publisher.tsx           — publishing section: appointment + auxiliary enrolment
        └─► activity/new.tsx             — show the active enrolment goal as entry context
```

## 6. Data model — `app/database/schema.prisma`

```prisma
model PioneerEnrolment {
  id          Int           @id @default(autoincrement())
  member      Member        @relation(fields: [memberId, congregationId], references: [id, congregationId], onDelete: Cascade)
  memberId    Int
  type        PublisherType // a pioneer type, never Normal

  // Inclusive month range, 0-indexed month + calendar year. A continuous stint may span service-year
  // boundaries. endMonth/endYear are null together (ongoing) or set together (closed) — see the
  // paired check constraint below. Auxiliary enrolments are always a single month (start == end).
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

**Illegal-state prevention** — `endMonth`/`endYear` must be null together or set together, else a row
like `{endMonth: 10, endYear: null}` corrupts pace math. Enforce **both**:

- A DB **CHECK constraint** in the migration (defence in depth):
  ```sql
  ALTER TABLE "PioneerEnrolment" ADD CONSTRAINT end_bounds_paired
    CHECK (("endMonth" IS NULL) = ("endYear" IS NULL));
  ```
- An aggregate `_assertEndBoundsPaired()` invariant (application-level, testable).

**Migration** (`{timestamp}_add_pioneer_enrolment/migration.sql`): `migrate diff` for the table +
indexes + FKs (member composite `ON DELETE CASCADE`, congregation `ON DELETE RESTRICT`), then hand-add
the RLS block (copy from `20260801100000_add_pioneer_goal`) **and** the `end_bounds_paired` check.
Then run the backfill (§6.1) as a follow-up data migration. `migrate deploy && prisma generate`; copy
schema to `unitae-platform`.

### 6.1 Backfill (the inference logic, run once) — precise algorithm

Runs **per member, over their entire `PublisherActivity` history** (all years, not one service year —
so a continuous stint that predates the current window is captured whole):

1. **Dedup first.** Reduce to one row per `(memberId, month, year)`, latest `id` wins. *Then* sort
   ascending by `(year, month)`. (Dedup must precede grouping — a re-filed month that changed type
   must resolve to its final type before runs are formed.)
2. **Group maximal runs of the same type.** A run is broken by a month whose deduped row is a
   **different type** (any other pioneer type or `Normal`). A **no-row gap** inside a run does **not**
   break it (stays part of the stint → owed, matching today).
3. **Annual types (`Permanent`/`Special`/`Missionary`)** → one enrolment per run:
   `start` = first month of the run; `end` = last month of the run **iff the member is concluded**,
   else null (ongoing). Runs are **not** reset at the Sept boundary — a stint spanning years is one
   record (this is how continuity, formerly `enrolledSinceYearStart`, is preserved — see §7.4).
4. **Auxiliary** → one **single-month** enrolment per reported auxiliary month; `monthlyGoal = null`
   explicitly (historical per-person 15/30 is unrecoverable; queries fall back to the type default —
   §16). Auxiliary is never grouped into multi-month runs.
5. **Concluded rule** (must match `pioneer-activity.queries.ts` line 155 exactly):
   `concluded = !isPioneerType(standingType)` where `standingType = latestDedupedRow?.type ??
   member.type`. Only an annual member's *final* run gets a non-null `end` when concluded.

This is the exact stop/restart + concluded logic already unit-tested in `pioneer-pace.test.ts`; the
parity test (§14) runs it on real rows and asserts pace equivalence **before Phase 1 ships**.

## 7. Key integration decisions

### 7.1 `Member.type` ↔ enrolment  *(locked)*

`Member.type` **stays** the current-type cache that drives `syncBuiltInRoleAssignments`. Rewriting role
sync to read enrolments is out of scope. Rules:

- **Annual** enrolment sets `Member.type` on open (permanent/special/missionary) and reverts it to
  `Normal` when the last ongoing stint closes.
- **Auxiliary** enrolment does **NOT** touch `Member.type` — it stays `Normal`. (All three review
  lenses agreed: auxiliary is a transient monthly status, not a standing career type; flipping `type`
  monthly would churn role sync and misrepresent the member.) Auxiliary status is read from the
  enrolment record, never from `Member.type`. **Document this rule in CLAUDE.md.**
- Add `setPioneerType(db, memberId, congregationId, actorId, type)` to `member.aggregate.ts` (updates
  `type` + `syncBuiltInRoleAssignments`). **Budget:** first extract an existing helper
  (e.g. `_ensureMemberIsNotGroupResponsible` or `_loadMemberIdentity`) into a `member-*.server.ts`
  companion so the file drops well under 350 before `setPioneerType` is added.

### 7.2 `PublisherActivity.type` going forward  *(Proposed)*

Keep `type` on each report as recorded fact, but pace/goal logic reads **enrolments**. On a new report,
derive its `type` from the member's active enrolment for that month so the two cannot diverge. The
backfill reads historical row types once to seed enrolments.

### 7.3 Goal resolution  *(layering)*

```
monthlyGoal(member, month) = enrolment.monthlyGoal
                          ?? PioneerGoal(serviceYear, enrolment.type)   // existing resolver
                          ?? built-in default (pioneer-goals.constants.ts)
```

### 7.4 Retiring `enrolledSinceYearStart`  *(simplification)*

The inference-era flag ("was this member pioneering entering the service year, so their goal starts in
September even without a September report") becomes **unnecessary**. With explicit stints, the pace
query computes a service year's enrolled months by intersecting each enrolment's `[start, end]` (end
open = ongoing) with the SY month range. A continuing pioneer has a stint whose `start` is on/before
that September, so the intersection naturally begins in September — no flag, no prior-year query at
pace time. `notEnrolledMonths` and the concluded heuristic are likewise replaced: "not enrolled" = a
month outside every stint; "concluded" = the member has no stint intersecting *from* the current
expected month onward.

## 8. Server & code changes

**Aggregate** `server/pioneer-enrolment.aggregate.ts` (+ unit + integration tests, TDD-first). In
`AGGREGATE_MODELS`. Invariants (pure `_assert*`, 100 % branch coverage): pioneer-type-only;
`_assertEndBoundsPaired`; `end ≥ start`; **no overlapping stints** per member; auxiliary ⟹ single
month; `monthlyGoal > 0` when set. Functions `openEnrolment`, `closeEnrolment`, `updateEnrolment`,
`deleteEnrolment`, each `audit(...)` after the write.

**Workflow** `server/pioneer-enrolment.workflow.ts` — the route opens `withScopeFromContext`; the
workflow receives the tx client and makes both writes atomic (a role-sync throw rolls back the whole
enrolment):

```ts
export async function enrolPioneer(
  db: TransactionClient, memberId: number, congregationId: number, actorId: number,
  params: { type: PublisherType; startMonth: number; startYear: number; endMonth?: number; endYear?: number; monthlyGoal?: number },
): Promise<PioneerEnrolment> {
  const enrolment = await openEnrolment(db, memberId, congregationId, actorId, params)
  if (isAnnualPioneerType(params.type)) {
    await setPioneerType(db, memberId, congregationId, actorId, params.type) // NOT for auxiliary (§7.1)
  }
  return enrolment
}
// endPioneerEnrolment(...) closes the stint and, if it was the last ongoing annual stint, sets type = Normal.
```

**Reads** `server/pioneer-enrolment.queries.ts`: `getEnrolmentsForMember`,
`getEnrolmentsForServiceYear(serviceYear)`.

**Pace rewrite** `model/pioneer-pace.ts` + `server/pioneer-activity.queries.ts`: the roster/detail
query builds the enrolled-month plan (§7.4) + per-month goal from enrolments, actuals from
`PublisherActivity`; `computePioneerPace` consumes the plan. Delete `notEnrolledMonths`,
`enrolledSinceYearStart`, the concluded heuristic **only after** the parity test (§14) is green.

**Backfill** `server/pioneer-enrolment-backfill.server.ts` implements §6.1; invoked by the data
migration and (for old archives) by import (§11).

**Barrels:** `index.ts` (schema + pure helpers); `index.server.ts` (aggregate, workflow, queries,
backfill).

## 9. Permissions & audit

- Enrolment editing lives on the publisher edit page → gated on **`PublisherManager`** (existing).
  *(Proposed — confirm it doesn't warrant its own permission; lean: reuse `PublisherManager`.)*
- **Audit** (`audit.server.ts`, free String column, no migration): `PioneerEnrolled`,
  `PioneerEnrolmentEnded`, `PioneerEnrolmentUpdated`.

## 10. UI — publisher edit page (decided: no dedicated screen)

Extend the **publishing section** of `edit-publisher.tsx`, respecting `AuxiliaryPioneerProfileActivated`.
Two visually distinct subsections (they are structurally different — prevent cross-fill mistakes):

- **Annual appointment** (permanent / special / missionary): start month+year, optional end month+year.
  *(See §15.1 — pending your call on whether this **replaces** the raw type dropdown.)*
- **Monthly auxiliary enrolment**: month picker (current/next), goal (15 / 30 h), submit. Fine for the
  per-member cadence at typical volume; §15.4 tracks a bulk view if it chafes.
- When `hideAuxiliaryPioneer` is true, show a muted note ("*Auxiliary enrolment is disabled in
  congregation settings*", link to settings if permitted) rather than silently vanishing.
- Keep the component under the 400-line budget; extract `PioneerEnrolmentFields` if needed.

**Where enrolments are seen (report-pending visibility)** — the monitoring **pioneer roster**
(`/publishers/activity/pioneers`) is the surface. Once its query reads enrolments (§8), an enrolled
auxiliary with no report shows as *enrolled · report pending* (goal known, actual empty); an enrolled
annual pioneer shows their pace as today. No new screen — this closes the UX "where do I see who's
enrolled before reports land" gap by wiring the existing roster to enrolments.

**Activity entry context** — `activity/new.tsx` loads the active enrolment for the selected
member/month and shows the goal read-only ("*Enrolled as auxiliary: 30 h — reported 10 h so far*") so
entry can be validated against the plan in context.

## 11. Data transfer (export/import)

New tenant table → wire into the `.unitae` archive ([data-transfer.md](../data-transfer.md)):

- **Export** — add `PioneerEnrolment` to `ENTITY_FILES` + `buildExportSteps` **after `Member`**.
- **Import** — `importPioneerEnrolments` remaps `memberId` via `EntityIdMap`; enrolments are imported
  **verbatim** (current archives already contain them).
- **Version** — bump `ARCHIVE_VERSION`; extend `SUPPORTED_ARCHIVE_VERSIONS`.
- **Pre-enrolment archives** (older than the version bump) have activity rows but no enrolments →
  `import-congregation.server.ts` runs the §6.1 **backfill as a post-import step** on the imported
  activity history (so the imported congregation isn't left with empty pace). New-version archives skip
  it (they already have enrolments).

## 12. Anonymize / retention

Enrolments are membership facts, not third-party PII — like activity rows, **preserved** on anonymize
(an UPDATE) and removed only on member hard-delete (FK cascade). No `purge*` call. Confirm against
`member.aggregate.ts` `anonymize` + the retention cron.

## 13. Phasing

1. **Model + backfill + parity** — schema/migration (+ check constraint), aggregate + workflow +
   queries, goal resolution, backfill, **and the parity integration test (§14) green** as the gate.
2. **Pace on enrolments** — rewire the query + `pioneer-pace.ts` to read enrolments; keep the monitoring
   suite green; then delete the inference paths.
3. **Edit-page UI** — annual appointment + auxiliary enrolment; report `type` derived from the active
   enrolment; activity-entry goal context; roster shows report-pending.
4. **Data transfer** — export/import + version bump + old-archive post-import backfill.

## 14. Testing

- `pioneer-enrolment.aggregate.test.ts` (unit) — every invariant incl. `_assertEndBoundsPaired` and
  overlap rejection, TDD-first; + `*.integration.test.ts` (RLS round-trip, overlap rejection at the DB).
- `pioneer-enrolment.workflow.test.ts` — annual enrol sets `Member.type` + re-syncs roles; auxiliary
  enrol leaves `type = Normal`.
- **Backfill parity (integration, Phase-1 gate)** — seed a congregation with representative activity
  (continuing across the prior year, mid-year start, auxiliary, mid-year type switch, duplicate
  re-files, no-row gaps). Compute pace via the **old** inference on the rows, run the **backfill**, then
  compute pace via the **new** enrolment-driven path; assert the numbers match. Must pass before the
  inference code is deleted.
- `pioneer-pace.test.ts` — adapted to enrolment inputs, **same expected values** (parity harness).
- Guards: `test:service-test-coverage`, `test:aggregate-boundaries`, `test:boundaries`,
  `test:server-barrel-exports`. Routes/UI TDD-exempt.

## 15. Open questions

1. **Type dropdown vs enrolment controls (§10) — needs your call.** UX + domain both recommend
   **removing the raw pioneer-type dropdown** and making the annual appointment the only way to set a
   standing type (dropdown becomes read-only, derived from the active stint), so there is a single
   source of truth and no way to leave `Member.type` and enrolments inconsistent. *(Lean: remove it.
   Confirm before Phase 3.)*
2. **Enrolment permission (§9)** — reuse `PublisherManager` or add a dedicated permission?
   *(Lean: reuse.)*
3. **`bulkUpdateType` (`member.aggregate.ts`)** — how does a mass type change reconcile with existing
   enrolments? *(Lean: out of scope / manual for now; document.)*

## 16. Known simplifications (documented, not blockers)

- **No annual-renewal touchpoint.** Permanent pioneers are re-confirmed each Sept; the continuous-stint
  model doesn't record it. Fine for pace. Add a `renewedAt` only if renewal reporting is later needed.
- **One `start` month.** Appointment date / service-start / first-report are not distinguished.
- **Historical auxiliary goals unrecoverable.** Backfilled auxiliary enrolments use `monthlyGoal = null`
  (type default); managers set real goals going forward.
- **Enrolments carry no "why".** Stop-vs-paused-vs-left intent is not stored; the UI infers from
  restart-or-not.
