# Architecture Conventions

Structural rules for how the Unitae codebase is organized. Orthogonal to [Coding Conventions](coding-conventions.md), which covers style and service-layer mechanics; this doc covers *where files live*, *what each file is allowed to do*, and *how features interact*.

This document is **part target state, part current rule**. The migration is tracked in waves on the `refactor/architecture-conventions` branch. Sections labelled *target* describe the destination; sections without that label apply today.

## Goals

Two goals, in order:

1. **Make the codebase navigable to AI agents and new contributors.** When someone (human or LLM) asks "where is the logic for X?", the answer should come from reading one file, not from spelunking through several. Predictable structure beats clever structure.
2. **Centralize invariants so they're hard to forget.** Bugs that take the form "developer forgot to call X after Y" are eliminated by giving Y a single entry point that calls X internally.

Everything below serves one or both of these goals. When a rule does not serve either, it does not belong here.

## Canonical Feature Shape

Each feature under `app/features/{name}/` has the following layout. **Required** subfolders exist in every feature; **optional** subfolders exist only when the feature needs them.

```
app/features/{name}/
├── index.ts                         # Required (target). Public boundary — re-exports.
├── routes/                          # Required. Route loaders, actions, components.
├── schemas/                         # Required. Conform + Zod form validation.
├── server/                          # Optional. Service functions (aggregates, queries, helpers).
├── ui/                              # Optional. Feature-specific React components.
├── model/                           # Optional. TypeScript type definitions shared with client.
├── jobs/                            # Optional. BullMQ background-job handlers.
└── emails/                          # Optional. React Email templates.
```

A feature with no business logic (e.g., `congregation/`) may omit `server/`. A feature with no UI of its own (e.g., a pure API surface) may omit `ui/`. Do not create empty folders.

**No other top-level subfolders.** Don't add `helpers/`, `lib/`, `utils/` inside a feature — those names attract grab-bag files. Cross-cutting utilities go in `app/shared/`.

## Feature Boundary Rule

Features may only import each other through their `index.ts`. Deep imports into another feature's `server/`, `ui/`, or `model/` are forbidden.

```typescript
// Allowed
import { getProgrammeTemplate } from '~/features/events'

// Forbidden (target)
import { getProgrammeTemplate } from '~/features/events/server/programme-templates.server'
```

Each feature's `index.ts` re-exports exactly the public surface other features need — typically a few service functions and types. If feature A needs something private to feature B, that's a signal to either (a) promote the function to B's public API, or (b) move the shared concern into `app/shared/domain/`.

**Type-only imports** (`import type ...`) into another feature are tolerated, but prefer re-exporting types from `index.ts` when possible.

**Dashboard exemption**: `features/dashboard/` is an aggregator by design — it composes data across territories, events, board, and publishers for the homepage. It is allowed to deep-import from other features, but the exemption must be documented in `features/dashboard/index.ts` and is the only exemption.

A Biome lint rule blocks new violations once the migration completes (Wave 3).

## Service File Naming

Service functions live in `features/{name}/server/`. File names follow one of two patterns:

**Verb-noun per file (preferred for new code)**

One service function per file, named for the action it performs:

```
server/
├── create-member.server.ts
├── update-member.server.ts
├── set-member-left.server.ts
├── set-member-returned.server.ts
└── toggle-publisher-status.server.ts
```

The verb-noun pattern makes service functions discoverable by file name alone. An agent asked "where is the code that marks a member as left?" finds `set-member-left.server.ts` without reading any contents.

**Grab-bag (grandfathered, not for new files)**

Existing files like `publishers.server.ts`, `groups.server.ts`, `buildings.server.ts`, `attributions.server.ts` bundle multiple related functions in one file. These remain because rewriting them has no payoff, but **no new grab-bag files**. Add new functions to the verb-noun pattern instead, even if related to an existing grab-bag domain.

When the [CQRS-lite split](#cqrs-lite-readwrite-split-within-a-feature) is applied to a feature, the grab-bag file becomes the feature's read-side surface (it should already be mostly queries) and any write functions migrate to the corresponding aggregate.

## Aggregate Doctrine

An **aggregate** is a single file that owns all mutations to a domain entity (or cluster of entities) and enforces the entity's invariants. Outside code mutates the entity only through the aggregate's exported functions.

### When to introduce an aggregate

Introduce one when **either** is true:

- **3+ call sites must coordinate an invariant.** Example: 9+ places mutate `Member` fields that must trigger `syncBuiltInRoleAssignments`; without an aggregate, every developer (and every AI agent) must remember the rule, and the audit confirmed one site already forgets.
- **The entity has an explicit state machine.** Example: `Attribution` has a lifecycle (assigned → returned → archived) with overlap invariants that bridge create and update; the rules live in one file so the state transitions are obvious.

Do not introduce aggregates speculatively. Most CRUD entities (Board documents, Settings, Notifications) don't have either property — adding an aggregate is pure ceremony.

### Current aggregates

| Aggregate | Location | Reason |
|---|---|---|
| `Member` | `app/features/publishers/server/member.aggregate.ts` | 9+ mutation sites must call `syncBuiltInRoleAssignments` after editing identity flags |
| `Attribution` | `app/features/territories/server/attribution.aggregate.ts` | State machine + overlap invariant (one active per building × publisher × type) |
| `ProgrammeAssignment` (policy, not aggregate) | `app/features/events/server/programme-assignment.policy.ts` | Eligibility + distinctness rules duplicated across `assignPart` and `assignServiceRole` |

`ProgrammeAssignment` is a *policy* (pure functions called by mutators), not a full aggregate, because the mutation still happens in `programme-assignments.server.ts`. The boundary is the same — the policy is the only place where eligibility rules live.

### Aggregate contract

- **Exports only mutation functions.** Read queries do not live in aggregates; they belong in the query side ([CQRS-lite](#cqrs-lite-readwrite-split-within-a-feature)).
- **Each mutation function** takes `(db, ...domain params, actorId)`, performs the write inside the transaction, calls `audit()`, and (for `Member`) calls `syncBuiltInRoleAssignments`.
- **Internal invariant helpers** are private (not exported) or prefixed with `_assert*` to be obviously aggregate-internal.
- **Direct `db.<model>.create/update/updateMany/delete/deleteMany/upsert`** on the aggregate's primary model is forbidden outside the aggregate file. Enforced by lint (Wave 5).

### Allowed bypass: import orchestrators

`import-*.server.ts` files (e.g., `import-members.server.ts`) bulk-load data from archive files. They may call `db.member.create` directly because they replay an external source of truth, not user actions, and they call `syncBuiltInRoleAssignments` in a single post-import pass. These files are on the lint allowlist.

## CQRS-lite: read/write split within a feature

Within each feature, **writes go through `*.aggregate.ts` files; reads go through `*.queries.ts` (or unsuffixed `<feature>.server.ts`) files**. Both share the same Postgres database — no separate datastore, no event bus, no eventual consistency.

| File suffix | Allowed to | Forbidden from |
|---|---|---|
| `*.aggregate.ts` | `db.*.create/update/delete/upsert`, `audit()`, invariant checks, role-sync triggers | `findMany`, `findFirst`, `count`, `aggregate` (except as part of invariant checks via private `_assert*` helpers) |
| `*.queries.ts` or `{feature}.server.ts` | `findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, joins, projections for the UI | `create`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert` |
| Other `*.server.ts` (single-purpose) | One of the above sets, picked by the file's purpose | The other set |

This gives the navigability benefit of CQRS — a contributor or AI agent knows from the file name whether they're looking at a mutation or a query — without the synchronization cost of full CQRS (separate read models, eventual consistency, projection lag).

### What this is not

- **Not full CQRS.** No separate read database. No event bus. No projection lag. A query reads the row right after the aggregate wrote it, in the same transaction if needed.
- **Not Event Sourcing.** The current state is the source of truth. The `AuditLog` table is a side-record, not a replay log.
- **Not a hard constraint on read side.** Queries can be as ad-hoc as they need to be — sorting, filtering, joining, paginating. The constraint is *what they don't do* (mutate).

### Migration of existing files

Existing grab-bag files (`publishers.server.ts`, `attributions.server.ts`, `buildings.server.ts`, `groups.server.ts`) are predominantly read-side already and stay as the feature's query surface. The few write functions they contain migrate to the corresponding aggregate during Wave 5.

### Lint enforcement (target)

A Biome rule (Wave 5) enforces:
- `db.<model>.create|update|updateMany|delete|deleteMany|upsert` is forbidden outside files matching `*.aggregate.ts` (or on an explicit allowlist).
- `db.<model>.findMany|findFirst|findUnique|count|aggregate` is forbidden inside `*.aggregate.ts` except in functions prefixed with `_assert` (the convention for internal invariant checks).

## File-size Budgets

Files have soft and hard size limits. **Soft** triggers a CI warning; **hard** fails CI.

| File pattern | Soft | Hard |
|---|---|---|
| `*.server.ts`, `*.aggregate.ts` | 200 lines | 350 lines |
| Route `*.tsx` (in `features/*/routes/`) | 150 lines | 300 lines |
| Component `*.tsx` (in `ui/` or `shared/ui/`) | 200 lines | 400 lines |
| `*.test.ts`, `*.integration.test.ts`, `*.spec.ts` | exempt | exempt |
| Generated code (`app/database/generated/`) | exempt | exempt |
| Migration SQL | exempt | exempt |

The budget exists to enforce a principle: **a service file should hold one concept; a route file should orchestrate, not implement; a component file should render one piece of UI**. When a file approaches the hard limit, the right answer is almost always to split it into smaller files with clear responsibilities — not to compress the existing code.

The CI check lives at `scripts/check-file-sizes.ts` and runs in the `file-size-check` job of `.github/workflows/continuous-integration.yml`.

### Explicit overrides

If a file genuinely cannot be split (very rare — usually a generated config, a large constants table, or a complex SQL query in code), add an entry to `scripts/check-file-sizes.ts`'s `EXEMPT_FILES` array with a one-line justification. New exemptions require reviewer approval.

## TDD Discipline

Test-Driven Development applies to **two situations**, not the whole codebase:

### Required

- **New service functions** (in `features/*/server/`) — write the test first. The test describes the function's contract (inputs, outputs, errors thrown). Implementing to a written test forces the function to have a small, well-defined surface.
- **Bug regressions** — when fixing any bug, write a failing test that reproduces the bug *before* writing the fix. The test stays in the codebase as a regression guard.

### Encouraged

- **Aggregate invariant tests** — every invariant enforced by an aggregate should have a test that tries to violate it and verifies the aggregate throws. Aim for 100% branch coverage of invariant checks.

### Not required

- Route components, glue code, layout shells, migrations, scripts.

### Test style

Black-box: assert on what a function returns or throws. Don't assert on internal call counts unless that delegation *is* the contract (e.g., "ensures `congregationId` is passed to the DB query"). See [Coding Conventions › Testing](coding-conventions.md#testing) for the full rules.

## Pre-commit Contract

A pre-commit hook (lefthook) runs locally before every commit:

```yaml
# lefthook.yml (Wave 2)
pre-commit:
  parallel: true
  commands:
    lint:
      glob: '*.{ts,tsx,js,jsx,json}'
      run: pnpm biome check --staged {staged_files}
    typecheck:
      run: pnpm test:typecheck
    unit-tests:
      run: pnpm test:unit --changed
```

The hook ships in Wave 2. After install (`pnpm install` triggers `lefthook install` via the `prepare` script), commits with lint, type, or unit-test failures are blocked locally. CI runs the same checks plus integration and E2E — the pre-commit hook shortens the feedback loop, it doesn't replace CI.

Bypassing with `--no-verify` is allowed for trivial typo commits but the CI check still gates the merge.

## Constants Policy

Magic numbers that carry domain meaning are extracted to `app/shared/constants/`:

```
app/shared/constants/
├── queue-delays.ts      # THUMBNAIL_DELAY_MS = 5_000, TERRITORY_SYNC_DELAY_MS = 10_000
├── pagination.ts        # DEFAULT_PAGE_SIZE = 50, MAX_BUILDINGS_PER_PAGE = 1_500
└── limits.ts            # MAX_IMPORT_SIZE_BYTES = 500 * 1024 * 1024
```

A bare `1500` in business code is a smell — the reader can't tell whether it's a pagination limit, a timeout, or a coincidence. A named import (`MAX_BUILDINGS_PER_PAGE`) carries intent.

### Not constants

Variant strings constrained by TypeScript literal types (`'asc' | 'desc'`, `'ghost' | 'outline' | 'default'`) do **not** need to be enums. The type system already prevents typos and the string value is self-documenting. Don't enum-ify for the sake of it.

### Generated/external constants

Stripe prices, AWS bucket names, env var keys — these belong with the code that uses them, not in `shared/constants/`. The folder is for domain constants only.

## DORA Hooks

A weekly script (`scripts/dora-metrics.ts`, Wave 9) computes the four DORA metrics from git history and Conventional Commits:

- **Deploy frequency** — count of pushes to `main` per week
- **Lead time for changes** — median (PR merge timestamp − first commit timestamp)
- **Change failure rate** — count of `fix:` commits / count of `feat:` commits in the window
- **Mean time to restore** — median time between a `feat:` and the `fix:` that patches it (identified by issue references or commit body)

Output lands in `.planning/dora/<YYYY-WW>.md` (gitignored) or is posted to the team's tracking surface. The point is not the absolute numbers — it's catching regressions ("our lead time doubled this quarter, what changed?").

## Related

- [Coding Conventions](coding-conventions.md) — style, service-layer mechanics, FK rules
- [Architecture](architecture.md) — request flow, multi-tenancy, RLS, audit logging
- [Testing](testing.md) — test setup, mocking, integration patterns
- [Permissions and Roles](permissions-and-roles.md) — `Permission` enum, built-in vs custom roles
