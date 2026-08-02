# Spec: Publishing Campaigns — first-class, configurable campaign mode

**Status:** Draft — design agreed with author; not yet implemented
**Author:** Nathanaël Cherrier
**Feature area:** `features/territories` (attributions, new `Campaign` aggregate) + a scheduled lifecycle job + territories-scoped UI
**Related:** [Architecture Conventions](../architecture-conventions.md), [Row-Level Security](../row-level-security.md), [Background Processing](../background-processing.md), [Permissions & Roles](../permissions-and-roles.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state behavior
> should be folded into `docs/product/territories.md` and this file archived.

## 1. Problem

Today a "campaign" is a single hardcoded value of an enum on the attribution:

```prisma
enum TerritoryAttributionKind { Default @map("default")  Phone @map("phones")  Campaign @map("campaign") }
model Attribution { type TerritoryAttributionKind @default(Default) ... }
```

`Attribution.type` conflates two unrelated ideas: the **method** of working a territory (door-to-door
vs phone) and whether the work belongs to a **campaign**. Because `Campaign` is one flat, undifferentiated
enum value, every campaign looks identical: no dates, no scope, no configuration, no way to say *how this
particular campaign should be run*. Congregations run campaigns differently each time (a memorial
invitation drive, a special convention invitation, a special-edition tract) and the tool cannot express
any of it.

Concretely, the publishing servant cannot:

- schedule a campaign in advance with a name and a start/end date;
- decide, per campaign, what happens to existing **regular** attributions when it starts (close them?
  pause them? pause and re-attribute the same publisher into the campaign?);
- decide what happens at the end (resume the paused regulars? close the campaign work automatically?);
- limit the campaign to a subset of territories (a **scope**) and change that scope while it runs;
- have the app **prevent regular attributions during a campaign** so two people don't unknowingly work
  the same ground.

The enum value is referenced ~268× across the territories feature (badges, filters, stats, PDF/Excel
export, duration resolution), so replacing it is a real migration, not a rename.

## 2. Goals / Non-goals

**Goals**

- Make **`Campaign` a first-class, congregation-scoped entity**: named, scheduled by dates, with its own
  configuration and an optional territory **scope**.
- Reduce `Attribution.type` to a pure **method** (`{ Default, Phone }`) and move "belongs to a campaign"
  onto a separate `campaignId` link — the two become **orthogonal layers**.
- Introduce a **campaign mode**: while a campaign is active, the attribution module behaves differently —
  **no new regular attributions can be created**; only campaign attributions are allowed.
- Introduce a **paused** state on attributions (distinct from open/closed) so regular work can be
  suspended for the duration of a campaign and resumed afterwards.
- Make the **start/end transitions configurable per campaign** via a set of **orthogonal options** (not a
  single mode enum), so the territory service composes the exact behavior it wants.
- Drive the whole lifecycle from the **campaign's dates** via a scheduled job — campaigns are planned in
  advance; each automatic action is individually toggleable so a congregation can opt to do it manually.
- Show a **banner on the territories pages** while a campaign is active.
- Migrate existing `type = Campaign` attributions into real `Campaign` records with **no history loss**.

**Non-goals**

- **Configurable/per-congregation attribution *methods*.** The author chose the campaign entity as the
  place flexibility lives; `type` stays `{ Default, Phone }`. A congregation-owned method table is
  explicitly *not* part of this work.
- **More than one active campaign at a time.** v1 enforces **at most one active campaign** per
  congregation (campaign mode is a single on/off). Concurrent, disjoint-scope campaigns are deferred.
- **Assisted "pause" prompts on manual campaign-attribution creation.** Coexistence is allowed and the
  transitions are automated; there is no interactive "this territory has an open regular attribution,
  end it?" dialog in v1.
- **Changing the meaning of returned/closed attributions** (`endDate`) or the rest-period model beyond
  what the enum migration forces.

## 3. Users & job-to-be-done

The **territory / publishing servant** (holds `Permission.TerritoriesManager`). Job: *plan a campaign in
advance, decide how it interacts with ongoing regular attributions, run it over a defined period and a
defined set of territories, and have the tool enforce the "one publisher per territory" and "no regular
attributions during the campaign" rules automatically.* Everyone else (viewers, publishers) sees the
banner and their campaign attributions; they never configure campaigns.

## 4. Current implementation background (verified)

- **Attribution model** (`app/database/schema.prisma`): `Attribution.type: TerritoryAttributionKind`,
  no campaign link, no pause. Lifecycle is binary: open (`endDate = null`) or returned (`endDate` set).
- **Overlap invariant** (`features/territories/server/attribution.aggregate.ts`): `attributionsOverlap`
  (pure, endpoint-inclusive) + `_assertNoActiveOverlap`, which blocks overlapping attributions for the
  **same `(publisherId, territoryId)` pair only**. It does **not** stop two *different* publishers holding
  the same territory — that is prevented solely by the availability picker below.
- **Availability picker** (`routes/attributions/territories.tsx:63`):
  `selectors.attributions = { none: { endDate: null } }` — a territory is offered only if it has **no
  open attribution at all**, regardless of publisher. This is the real "one publisher per territory"
  gate, and it is exactly what campaign coexistence must relax.
- **Duration resolution** (`_resolveDurationDays`): per-type defaults (phone 14d, campaign 60d,
  commerce/default 120d), each overridable by a `Setting` (`TerritorySettingKey.Attribution*DurationDays`,
  see `app/shared/types/territory-setting-key.ts`). `lateDate = startDate + durationDays`.
- **Enum consumers to migrate** (non-exhaustive): `AttributionKindBadge.tsx`, `attribution-filters.server.ts`
  (`applyTypeFilter`), `available-territories.server.ts` + `resting-territories.server.ts` (both branch on
  all three enum values and use per-type rest cutoffs), the stats family
  (`compute-coverage-by-territory-type`, `compute-duration-stats`, `aggregate-attribution-stats`, …),
  `s13-export`, the attribution `new`/`edit` routes and `attribution.schema.ts`.
- **Scheduled-job pattern** (to mirror): the retention cron —
  `features/settings/jobs/handle-retention-work.server.ts` iterates active congregations with
  `unscopedDb` then `withScope(cong.id, …)`; registered in `app/workers/worker.server.ts` via
  `retentionQueue.upsertJobScheduler('retention-daily', { pattern: '0 ${RETENTION_CRON_HOUR_UTC} * * *', tz:'UTC' }, …)`
  (idempotent across restarts). Queue names live in `app/shared/infra/queues.server.ts`.

## 5. Design overview

Two orthogonal layers on `Attribution` and a new configurable `Campaign` aggregate that owns a scheduled
lifecycle:

```
Attribution.type      = method            → { Default, Phone }           (how it's worked)
Attribution.campaignId = layer            → null = regular | set = campaign   (whether it's campaign work)
Attribution.pausedAt   = pause state      → null = active | set = suspended

Campaign (scheduled, one active at a time, optional scope)
  ├─ config: startRegularAction, startAutoReassign, endCloseCampaign, endRegularAction, durationDays?
  ├─ scope:  CampaignTerritory[]  (empty = all territories)
  └─ lifecycle job (date-driven): activate at startDate, end at endDate
```

Everything the author described falls out of composing the four config options; there is deliberately no
single "campaign mode" enum on the campaign.

### 5.1 Schema changes

**New `Campaign` model** (congregation-scoped):

```prisma
model Campaign {
  id        Int       @id @default(autoincrement())
  name      String
  notes     String    @default("")
  startDate DateTime                          // schedule; drives activation (local date, see §7)
  endDate   DateTime

  durationDays Int?                           // campaign-attribution duration override; null → setting/default

  // lifecycle options — orthogonal, set before start
  startRegularAction  CampaignRegularStartAction @default(Pause)   // Pause | Close | Leave
  startAutoReassign   Boolean                    @default(false)   // on Pause, also create a campaign attribution
  endCloseCampaign    Boolean                    @default(true)    // auto-close campaign attributions at end
  endRegularAction    CampaignRegularEndAction   @default(Resume)  // Resume | KeepPaused | Close

  // lifecycle bookkeeping — set by the job (idempotency + "is mode on?")
  activatedAt DateTime?
  endedAt     DateTime?

  attributions Attribution[]
  scope        CampaignTerritory[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  congregation   Congregation @relation(fields: [congregationId], references: [id])
  congregationId Int

  @@unique([id, congregationId])
  @@index([congregationId])
}

enum CampaignRegularStartAction { Pause @map("pause")  Close @map("close")  Leave @map("leave") }
enum CampaignRegularEndAction   { Resume @map("resume")  KeepPaused @map("keep-paused")  Close @map("close") }
```

**Explicit scope join** (implicit M2M join tables don't carry `congregationId`, so they can't be
RLS-scoped — use an explicit model, consistent with the rest of the schema):

```prisma
model CampaignTerritory {
  campaign   Campaign  @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  campaignId Int
  territory  Territory @relation(fields: [territoryId], references: [id], onDelete: Cascade)
  territoryId Int
  congregation   Congregation @relation(fields: [congregationId], references: [id])
  congregationId Int

  @@id([campaignId, territoryId])
  @@index([congregationId])
}
```

**`Attribution` additions:**

```prisma
model Attribution {
  // ... existing fields, with `type` now { Default, Phone } ...
  campaign   Campaign? @relation(fields: [campaignId], references: [id])
  campaignId Int?
  pausedAt   DateTime?     // paused: still open (endDate = null) but inactive; overdue clock frozen
}
```

**`TerritoryAttributionKind`** loses `Campaign` → `{ Default, Phone }`. New `TerritorySettingKey`:
`CampaignDefaultDurationDays` (fallback when `Campaign.durationDays` is null; keeps the legacy
`AttributionCampaignDurationDays` default of 60 as the seed value).

RLS policies: add `Campaign` and `CampaignTerritory` to the RLS migration using the mandatory
`CASE WHEN NULLIF(current_setting(...), '') IS NULL THEN true ELSE ... END` form (never `OR`).

### 5.2 Layers & the coexistence rules

Two enforcement points become **layer-aware**:

- **Overlap invariant** (`_assertNoActiveOverlap`): scope the conflict check by layer.
  - Two **regular** attributions (`campaignId = null`) of the same `(publisher, territory)` conflict —
    unchanged.
  - Two attributions **in the same campaign** of the same `(publisher, territory)` conflict.
  - **Regular ↔ campaign never conflict**, and attributions in *different* campaigns never conflict.
  - Implementation: add `campaignId` to the candidate query's `where` (matching the new attribution's
    layer) so `attributionsOverlap` only ever compares same-layer intervals. Paused regulars still count
    as open for regular-vs-regular overlap.
- **Availability picker** (`routes/attributions/territories.tsx`): the `none: { endDate: null }` selector
  becomes layer-aware.
  - Assigning a **regular** territory → block only on an open **regular** attribution
    (`none: { endDate: null, campaignId: null }`).
  - Assigning **for campaign X** → block only on an open attribution **in campaign X**
    (`none: { endDate: null, campaignId: X }`); regular attributions are ignored. This is the scenario-3
    "avoid two people on the same territory" rule — enforced *within* the campaign, allowed *across* layers.

### 5.3 Campaign mode (module-wide)

"Campaign mode is on" ⇔ a campaign exists with `activatedAt != null && endedAt == null` (derived, robust
even if the job is mid-run). While on, **regardless of scope**:

- **No regular attribution can be created** anywhere. The `assign` aggregate rejects `campaignId = null`
  with a `ConflictError('campaign_mode_active')`; the attribution `new` route/loader redirects or disables
  regular creation and steers the user into the active campaign.
- Campaign attributions may be created only **for the active campaign**.
- The **scope only limits the automatic transitions** (§5.4) — out-of-scope territories' existing regular
  attributions are left untouched by the job, but new regular attributions are still blocked module-wide.

A `getActiveCampaign(db, congregationId)` query (returns the single active campaign or `null`) is the one
source of truth the aggregate, the routes, and the banner all read.

### 5.4 Lifecycle transitions (configurable, date-driven)

Applied to **scoped territories** (or all, if scope empty). Each action is individually toggleable.

**At `startDate`** (campaign activates; stamp `activatedAt`):

- `startRegularAction`:
  - `Pause` (default) → set `pausedAt` on open regular attributions in scope; freeze their overdue clock.
  - `Close` → set `endDate` (return them) before the campaign begins.
  - `Leave` → leave them open and active (they coexist — scenario 1, "regular work also counts").
- `startAutoReassign` (only meaningful with `Pause`): additionally create a **campaign attribution** for
  the *same publisher* on the *same territory* (duration from `durationDays ?? CampaignDefaultDurationDays`).

**At `endDate`** (campaign ends; stamp `endedAt`):

- `endCloseCampaign` (default true) → set `endDate` on all still-open campaign attributions.
- `endRegularAction` (applies to attributions paused *by this campaign*):
  - `Resume` (default) → clear `pausedAt`; extend `lateDate` by the paused duration so no publisher is
    retroactively "late" for the campaign window.
  - `KeepPaused` → leave `pausedAt` set (the territory service handles them manually).
  - `Close` → set `endDate`.

**Mid-campaign scope edits** ("the scope might change during the campaign"): adding a territory to the
scope of an *already-active* campaign applies the start transition to that territory then; removing one
applies the end transition (governed by the same options). This keeps the scope and the world consistent.

**Pause semantics** (the new state): a paused attribution has `endDate = null` (still "held") but is
inactive — hidden from "my territories"/working lists (`my-territories.server.ts`), excluded from
overdue/late computations, and its `lateDate` is shifted on resume by the elapsed paused time. Paused
regulars still occupy the regular layer for overlap purposes (you can't create a second regular
attribution on a territory whose regular attribution is merely paused).

### 5.5 Scheduled job

A daily BullMQ scheduler mirroring the retention cron:

- New `campaignQueue` in `queues.server.ts`; handler
  `features/territories/jobs/handle-campaign-lifecycle-work.server.ts`; registered in
  `worker.server.ts` via `upsertJobScheduler('campaign-lifecycle-daily', { pattern: '0 H * * *', tz:'UTC' }, …)`
  under a new `CAMPAIGN_CRON_HOUR_UTC` constant.
- Sweep: `unscopedDb` list of active congregations → `withScope(cong.id, …)` → for each, activate
  campaigns whose `startDate <= now && activatedAt == null`, and end campaigns whose
  `endDate <= now && endedAt == null`. Transitions run inside the aggregate, are **idempotent** (guarded
  by `activatedAt`/`endedAt`), and per-congregation errors are logged and swallowed (one tenant's failure
  never stops the sweep).
- The transition logic lives in the campaign aggregate/workflow and is unit-tested directly; the job is a
  thin iterator. Because it is date-driven and idempotent, running it "late" (job was down) still
  converges to the correct state on the next tick.

### 5.6 UI surfaces

- **Campaign CRUD** (new, under territories management, `TerritoriesManager`-gated): list, create, edit,
  delete campaigns; the create/edit form exposes the four lifecycle options with their defaults and a
  **scope editor** (pick territories; editable while active).
- **Attribution `new`/`edit`**: `type` becomes a **method** radio (`Default`/`Phone`); when campaign mode
  is active the form only offers campaign assignment for the active campaign and explains why regular
  assignment is disabled.
- **Badge** (`AttributionKindBadge`): a campaign attribution shows the **campaign name** (megaphone icon);
  a regular one shows the phone/method badge as today.
- **Filters** (`attribution-filters.server.ts`): filter attributions by campaign (and by paused state);
  the old `type=campaign` filter option is replaced.
- **Territories-pages banner** (scoped to the territories section layout, **not** the global authenticated
  layout): shown whenever `getActiveCampaign` returns non-null, e.g. *« Campagne "Invitation Mémorial
  2026" en cours — les attributions régulières sont suspendues. »*. Reads the same derived state as the
  enforcement layer.
- **Stats/exports**: campaign becomes a **dimension** rather than a `type` value — coverage/duration stats
  and the S-13 / Excel exports treat campaign attributions separately from the door/phone method split.

## 6. Migration (existing `type = Campaign` data)

For each congregation that has any `Attribution` with `type = Campaign`:

1. Create one `Campaign` named **"Campagne"** spanning `min(startDate)`→`max(startDate|endDate)` of those
   rows, already ended (`activatedAt`/`endedAt` backfilled to those bounds) so it never re-triggers the job.
2. Repoint those attributions: set `campaignId` to the new campaign, reset `type` to `Default`.
3. Drop the `Campaign` value from `TerritoryAttributionKind`.

No history is lost. Update every enum consumer in the same change — in particular
`available-territories.server.ts` and `resting-territories.server.ts` (which branch on the three values
and use per-type rest cutoffs): campaign attributions now key off `campaignId`, not `type`, and use the
campaign rest cutoff. Executed as `prisma migrate diff --script` → hand-edited migration → `migrate deploy`
(never `migrate dev` in CI/scripts). Copy the resulting `schema.prisma` to the control-plane repo and
`prisma generate` there (the control plane never runs migrations).

## 7. Correctness notes

- **Local dates.** Campaign `startDate`/`endDate` are day-granular; reuse `parseLocalDate` (as `assign`
  does) so activation/closing honor the congregation timezone, not UTC midnight.
- **One active campaign.** The campaign aggregate rejects creating/activating a campaign whose active
  window would overlap another campaign's `[startDate, endDate]` for the same congregation
  (`ConflictError('campaign_overlap')`) — this is what makes "campaign mode" a single on/off.
- **`endDate >= startDate`** and non-empty `name` validated in the campaign schema (Conform + Zod).
- **Audit.** Every campaign mutation and every lifecycle transition threads `actorId` (a synthetic system
  actor for the cron, as retention does) and calls `audit()` after the write; new `AuditAction` entries:
  `CampaignCreated/Updated/Deleted`, `CampaignActivated/Ended`, `AttributionPaused/Resumed`.
- **Aggregate boundaries.** All `Campaign`/`CampaignTerritory`/`Attribution` writes live in
  `campaign.aggregate.ts` + the existing `attribution.aggregate.ts`; cross-aggregate orchestration
  (activate = pause regulars **and** maybe create campaign attributions) goes in a
  `*.workflow.ts`. Reads (`getActiveCampaign`, campaign lists, coverage) go in `*.queries.ts`.

## 8. Permissions

Reuses existing values — campaign management is gated by **`Permission.TerritoriesManager`**, viewing by
**`Permission.TerritoriesViewer`**. **No new permission.**

## 9. Data & code changes (summary)

**Schema:** `Campaign`, `CampaignTerritory`, two enums; `Attribution.campaignId`/`pausedAt`;
`TerritoryAttributionKind` → `{ Default, Phone }`; new setting key; RLS for the two new tables; data
migration (§6).

**Create:** `features/territories/server/campaign.aggregate.ts` (+test),
`campaign.queries.ts` (+test, incl. `getActiveCampaign`), `campaign-lifecycle.workflow.ts` (+test),
`schemas/campaign.schema.ts`, `jobs/handle-campaign-lifecycle-work.server.ts`,
`server/campaign-queue.server.ts`, campaign CRUD routes + `CampaignForm`/scope-editor UI, the
territories-pages banner component. New i18n keys in `app/i18n/messages/{fr,en}.json` (French is source of
truth): campaign labels, the four options + defaults, banner copy, `campaign_mode_active`/`campaign_overlap`
errors, paused-state labels.

**Modify:** `attribution.aggregate.ts` (layer-aware overlap, campaign-mode guard, duration via campaign),
`attribution.schema.ts` + `new`/`edit` routes (method radio, campaign-mode handling),
`attribution-filters.server.ts`, `AttributionKindBadge.tsx`, `available-territories.server.ts`,
`resting-territories.server.ts`, `my-territories.server.ts` (hide paused), the stats family + `s13-export`,
`queues.server.ts`, `worker.server.ts`, `shared/constants/limits.ts` (`CAMPAIGN_CRON_HOUR_UTC`),
`territory-setting-key.ts`, both features' `index.ts`/`index.server.ts` barrels. Copy `schema.prisma` +
`prisma generate` in the control-plane repo.

## 10. Phasing

1. **Schema + migration + aggregate core** — `Campaign`/`CampaignTerritory`, `campaignId`/`pausedAt`, the
   enum migration + all enum consumers, `campaign.aggregate.ts` (CRUD + one-active invariant),
   `getActiveCampaign`, layer-aware overlap + duration. **TDD, failing tests first.**
2. **Campaign-mode enforcement** — block regular creation while active, layer-aware availability picker,
   pause semantics across "my territories"/working/overdue lists.
3. **Lifecycle job** — the scheduled sweep + `campaign-lifecycle.workflow.ts` honoring the four option
   toggles; idempotent activate/end; mid-campaign scope edits.
4. **UI** — campaign CRUD + options + scope editor, attribution-form wiring, badge/filters, the
   territories-pages banner.
5. **Stats + exports** — campaign as a dimension in coverage/duration stats and S-13/Excel.

## 11. Testing

- **Aggregate + workflow + queries:** failing test first, watch fail, implement (per project TDD rule).
  Cover: layer-scoped overlap (regular↔campaign coexist; same-campaign conflict), one-active invariant,
  each `startRegularAction`/`endRegularAction` branch, `startAutoReassign`, `endCloseCampaign`, pause
  clock-freeze/resume `lateDate` shift, campaign-mode creation guard, scoped vs unscoped transitions,
  mid-campaign scope add/remove. Aim for 100% branch coverage of the `_assert*` helpers.
- **Migration:** integration test on a seeded congregation with legacy `type = Campaign` rows — assert the
  synthetic campaign, repointed `campaignId`, `type = Default`, and unchanged counts.
- **Job:** unit-test the sweep against fixed clocks (idempotent re-runs; per-congregation error isolation).
  `Date.now()`-sensitive logic takes an injected `now` (as retention does).
- **No React component tests** (project convention) — extract form/banner logic into pure functions and
  test those; the banner's "is mode on" derivation is a pure fn over `getActiveCampaign`.
- Gates after each slice: `pnpm test:unit && pnpm test:lint && pnpm test:typecheck`;
  `pnpm test:service-test-coverage`; `pnpm test:aggregate-boundaries`; `pnpm test:boundaries` +
  `pnpm test:server-barrel-exports`; `pnpm test:integration` for the migration + RLS scoping.

## 12. Open questions

1. **Scoped-campaign banner copy** — should the banner name the affected scope ("… sur 12 territoires")
   or stay generic? Lean: generic in v1.
2. **`CAMPAIGN_CRON_HOUR_UTC` default** — reuse the retention hour (03:00 UTC) or a distinct hour to avoid
   two heavy sweeps colliding? Lean: distinct (e.g. 02:00) so campaign transitions land before retention.
3. **Deleting an active campaign** — forbid while `activatedAt != null && endedAt == null` (force "end"
   first), or allow with a cascading revert? Lean: forbid; require ending it first.
4. **`Leave` + `startAutoReassign`** — the combination is meaningless (nothing paused to reassign);
   validate it away in the schema, or silently ignore? Lean: validate away.
