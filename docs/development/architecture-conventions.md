# Architecture Conventions

Structural rules for how the Unitae codebase is organized. Orthogonal to [Coding Conventions](coding-conventions.md), which covers style and service-layer mechanics; this doc covers *where files live*, *what each file is allowed to do*, and *how features interact*.

This document is **part target state, part current rule**. The migration is tracked in waves on the `refactor/architecture-conventions` branch. Sections labelled *target* describe the destination; sections without that label apply today.

## Migration Status

| Wave | Scope | Status |
|---|---|---|
| 0 | This doc + CLAUDE.md updates | ✅ landed |
| 1 | 4 production bug fixes (TDD-first) | ✅ landed |
| 2 | lefthook + file-size CI guard | ✅ landed |
| 3 | Feature `index.ts` boundaries + cross-feature import lint | ✅ landed |
| 4 | Split mega-files | ✅ landed |
| 5 | Three aggregates + CQRS-lite lint enforcement | ✅ landed |
| 6 | Constants files + `any` triage | ⏳ pending |
| 7 | TDD rollout + coverage backfill | ⏳ pending |
| 8 | Stress-case fixes (locale, name/phone validation, anonymization) | ⏳ pending |
| 9 | Delivery-metrics script | ⏳ pending |

Update this table when a wave merges.

## Table of Contents

- [Goals](#goals)
- [Aggregate Doctrine](#aggregate-doctrine)
- [CQRS-lite: read/write split within a feature](#cqrs-lite-readwrite-split-within-a-feature)
- [Canonical Feature Shape](#canonical-feature-shape)
- [Service File Naming](#service-file-naming)
- [Feature Boundary Rule](#feature-boundary-rule)
- [File-size Budgets](#file-size-budgets)
- [TDD Discipline](#tdd-discipline)
- [Pre-commit Contract](#pre-commit-contract)
- [Constants Policy](#constants-policy)
- [Delivery Metrics](#delivery-metrics)
- [Related](#related)

## Goals

Two goals, in order:

1. **Make the codebase navigable to AI agents and new contributors.** When someone (human or LLM) asks "where is the logic for X?", the answer should come from reading one file, not from spelunking through several. Predictable structure beats clever structure.
2. **Centralize invariants so they're hard to forget.** Bugs that take the form "developer forgot to call X after Y" are eliminated by giving Y a single entry point that calls X internally.

Everything below serves one or both of these goals. When a rule does not serve either, it does not belong here.

## Aggregate Doctrine

An **aggregate** is a single file that owns all mutations to a domain entity (or cluster of entities) and enforces the entity's invariants. Outside code mutates the entity only through the aggregate's exported functions.

### What counts as an invariant

> An **invariant** is a rule whose violation produces incorrect domain state — orphaned role assignments, overlapping attributions, a member assigned a role they're not eligible for. Audit logging, structured logging, and metrics are *not* invariants; they're cross-cutting concerns handled separately (by `audit()`, `createLogger()`, etc.) and verified by lint/tests, not by aggregates.

### When to introduce an aggregate

Introduce one when **either** is true:

- **3+ mutation entry points must coordinate an invariant.** Example: 9+ places mutate `Member` fields that must trigger `syncBuiltInRoleAssignments`; without an aggregate, every developer (and every AI agent) must remember the rule. Count distinct entry points, not lines of code.
- **The entity has an explicit state machine.** Example: `Attribution` has a lifecycle (assigned → returned → archived) with overlap rules that bridge create and update.

Do not introduce aggregates speculatively. Most CRUD entities (Board documents, Settings, Notifications) have neither property — adding an aggregate is pure ceremony.

### Aggregates vs Policies

When the rules are duplicated across multiple writers but extracting an aggregate would prematurely lock the design, extract a **policy** instead.

- An **aggregate** owns the mutation: callers invoke `member.aggregate.updateFlags(...)`; the aggregate writes, asserts, audits.
- A **policy** owns the rule: callers still write directly (or via existing service functions) but call `programmeAssignmentPolicy.assertAssignable(...)` before the write.

Promote a policy to an aggregate when a third writer appears or when the rule set grows beyond pure assertions.

### Current aggregates and policies

| Name | Kind | Location | Reason |
|---|---|---|---|
| `Member` | aggregate | `app/features/publishers/server/member.aggregate.ts` | 12 mutation sites route through it so `syncBuiltInRoleAssignments` fires after every identity-flag change |
| `Attribution` | aggregate | `app/features/territories/server/attribution.aggregate.ts` | State machine (assigned → returned → archived) + overlap invariant (one active per publisher × territory time-window) |
| `ProgrammeAssignment` | policy | `app/features/events/server/programme-assignment.policy.ts` | Eligibility + distinctness + day-off + external-speaker rules shared by `assignPart` and `assignServiceRole` |

### Aggregate contract

Aggregate files (`*.aggregate.ts`) follow this contract:

1. **Export only mutation functions.** Each takes `(db: TransactionClient, ...domainParams, actorId: number)` and returns the affected entity (or `null` for not-found, per the existing service-layer convention).
2. **Reads inside aggregates** are classified into three categories:
   - **Precondition lookups** — fetching the entity to mutate, or checking related state before the write. Allowed without naming convention.
   - **Invariant assertions** — pure-function checks that throw on violation. Prefixed `_assert*` (private convention) and called from the mutation function before the write.
   - **UI / report queries** — listing, paginating, projecting for the UI. **Forbidden in aggregates.** Move to the query side (`*.queries.ts` or unsuffixed `<feature>.server.ts`).
3. **Side effects after the write**: call `audit()` (fire-and-forget) or `auditInTransaction(tx, ...)` if the audit must be atomic with the write (see [Transaction boundaries](#transaction-boundaries)).
4. **Direct `db.<model>.create/update/updateMany/delete/deleteMany/upsert`** on the aggregate's primary model is forbidden outside the aggregate file. Enforced by `pnpm test:aggregate-boundaries` (see [Lint enforcement](#lint-enforcement)).

### Cross-aggregate workflows

When a single user action mutates more than one aggregate (e.g., marking a member as left also archives their open attributions), the orchestration lives in a `*.workflow.ts` file in the calling feature:

```typescript
// app/features/publishers/server/leave-publisher.workflow.ts
export async function leavePublisher(db, memberId, congregationId, actorId) {
  const member = await memberAggregate.markLeft(db, memberId, congregationId, actorId)
  if (member) {
    await attributionAggregate.archiveAllForPublisher(db, memberId, actorId)
  }
  return member
}
```

Workflows:
- May import other features' aggregates **via the feature `index.ts`** (which re-exports the aggregate's public mutation functions).
- Run inside a single `withScope` transaction opened by the route, so partial failure rolls back both aggregates' writes.
- Should not contain business logic of their own — pure orchestration. If a workflow grows logic, promote it into one of the aggregates.

### Transaction boundaries

- `withScope(congregationId, fn)` opens one Postgres transaction and sets `app.congregation_id` for RLS. All `db.*` calls inside `fn` share that transaction.
- Multiple aggregate calls inside one `withScope` block share the transaction. Partial failure rolls back all writes.
- `audit()` is fire-and-forget and writes outside the caller's transaction — fine when the audit is informational. Use `auditInTransaction(tx, entry)` when the audit must succeed or fail atomically with the mutation (e.g., legally-required deletion records).
- Aggregates **accept** a transaction client; they do not open their own. The caller (route, workflow, or job handler) owns the transaction boundary via `withScopeFromContext` / `withScope`.

### How to introduce a new aggregate

1. Create `app/features/<feature>/server/<entity>.aggregate.ts`.
2. Move every existing `db.<entity>.create/update/updateMany/delete/deleteMany/upsert` call into named exports on the aggregate. Each function takes `(db, ...domainParams, actorId)`, performs the write, calls `audit()`.
3. Extract invariant checks into private `_assert*` helpers. Call them from the mutation functions before the write.
4. Add `*.aggregate.integration.test.ts` covering: every happy-path mutation, every invariant violation (assert the aggregate throws), every audit call (assert via fixture inspection).
5. Add the model to `AGGREGATE_MODELS` in `scripts/check-aggregate-boundaries.ts` so direct `db.<model>.create/update/…` outside the aggregate is blocked.
6. Update the [Current aggregates](#current-aggregates-and-policies) table in this doc, the call sites at consumer routes/jobs, and the relevant feature's `index.ts` re-exports.

### Aggregate testing

Aggregates get both unit and integration tests:

```typescript
// member.aggregate.test.ts  (unit, fast — covers invariant logic)
vi.mock('~/shared/infra/db.server')

test('updateFlags throws when isMale is null but a male-only role is being assigned', () => {
  vi.mocked(db.member.findFirst).mockResolvedValue({ id: 1, isMale: null, /* ... */ })

  expect(memberAggregate.updateFlags(db, 1, congregationId, actorId, { roleId: ELDER_ROLE_ID }))
    .rejects.toThrow(InvariantError)
})

// member.aggregate.integration.test.ts  (slow — covers sync side-effect)
test('updateFlags triggers syncBuiltInRoleAssignments', async () => {
  const { member } = await seedMember({ isPublisher: false })

  await memberAggregate.updateFlags(testDb, member.id, congregationId, actorId, { isPublisher: true })

  const roles = await testDb.memberRoleAssignment.findMany({ where: { memberId: member.id } })
  expect(roles.map(r => r.roleKey)).toContain('publisher')
})
```

Aim for 100% branch coverage on `_assert*` helpers. Mutation happy paths can rely on integration tests.

### Error messages

Invariant violations throw `AppError` subclasses from `app/shared/errors/`:

- **Internal message in English** (the `Error.message`) — for logs, stack traces, and developer tooling.
- **User-facing translation in French** happens at the route boundary, via the existing flash-message + Paraglide flow.

```typescript
// In the aggregate:
throw new ConflictError('attribution_overlap', { buildingId, publisherId })

// In the route:
catch (err) {
  if (err instanceof ConflictError && err.code === 'attribution_overlap') {
    return session.flash('error', m.territories_attribution_overlap_error())
  }
  throw err
}
```

### Allowed bypass: import orchestrators

`import-*.server.ts` files (e.g., `import-user-accounts.server.ts`) bulk-load data from archive files. They may call `db.<model>.create` directly because they replay an external source of truth, not user actions, and they call `syncBuiltInRoleAssignments` in a single post-import pass. These files are on the `check-aggregate-boundaries.ts` allowlist.

## CQRS-lite: read/write split within a feature

Within each feature, **writes go through `*.aggregate.ts` files; reads go through `*.queries.ts` (or unsuffixed `<feature>.server.ts`) files**. Both share the same Postgres database — no separate datastore, no event bus, no eventual consistency.

| File suffix | Allowed | Forbidden |
|---|---|---|
| `*.aggregate.ts` | mutations on the primary model; precondition lookups; `_assert*` invariant helpers; `audit()`; `syncBuiltInRoleAssignments` | UI / report queries (`findMany`, paginated lists, joined projections for views) |
| `*.queries.ts`, `*.policy.ts`, or `{feature}.server.ts` | all read operations; pagination; aggregation; joins for UI | `create`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert` |
| Other `*.server.ts` (single-purpose) | one of the above sets, picked by the file's purpose | the other set |

This gives the navigability benefit of CQRS — a contributor or AI agent knows from the file name whether they're looking at a mutation or a query — without the synchronization cost of full CQRS.

### What this is not

- **Not full CQRS.** No separate read database. No event bus. No projection lag. A query reads the row right after the aggregate wrote it.
- **Not Event Sourcing.** Current state is the source of truth. `AuditLog` is a side-record, not a replay log.
- **Not a hard constraint on read shape.** Queries can be as ad-hoc as the UI needs — sorting, filtering, joining, paginating. The constraint is *what they don't do* (mutate).

### Migration of existing files

Grab-bag files (`publishers.server.ts`, `attributions.server.ts`, `buildings.server.ts`, `groups.server.ts`) are predominantly read-side and stay as the feature's query surface. Write functions on `Member` and `Attribution` have migrated to their aggregates; any future aggregate promotion follows the same pattern.

### Lint enforcement

`scripts/check-aggregate-boundaries.ts` (run via `pnpm test:aggregate-boundaries` — wired into `pre-push` and the CI `lint` job) enforces:

- **Writes**: `db.<aggregate-model>.create|update|updateMany|delete|deleteMany|upsert` is forbidden outside `*.aggregate.ts` files. Allowlisted: `import-*.server.ts` orchestrators, `*.test.*` files, and the `app/tests/` infrastructure directory.
- **UI-shape reads**: `findMany|count|aggregate` inside `*.aggregate.ts` is forbidden unless the enclosing function is prefixed `_assert*` (invariant check) OR the call is preceded by `// aggregate-boundaries-allow: <reason>` (documented precondition lookup).
- `findFirst` and `findUnique` are always allowed — single-row shapes are precondition lookups by design.

Why a custom script and not a Biome rule: Biome doesn't support user-defined custom rules today, and ESLint AST selectors are fragile for this shape. The script mirrors `check-file-sizes.ts` in shape + UX.

## Canonical Feature Shape

Each feature under `app/features/{name}/` has the following layout. **Required** subfolders exist in every feature; **optional** subfolders exist only when the feature needs them.

```
app/features/{name}/
├── index.ts                         # Required (target). Public boundary — re-exports.
├── routes/                          # Required. Route loaders, actions, components.
├── schemas/                         # Required. Conform + Zod form validation.
├── server/                          # Optional. Service functions, aggregates, queries, workflows.
├── ui/                              # Optional. Feature-specific React components.
├── model/                           # Optional. TypeScript type definitions shared with client.
├── jobs/                            # Optional. BullMQ background-job handlers.
└── emails/                          # Optional. React Email templates.
```

A feature with no business logic (e.g., `congregation/`) may omit `server/`. A feature with no UI of its own may omit `ui/`. Do not create empty folders.

**No other top-level subfolders.** Don't add `helpers/`, `lib/`, `utils/` inside a feature — those names attract grab-bag files. Cross-cutting utilities go in `app/shared/`. Feature-internal pure-function helpers used by multiple files in `server/` may live as `<helper>.ts` (no `.server.ts` suffix needed for pure helpers) directly inside `server/`.

## Service File Naming

Service functions live in `app/features/{name}/server/`. File names follow one of two patterns:

**Verb-noun per file (preferred for new code)**

One service function per file, named for the action it performs:

```
server/
├── create-member.server.ts
├── update-member.server.ts
├── set-member-left.server.ts
└── toggle-publisher-status.server.ts
```

The verb-noun pattern makes service functions discoverable by file name alone. An agent asked "where is the code that marks a member as left?" finds `set-member-left.server.ts` without reading any contents.

**Grab-bag (grandfathered, not for new files)**

Existing files like `publishers.server.ts`, `groups.server.ts`, `buildings.server.ts`, `attributions.server.ts` bundle multiple related functions in one file. These remain; rewriting them has no payoff. **No new grab-bag files.** Add new functions to the verb-noun pattern instead.

Under the [CQRS-lite split](#cqrs-lite-readwrite-split-within-a-feature), the grab-bag file becomes the feature's read-side surface; write functions move to the corresponding aggregate.

## Feature Boundary Rule

Features may only import each other through their `index.ts`. Deep imports into another feature's `server/`, `ui/`, or `model/` are forbidden.

```typescript
// Allowed
import { getProgrammeTemplate } from '~/features/events'

// Forbidden — fails `pnpm test:boundaries`
import { getProgrammeTemplate } from '~/features/events/server/programme-templates.server'
```

### `index.ts` re-export shape

- **Named re-exports only**: `export { fn, type Foo } from './server/foo.server'`. No `export *`.
- **Type re-exports use `export type`** (avoids accidental value-side coupling).
- **Job handlers are not re-exported** from `index.ts` — workers import them directly from `app/workers/worker.server.ts`.
- The `index.ts` file should be the **only** place that mentions another feature's internal paths to outsiders.

### Aggregator exemption

`app/features/dashboard/` aggregates data across territories, events, board, and publishers for the homepage. It is allowed to deep-import from other features, but the exemption is encoded in the lint rule's allowlist (Wave 3), not in a code comment. Adding a new exemption requires a doc PR + lint config change — there is no informal escape hatch.

## File-size Budgets

Files have soft (CI warning) and hard (CI failure) line limits.

| File pattern | Soft | Hard |
|---|---|---|
| `*.server.ts`, `*.aggregate.ts`, `*.queries.ts`, `*.policy.ts` | 200 lines | 350 lines |
| Route `*.tsx` (in `app/features/*/routes/`) | 150 lines | 300 lines |
| Component `*.tsx` (in `ui/` or `shared/ui/`) | 200 lines | 400 lines |
| `*.test.ts`, `*.integration.test.ts`, `*.spec.ts` | exempt | exempt |
| Generated code (`app/database/generated/`) | exempt | exempt |
| Migration SQL | exempt | exempt |

The budget exists to enforce a principle: a service file should hold one concept; a route file should orchestrate, not implement; a component file should render one piece of UI. When a file approaches the hard limit, the right answer is almost always to split it into smaller files with clear responsibilities — not to compress the existing code.

### Grandfathering

Files exceeding the hard limit when Wave 2 lands are auto-added to `scripts/check-file-sizes.ts`'s `EXEMPT_FILES` array with the commit SHA recorded. The exemption is removed when the file is split (Wave 4 covers the largest ones). **New files have no grandfathering.**

### Explicit overrides

If a file genuinely cannot be split (rare — usually a generated config or a large constants table), add an entry to `EXEMPT_FILES` with a one-line justification. New exemptions require reviewer approval.

## TDD Discipline

Test-Driven Development applies to **two situations**, not the whole codebase:

### Required

- **New service functions** (in `app/features/*/server/`) — write the test first. The test describes the contract (inputs, outputs, errors thrown). Implementing to a written test forces a small, well-defined surface.
- **Bug regressions** — when fixing any bug, write a failing test reproducing the bug *before* writing the fix. The test stays as a regression guard.

### Encouraged

- **Aggregate invariant tests** — every invariant has a test that tries to violate it and asserts the aggregate throws. Aim for 100% branch coverage of `_assert*` helpers.

### Not required

- Route components, glue code, layout shells, migrations, scripts.

### Test style

Black-box: assert on what a function returns or throws. Don't assert on internal call counts unless that delegation *is* the contract (e.g., "ensures `congregationId` is passed to the DB query"). See [Coding Conventions › Testing](coding-conventions.md#testing). For aggregate test examples, see [Aggregate Doctrine › Aggregate testing](#aggregate-testing).

## Pre-commit Contract

Two hooks shipped via lefthook (Wave 2):

```yaml
# lefthook.yml (Wave 2)
pre-commit:
  parallel: true
  commands:
    lint:
      glob: '*.{ts,tsx,js,jsx,json}'
      run: pnpm biome check --staged {staged_files}
    unit-tests:
      run: pnpm test:unit --changed

pre-push:
  parallel: true
  commands:
    typecheck:
      run: pnpm test:typecheck
    file-sizes:
      run: pnpm test:file-sizes
```

The split is deliberate: **pre-commit must be fast** so developers don't reach for `--no-verify` reflexively. Linting staged files and running tests for changed modules typically completes in seconds. **Pre-push catches the slower checks** (full typecheck, file-size budget) before they hit CI but doesn't gate every save-and-commit cycle.

Bypassing with `--no-verify` is allowed only when the hook itself is broken; CI gates the merge regardless of bypass.

## Constants Policy

Magic numbers in business logic are extracted to `app/shared/constants/` when:

- The same value is used in **2+ places**, OR
- The value's meaning is **non-obvious from context** (e.g., `10_000` for a queue delay vs `10` for a `take()` limit)

Single-use, self-evident numbers (`take(10)`, `splice(0, 1)`) stay inline.

```
app/shared/constants/
├── queue-delays.ts      # THUMBNAIL_DELAY_MS = 5_000, TERRITORY_SYNC_DELAY_MS = 10_000
├── pagination.ts        # DEFAULT_PAGE_SIZE = 50, MAX_BUILDINGS_PER_PAGE = 1_500
└── limits.ts            # MAX_IMPORT_SIZE_BYTES = 500 * 1024 * 1024
```

### Not constants

Variant strings constrained by TypeScript literal types (`'asc' | 'desc'`, `'ghost' | 'outline'`) don't need enums. The type system prevents typos; the string is self-documenting. Don't enum-ify for the sake of it.

### Generated / external constants

Stripe prices, AWS bucket names, env var keys — these belong with the code that uses them, not in `shared/constants/`. The folder is for domain constants only.

## Delivery Metrics

A weekly script (`scripts/dora-metrics.ts`, Wave 9) computes proxies for software-delivery performance from git history and Conventional Commits.

> **Disclaimer**: these are *proxies*, not the canonical [DORA metrics](https://dora.dev). True Change Failure Rate and MTTR require production-incident tracking that we don't have yet. The proxies are useful for spotting trends; don't read them as absolute industry benchmarks.

| Proxy | Definition | Caveat |
|---|---|---|
| **Deploy frequency** | Count of pushes to `main` per week | Each push deploys per the CD workflow, so this is real deploy frequency |
| **Lead time for changes** | Median of (PR merge timestamp − first commit timestamp) per week | Underestimates lead time when commits sit unmerged for a long time without surfacing as PRs |
| **Fix-to-feat ratio** | Count of `fix:` commits / count of `feat:` commits in the window | A proxy for CFR. Not the same — most `fix:` commits patch bugs introduced long before any recent `feat:` deploy. Use trends, not absolutes |
| **Hotfix turnaround** | Median time between a `feat:` and the first `fix:` referencing it (via issue or commit body) | Proxy for MTTR. Only catches fixes that explicitly reference the feature; silent regressions are invisible |

### Ownership and response

- **Owner**: tech lead reviews weekly during sprint review.
- **Output**: `.planning/dora/<YYYY-WW>.md` (gitignored — local artifact, summarized to the team channel manually).
- **Response threshold**: if any metric crosses 2× the trailing 4-week median, raise it as a retro item.

If incident tracking lands later, replace the proxies with real CFR and MTTR. Until then, these are decoration-resistant only when used as trend indicators.

## Related

- [Coding Conventions](coding-conventions.md) — style, service-layer mechanics, FK rules
- [Architecture](architecture.md) — request flow, multi-tenancy, RLS, audit logging
- [Testing](testing.md) — test setup, mocking, integration patterns
- [Permissions and Roles](permissions-and-roles.md) — `Permission` enum, built-in vs custom roles
