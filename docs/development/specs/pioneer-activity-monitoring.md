# Spec: Pioneer Activity Monitoring

**Status:** Implemented (PR #326) — see the reconciliation note below for shipped deviations
**Author:** Nathanaël Cherrier
**Feature area:** `features/publishers` (activity)
**Related:** [Publishers (product)](../../product/publishers.md), [Architecture Conventions](../architecture-conventions.md)

> This is a proposal, not documentation of current behavior. Once built, the steady-state
> behavior should be folded into `docs/product/publishers.md` and this file archived.

> **Revision note.** This spec was reviewed by three lenses (UX, UI, engineering). Their findings
> corrected two factual errors (Recharts already ships; the current activity page is *not*
> group-scoped), hardened the pace/risk math against real data mess (duplicate rows, mid-year type
> switches, August divide-by-zero, timezone), and simplified the UX (plain language, read-only
> scope). The sections below reflect those corrections.

> **Implementation reconciliation (as shipped in PR #326).** The sections below are the pre-build
> design; the following intentional deviations were made during implementation/review and a
> spec-vs-code audit. Where a section conflicts with this list, this list wins.
>
> **Behaviour changes (agreed):**
> - **Risk escalation** — an *overdue* report raises the risk band one step (green→amber, amber→red),
>   capped so a positive surplus stays green. §6's "risk from actuals only" is superseded by this so a
>   non-reporter is never scored "on track".
> - **No "awaiting" chip** — the `awaiting` reporting state is computed (and used by the escalation)
>   but not displayed; only "overdue" (Rapport en retard) shows. §6's reporting-status chip is
>   overdue-only.
> - **Studies** — the detail section shows a studies total + secondary sparkline (§5.2 honoured).
> - **Start-of-year guard** — implemented **per row** (`elapsedEnrolled === 0` → "données
>   insuffisantes") on both roster and detail, not as the single global banner §6 implied.
>
> **UI as-built (spec text is aspirational here):**
> - Roster is a **~5-column** table (name + group/enrolled sub-line, type, status, hours "x / y h",
>   trend); "last report" is not its own column. Group name, "≈ X h/mois pour finir", and filters
>   (search / risk / type / group) are present.
> - Distribution hero shows segment **counts in a legend below** the bar (not inside each segment).
> - Pace chart plots a cumulative-**hours** line with a flat **monthly-rate** `ReferenceLine` (not a
>   cumulative-vs-target ramp).
> - **Concluded** pioneers are sorted last **inline** in the annual table (badged "Terminé", excluded
>   from counts) rather than in a separate "terminé (mois X)" block.
>
> **Deferred (not built):** the Phase-2 goal-editing UI; the regular-publisher check-strip on the
> detail page; retiring the old `BarChart3` icon button on the publishers-list header; the
> control-plane `schema.prisma` copy. `getPioneerActivitySummary` relies on RLS for tenant scoping
> (its `congregationId` param is unused), unlike `getPioneerActivityForMember` which also scopes by it.

## 1. Problem

`/publishers/activity` today is a **congregation-wide, single-month data-entry and inactivity
tracker**: one row per publisher, one month at a time, columns Hours / Studies / Pioneer /
Observations. Its only built-in intelligence is the *6-missed-reports → inactive* rule.

It cannot answer the question a service overseer actually asks about pioneers:

> "Is this pioneer on pace to make their service-year goal, and if not, who do I help first?"

It has **no goal to measure against** and **no time dimension** — pioneer monitoring is inherently
*longitudinal* (across the Sept–Aug service year) and *goal-relative*, while the current page is a
single-month snapshot. Since regular publishers stopped reporting hours, the Hours column is only
meaningful for the ~5–15 pioneers, who are buried inside a 100+ row congregation table.

## 2. Goals / Non-goals

**Goals**

- Give the **service overseer** a proactive, at-a-glance view of which pioneers are off-pace,
  sorted by risk.
- Measure each pioneer against a **prorated** service-year goal (partial-year enrollment → partial
  goal).
- Surface the same per-pioneer detail (pace, trend, projection, "hours needed to finish") on the
  existing **publisher detail page**, so one person = one page.
- Make goals **editable per service year** (org requirements change over time).
- Be **legible and trustworthy** to a non-analyst church volunteer, and usable **on a phone**.

**Non-goals**

- **Shepherding / follow-up workflow** — no notes, "last contacted", snooze, or follow-up state.
  This feature is a **read-only diagnostic**; that memory is tracked elsewhere. *(Decision: out of
  scope.)*
- Self-service report submission by publishers (reports are still entered by managers / group
  responsibles — unchanged).
- Per-member goal overrides (e.g. health-reduced goals). Goals are per `(service year, type)` only.
- Changing what `PublisherActivity` stores (no new hours/placements/RV columns).
- Replacing the month-by-month activity entry page — this is an addition, not a rewrite.

## 3. Users & job-to-be-done

Primary user: **service overseer / coordinator**. Job: spot at-risk pioneers early, then drill into
one to understand the shape of the shortfall. **Visibility is congregation-wide**, gated on
`Permission.ActivityViewer` — the same access model as today's activity view page (which is *not*
group-scoped; only the activity *entry* form scopes group responsibles). No new scoping filter.

## 4. Domain background

- **Pioneer types** (`PublisherType`): `PionnierPermanant` (regular), `PionnierAuxiliaires`
  (auxiliary), `PionnierSpecial` (special), `Missionnaire` (missionary). `Normal` publishers do not
  report hours and are out of scope for pace tracking.
- **Two rhythms:**
  - *Regular / Special / Missionary* carry an **annual** commitment across the service year.
  - *Auxiliary* pioneers **re-enrol month-to-month**; their goal is inherently monthly.
- **Service year** = Sept→Aug. The reusable boundary constant that exists today is
  `FIRST_MONTH_OF_THEOCRATIC_YEAR = 8` (0-indexed Sept) in
  `list-theocratic-years-with-activity.server.ts`. Note: `THEOCRATIC_YEAR_MONTHS` is *not* a shared
  constant — it is a file-local `const` in `generate-publishers-yearly-activity-xlsx.server.ts`; if
  the roster needs the ordered month list, extract that helper into a shared location first.
- **Month convention.** `PublisherActivity.month` is **0-indexed** (`Date.getMonth`), `year` is the
  **calendar** year. So a service year `SY` maps to rows where
  `(year = SY AND month >= 8) OR (year = SY+1 AND month <= 7)`. This two-branch predicate — not a
  simple range — is the single most error-prone line in the query; pin it down and mirror it in the
  integration test.
- **Enrollment is already in the data.** `PublisherActivity.type` is a per-month snapshot, so the
  months a member was a given pioneer type are derivable from their rows — no stored enrollment date
  is needed, and proration falls out of counting those months.
- **Duplicate rows exist.** There is **no** unique constraint on `(publisherId, month, year)` — only
  an index. A month can have several rows (corrections/re-files). The codebase's de-facto rule is
  **latest `id` wins per month** (`get-publisher-with-activities.server.ts` orders `id desc` and
  consumes `activities[0]`). All aggregation here must dedup to one row per month *before* summing,
  or a re-filed month double-counts.
- **Three month states** (must be distinguished, not conflated):
  1. **No row** for that month → *not enrolled* that month (contributes nothing).
  2. **Row with pioneer type, `hours ≥ 0`** → *enrolled and reported* (a genuine 0-hour month
     counts as 0 toward pace, and is different from #1).
  3. **`currentExpectedMonth` with no row** → *unreported / overdue* (see §6 reporting status).
- **Timezone.** `Congregation.timezone` (default `Europe/Paris`) exists but today's `new Date()`
  logic ignores it. "What is the current month" must be computed in the congregation's timezone.

## 5. Design overview

Two surfaces, **one shared engine** (the summary query + the pure pace/risk functions), shipped
**together** (see §10). No duplicated logic.

```
getPioneerActivitySummary(db, congregationId, serviceYear, now)   ← read query (raw aggregates)
        │  (dedup latest-id-wins; composes model fns — does NOT re-implement pace/risk)
        ├─► pioneer-pace.ts  (pure fns: targetToDate, paceDelta, riskBucket, reportingStatus, …)
        │
        ├─► /publishers/activity/pioneers          (dedicated roster — the overseer cockpit)
        └─► /publishers/:publisherId/view#activity  (activity section on the detail page)
```

### 5.1 Dedicated monitoring view — `/publishers/activity/pioneers`

Landing surface for the overseer. Service-year selector (not a month stepper — the unit is the
year). Filters: type · risk · group.

**Summary hero.** Lead with a single **segmented distribution bar** (green/amber/red proportional,
each segment carrying its count + the F2 icon) so the at-risk count *and* the roster's share are one
mark — not four equal cards that bury the number the overseer opened the page for. Pair it with
**one** collective-hours tile using the existing `Progress` component (YTD vs prorated target as a
filled bar). Keep the `font-black text-4xl` headline treatment from `PublisherActivityStats` for the
at-risk count.

**Two sections**, separated by a `Separator`, each with an `<h2>` (display face) + a count badge
(e.g. "Pionniers permanents · 7"). **A section with zero members is hidden**, not rendered empty.

**A. Regular / Special / Missionary** — annual cumulative pace, sorted most-at-risk first. Trimmed
to ~5 columns (8 is too dense, and the current table `max-sm:hidden`s exactly the columns that carry
the signal):

| Column | Content |
|---|---|
| Pioneer | name (left-aligned, `truncate`+`title`) with **Enrolled** as a muted secondary line (`4 mois` / `sept.→`) |
| Type | `Badge` (PP / PS / M) wrapped in a `Tooltip` with the full French label |
| Statut | plain-language pace ("22 h de retard" / "18 h d'avance" / "dans les temps") as a risk `Badge` — variant + **icon + text label** (colorblind-safe, see §UI). Hover/expand shows the derivation: *"4 mois × 50 h = 200 h attendues · 178 h déclarées · 22 h de retard."* |
| Heures | merged **"312 / 350 h"** (YTD / target-to-date), reusing the app's "value / value" idiom |
| Tendance | inline SVG sparkline **with the rate reference line drawn in**, plus a text direction word ("en hausse / stable / en baisse") as the accessible alternative |
| *(actions)* | consistent with `PublisherActivityRow` |

- **Red-bucket rows get the existing row-tint** (`bg-destructive/10 dark:bg-destructive/5`) so the
  roster reads as a sibling of the current activity page.
- **Reporting status is a separate, neutral signal** from pace (see §6) — an "en attente" / "en
  retard de rapport" chip, never folded into the pace color. A pioneer with a surplus who simply
  hasn't filed yet stays green on pace.
- **Concluded pioneers** (latest snapshot no longer a pioneer type) are shown separately as
  *terminé (mois X)* with their final standing — **removed from the risk queue and the at-risk
  count**, never flagged red forever.
- **Mobile: stacked card list** (there are only ~5–15 pioneers, so no need to preserve a table).
  Each card leads with name → plain-language status badge → YTD/target → sparkline. The risk verdict
  must survive on a phone.

**B. Auxiliary pioneers** — **informational**, month-by-month, *not* an annual risk queue. Kept out
of the risk-sorted summary counts, visually lighter, token-neutral (no destructive tint). Per row:
this-month cell "22 h" with the standard 30h shown only as a **light labelled reference** ("cible
standard 30 h"), and a per-month hours strip. **No binary met / not-met verdict is rendered** — see
the auxiliary-goal note below.

> **Why no verdict.** The reduced auxiliary goal (15 h) is an **individual, per-month election**, not
> a congregation-wide per-month rate — two auxiliaries in the same month can carry different goals.
> We therefore cannot derive a given auxiliary's target from `(serviceYear, type)`, and marking a
> 15h-electing publisher "not met" against 30 h would be wrong. Capturing the true goal is also a
> *timing* problem: the goal is set at the **start** of the month (sign-up), while hours are filed at
> the **end** of the month by the elders — so it cannot live on the activity row without inventing a
> 0-hour placeholder row weeks early. The correct home is a separate **auxiliary pioneer enrollment**
> record (start-of-month sign-up capturing publisher + month + goal), which is its own future feature
> (§ Future work). Until it exists, this section stays informational: show hours, let the overseer —
> who knows who signed up for what — interpret.

### 5.2 Publisher detail activity section — `publisher.tsx`

A **sectioned** (not tabbed) block with an `#activity` anchor — simpler, robust as a deep-link
target, print-friendly. *(Resolves the earlier open question.)* **Type-aware:**

- **Pioneer** → a Recharts `ComposedChart` in a `Card`: `<Bar>` monthly hours, `<Line>`
  cumulative-vs-target, a dashed `<ReferenceLine>` for the prorated rate (so the target reads as a
  reference, not a series). Below it the key numbers, with **"needs X h/mo to finish"** promoted to a
  `font-black text-4xl` callout — paired with a **projection** ("au rythme récent : ~N h, objectif
  600") and a **"objectif difficilement atteignable"** flag when the required rate exceeds the type's
  own monthly rate by a margin (the required-rate alone is most alarming exactly when least
  achievable; the projection is the more useful, less blame-y cue). Surplus/deficit as a risk badge.
  Studies as a secondary trend. The member's report list with existing add/edit links.
- **Regular publisher** → **no chart** (there's no magnitude, only preached Y/N). A compact 12-month
  check/dot strip (`CadenceStrip`-style) + the inactivity `Badge` + studies trend.

The pioneer variant is the *same component* the roster links to — written once, rendered here.

### 5.3 Navigation & information architecture

Without deliberate placement the roster lands three levels deep behind an unlabeled icon button —
the worst possible discoverability for the app's most *proactive* feature. Decisions:

- **Sidebar entry.** Add a labeled **"Activité"** item to the *Assemblée* group in `AppSidebar.tsx`,
  gated on `canViewActivity` (`ActivityViewer` — already declared in `AppSidebarPermissions` but not
  yet rendered). Links to `/publishers/activity`. This replaces the current hidden `BarChart3` icon
  button on the publishers-list header as the primary entry (the icon button can be retired).
- **In-page tabs.** The activity area gets a segmented sub-nav — **"Proclamateurs"**
  (`/publishers/activity`) and **"Pionniers"** (`/publishers/activity/pioneers`) — since they are one
  dataset sliced two ways. Cleanest as a nested layout route `activity/_layout.tsx` that renders the
  tabs + `<Outlet/>`, wrapping both the existing list and the new roster.
- **Dashboard widget.** Add an at-risk-pioneers widget to `features/dashboard/` for `ActivityViewer`
  users: the count of red-bucket pioneers for the current service year, linking to the roster. This
  surfaces the signal on the homepage the overseer already lands on — matching the feature's
  proactive intent better than any menu placement. Uses the documented dashboard cross-feature
  aggregator (it may import `getPioneerActivitySummary` from `~/features/publishers/index.server`).
- **Command palette.** Register the roster (and the activity area) in `CommandPalette.tsx` (⌘K).
- **Detail page.** The activity section keeps its `#activity` anchor; the roster deep-links to it. No
  other detail-page nav change.

New i18n messages: `sidebar_activity`, the two tab labels, and the dashboard-widget strings.

## 6. Pace & risk model

All of the below are **pure functions** in `features/publishers/model/pioneer-pace.ts`
(client/server-safe, no `.server` suffix), unit-tested in isolation (TDD-first). The summary query
**composes** these — it must not re-implement them.

**Inputs, defined precisely.** Service-year months are ordered Sept…Aug. `now` is passed in
(computed in the congregation's timezone) so the functions stay deterministic and testable.

```
rate                = resolved monthly goal for (serviceYear, memberRosterType)   // §7
memberRosterType    = type of the member's LATEST activity row in the service year (latest id wins)
asOf                = latest service-year month that has a reported row
currentExpectedMonth = most recent COMPLETED service-year month as of `now` (tz-aware),
                       independent of whether data exists — this is what makes a month "missing"
```

Per month, dedup to one row (**latest `id` wins**) before anything else. A month whose deduped row
carries a *different* pioneer type is **excluded** from both `elapsedEnrolled` and `actualToDate`
(so a mid-year Normal→auxiliary→regular switch prorates against only the matching-type months, and
the member appears in exactly one section via `memberRosterType`).

**Regular / Special / Missionary**

```
elapsedEnrolled   = service-year months ≤ asOf whose deduped row type = memberRosterType
targetToDate      = rate × |elapsedEnrolled|
actualToDate      = Σ hours over elapsedEnrolled            (a reported 0-hour month counts as 0)
paceDelta         = actualToDate − targetToDate
remainingMonths   = months from currentExpectedMonth+1 through Aug (assumed still enrolled)
fullYearTarget    = rate × (|elapsedEnrolled| + remainingMonths)          // prorated to actual start
requiredAvgToFinish = remainingMonths === 0
                        ? 0                                                 // guard: no divide-by-zero
                        : max(0, (fullYearTarget − actualToDate) / remainingMonths)
recentAvg         = mean hours over the last ≤3 reported enrolled months
projectedYearEnd  = actualToDate + recentAvg × remainingMonths
outOfReach        = requiredAvgToFinish > rate × OUT_OF_REACH_FACTOR        // tunable, e.g. 1.5
```

**Pace risk** — computed from **actuals only** (a surplus can never be red):

| Bucket | Condition |
|---|---|
| 🔴 red | `paceDelta < −rate` (more than one month behind) |
| 🟡 amber | `−rate ≤ paceDelta < 0` (under a month behind) |
| 🟢 green | `paceDelta ≥ 0` (on or ahead of pace) |

**Reporting status** — a *separate* signal, never merged into pace color:

| Status | Condition |
|---|---|
| filed | `currentExpectedMonth` has a deduped pioneer row |
| awaiting | `currentExpectedMonth` unreported but within the reporting grace window (reports for month M land in early M+1) — **neutral**, not risk |
| overdue | `currentExpectedMonth` unreported past the grace window — surfaced as its own chip; may raise sort priority, but does **not** override a green pace surplus |

**Start-of-service-year guard.** With `|elapsedEnrolled| = 0`, `targetToDate = 0` and pace is
meaningless (everyone trivially green, or — under a naive missing-month rule — everyone red). The UI
must show an explicit *"données insuffisantes pour évaluer le rythme"* state until ≥1 month is
reported, rather than a fallthrough.

**Concluded** — if `memberRosterType` is no longer a pioneer type as of the latest month, the member
is *concluded*: stop accruing target, drop from the risk queue, show final standing.

**Auxiliary** — simpler, per enrolled month, informational (no annual commitment to fall behind on):

```
metMonths  = enrolled auxiliary months where hours ≥ rate
thisMonth  = current-month hours vs rate  (met ✓ / not met) — informational only
```

## 7. Goal configuration

**Resolution:** built-in default by type **→ overridden by an editable per-(service year, type)
value.** Mirrors the app's "null = fall back to default" philosophy (cf. `LimitService`). Stored
internally as a **monthly rate** so proration (§6) needs no special-casing; annual figures are shown
in the UI as `rate × 12` for full-year pioneers. Resolution uses **`findFirst`** (compound key —
same class as the `Setting`/`EventKind` gotcha), never `findUnique`.

**Seed defaults** (editable per year):

| Type | Monthly rate | Note |
|---|---|---|
| Regular pioneer | 50 h/mo (→ 600/yr) | current standard |
| Auxiliary pioneer | 30 h/mo | |
| Special pioneer | 100 h/mo | *placeholder — branch-set, editable per year* |
| Missionary | 100 h/mo | *placeholder — branch-set, editable per year* |

**Storage** — a new congregation-scoped table, aligned with repo conventions (reverse relation on
`Congregation`, the `[id, congregationId]` defence-in-depth composite that every tenant model
carries, timestamps, index):

```prisma
model PioneerGoal {
  id           Int           @id @default(autoincrement())
  serviceYear  Int           // theocratic year start (calendar year of the Sept)
  type         PublisherType
  monthlyHours Int
  congregation   Congregation @relation(fields: [congregationId], references: [id])
  congregationId Int
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  @@unique([serviceYear, type, congregationId])
  @@unique([id, congregationId])
  @@index([congregationId, serviceYear])
}
```

(Plus `pioneerGoals PioneerGoal[]` on the `Congregation` model, or Prisma won't compile.) A missing
row means "use the built-in default constant" — no per-congregation seed row needed. RLS policy
follows the standard `CASE WHEN NULLIF(current_setting(...), '') IS NULL …` pattern. (Alternative
considered: a JSON `Setting`. Rejected — a table is queryable, auditable, and matches the
compound-key convention.)

## 8. Data & code changes

**Schema**

- Add `PioneerGoal` model + the `Congregation` reverse relation + migration (main app owns the
  schema; use `migrate diff` + `migrate deploy`, not `migrate dev`). Copy `schema.prisma` to the
  control plane and regenerate.
- Add **`AuditAction.PioneerGoalUpdated`** for the phase-2 write.
- **No change** to `PublisherActivity` / `Member`. The roster query filters congregation-wide by
  `type` over the two-year service-year predicate; given tiny data volume (~5–15 pioneers × 12
  months per tenant) the existing `[publisherId, month, year]` index is adequate — stated explicitly
  rather than left implied.

**Server (`features/publishers/server/`)**

- `pioneer-activity.queries.ts` → `getPioneerActivitySummary(db, congregationId, serviceYear, now)`:
  fetch the service-year pioneer rows (the `(year=SY AND month>=8) OR (year=SY+1 AND month<=7)`
  predicate), **dedup latest-id-wins per (publisher, month)** in memory (a plain `groupBy _sum`
  would double-count duplicates), return **raw aggregates** (per-month deduped hours, per-month type,
  resolved rate) and **compose** the `model/` pure functions for target/pace/risk/status. Read-only.
- `pioneer-goals.queries.ts` → resolve `(serviceYear, type)` → rate with default fallback
  (`findFirst`). The summary query calls this; neither file both reads and writes.
- Phase 2: goal writes via `pioneer-goals-mutations.server.ts` (or `*.aggregate.ts`) with
  `congregationId: 0 as number` on create + `audit()`. **Note:** `PioneerGoal` is a new model, so
  `pnpm test:aggregate-boundaries` (allowlist = Member/Attribution/ProgrammeAssignment) won't force
  the aggregate naming — it's a stylistic choice here, not enforced.

**Model (`features/publishers/model/`)**

- `pioneer-pace.ts` → the pure pace/risk/status functions from §6 (+ co-located
  `pioneer-pace.test.ts`, TDD-first).
- Default-goal constants (e.g. `pioneer-goals.constants.ts`, or on `shared/types/publisher-type.ts`).

**Routes / UI**

- Route `features/publishers/routes/activity/pioneers.tsx` + entry in `app/routes.ts`.
- `ui/PioneerRoster.tsx` (two sections, distribution-bar hero, mobile cards),
  `ui/PioneerPaceChart.tsx` (**Recharts `ComposedChart`** — the app already ships Recharts 3.9.2 and
  uses it in `MonthlyCoverageChart.tsx` etc.; reuse that axis/grid/tooltip config, `var(--color-chart-N)`
  tokens, `ResponsiveContainer`; add `aria-label` + a visually-hidden data table), `ui/Sparkline.tsx`
  (the **one** justified hand-rolled inline SVG — a single `<polyline>`, `aria-hidden`, with the rate
  reference line and a text trend word beside it), `ui/PioneerActivitySection.tsx` (the shared detail
  component), risk `Badge` helpers.
- Wire `PioneerActivitySection` into `routes/publishers/publisher.tsx`.
- **Navigation (§5.3):** add the "Activité" sidebar item in `app/shared/ui/AppSidebar.tsx` (wire the
  already-declared `canViewActivity`); add a nested `activity/_layout.tsx` rendering the
  Proclamateurs/Pionniers tabs + `<Outlet/>`; register the roster in `app/shared/ui/CommandPalette.tsx`;
  retire the `BarChart3` icon-button entry on the publishers-list header.
- **Dashboard (§5.3):** an at-risk-pioneers widget in `features/dashboard/` (imports
  `getPioneerActivitySummary` via `~/features/publishers/index.server`), gated on `ActivityViewer`.

**Barrels:** export client-safe pieces from `features/publishers/index.ts`, server pieces from
`index.server.ts` (split enforced by `pnpm test:server-barrel-exports`).

**No new dependency** — the earlier "avoid a chart library" rationale was mistaken; Recharts is
already present.

## 9. Permissions

- View (roster + detail section): `Permission.ActivityViewer`, **congregation-wide** (matches
  today's activity view page; no group-scoping).
- Edit goals (phase 2): a **new** `Permission.PioneerGoalManager` (`'pioneer-goal-manager'`), added
  to the enum in `app/shared/types/permission.ts` (follows the `<Domain>Manager` convention). It is
  **not** bundled into any built-in role by default — admins grant it to roles as they see fit. Keep
  it distinct from `ActivityViewer`/`ActivityManager`: viewing pace and entering monthly reports are
  separate concerns from setting the year's goal figures.

## 10. Phasing

1. **Core + both surfaces + navigation** — `PioneerGoal` schema + defaults,
   `getPioneerActivitySummary`, `pioneer-pace.ts`, the **roster** (both sections, distribution hero,
   mobile cards) **and** the **publisher-detail activity section**, shipped together so roster rows
   deep-link into a section that actually exists. Plus the navigation work (§5.3): the "Activité"
   sidebar entry, the Proclamateurs/Pionniers tabs, the ⌘K entry, and the dashboard at-risk widget —
   without these the roster is undiscoverable. Defaults only (no goal-editing UI).
   *(Merged former phases 1+2 per review.)*
2. **Goal editing** — per-year override UI in settings + `PioneerGoalUpdated` audit.

Shepherding/follow-up workflow is **out of scope** (§2).

### Future work — Auxiliary pioneer enrollment

A separate feature (not part of this spec's phases): a **start-of-month sign-up** capturing
`(publisher, month, goal)` where goal ∈ {30 h, 15 h}, entered when a publisher declares auxiliary
pioneering — distinct from the end-of-month activity report and from `Member.type`. Once it exists it
feeds reliable per-person goals into §5.1 B (enabling a real met/not-met verdict and a "signed up but
short at month-end" flag). Deliberately deferred: it has a different actor, a different time of month,
and its own workflow/permission — bolting it onto the activity-entry form would force a 0-hour
placeholder row weeks before hours are known.

## 11. Testing

- `pioneer-pace.ts`: unit tests, TDD-first, full branch coverage of the risk/proration/status logic.
  The matrix **must** include: August (`remainingMonths = 0`, no divide-by-zero); duplicate rows for
  one month (latest-id-wins dedup); mid-year type switch (member lands in one section, other-type
  months excluded); a concluded pioneer; start-of-service-year (`elapsedEnrolled = 0`); a reported
  0-hour month vs a month with no row; `currentExpectedMonth` awaiting-vs-overdue across the grace
  window; `outOfReach`. Sentinels to distinguish test data; assert on returned values, never spies.
- `getPioneerActivitySummary`: co-located unit test (mock `db`) on the returned shape; an
  integration test with a seeded congregation covering the two-year service-year predicate, mid-year
  enrollment, a duplicate re-filed month, and a missing latest month.
- No React component tests — logic lives in `pioneer-pace.ts` and is tested there.

## 12. Open questions

1. **Editing a past service year's goal** — allowed? It retroactively re-buckets historical pace.
   Lean: allow, since requirements genuinely changed year to year; confirm.
2. **Reporting grace window length** — how many days into month M+1 before month M counts as
   *overdue* rather than *awaiting*? (Tunable constant.)

**Resolved:**
- Goal-edit permission → new `Permission.PioneerGoalManager`, admin-assigned (§9).
- Auxiliary goal handling → the reduced auxiliary goal (15 h) is an individual per-month election.
  The auxiliary section stays **informational, no met/not-met verdict** (§5.1 B); no change to the
  `PublisherActivity` model. Options considered and rejected for this feature: capturing the goal at
  report-entry, and a full start-of-month enrollment with goal-only rows + `reportedAt` (the latter
  reshapes the core activity model and belongs in the deferred enrollment feature, §10 Future work).
