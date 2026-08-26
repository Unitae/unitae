# Unitae - AI Agent Reference

## Project Overview

Unitae is an open-source web application for managing Jehovah's Witnesses congregations. Built as a monolithic React Router v7 application with TypeScript, PostgreSQL (with Row-Level Security for multi-tenancy), Redis, and BullMQ for background processing.

**Stack:** React Router v7 · TypeScript · PostgreSQL · Prisma 7 · TailwindCSS 4 · shadcn/ui · Redis · BullMQ · Biome · Vitest · Playwright

**License:** AGPL-3.0 — 100% open source, revenue from managed hosting at `unitae.app`.

## Business Context

Core features: territory management with building prospection, publisher activity tracking, information board with document management, meeting programme scheduling, and congregation settings.

**Multi-tenancy model:** All data rows carry a `congregationId` FK. Tenant isolation is enforced at the database level via PostgreSQL Row-Level Security (RLS) policies — not at the application layer. The `SET LOCAL app.congregation_id` session variable activates scoped queries inside `withScope()`. Without it (login, health, setup), all rows are visible.

**Hosting model:** Self-hosted users deploy this repo and get everything unlimited. Managed hosting (`unitae.app`) enforces plan limits via nullable columns on the `Congregation` model read by `LimitService`. `null` = unlimited.

## Agent Instructions

### Core Principles

1. **ALWAYS read files before modifying** — Never propose changes to code you haven't seen
2. **Follow feature-based architecture strictly**:
   - Public boundary → `features/*/index.ts` (client-safe re-exports: types, UI, model helpers, schemas) + `features/*/index.server.ts` (server-only re-exports: services, aggregates, queries, workflows). Split enforced by `pnpm test:server-barrel-exports`.
   - Business logic → `features/*/server/*.server.ts` (writes in `*.aggregate.ts`, reads in queries files — see [CQRS-lite](docs/development/architecture-conventions.md#cqrs-lite-readwrite-split-within-a-feature))
   - Route handlers → `features/*/routes/*.tsx`
   - Feature-specific UI → `features/*/ui/`
   - Type definitions → `features/*/model/*.type.ts`
   - Form schemas → `features/*/schemas/*.schema.ts`
3. **Zero inline DB writes in routes** — `db.*.create()`, `db.*.update()`, `db.*.delete()` calls belong in service functions, never in route loaders or actions
4. **Cross-feature imports only via the two barrels** — `~/features/X` for client-safe things (types, UI, model helpers); `~/features/X/index.server` for server functions. Never deep-import into another feature's `server/`, `ui/`, or `model/`. The only exemption is `features/dashboard/`, the documented cross-feature aggregator. See [Architecture Conventions](docs/development/architecture-conventions.md#feature-boundary-rule).
5. **Always use `withScopeFromContext`** — Every authenticated route that touches the DB must wrap its logic in `withScopeFromContext(context, async db => { ... })`
6. **Thread `actorId`** — Every service function that writes data must accept `actorId: number` and call `audit()` after the write
7. **No `throw redirect()` in service functions** — Redirects are only allowed in route guards, middleware, and session validation
8. **Black-box testing** — Assert on observable outcomes; never spy on implementations
9. **TypeScript strict mode** — Never use `any`; always define proper interfaces
10. **Mutations to aggregate-owned entities go through the aggregate** — `Member`, `Attribution`, and `PioneerEnrolment` invariants live in `*.aggregate.ts` / `*.policy.ts` files (see `AGGREGATE_MODELS` in `scripts/check-aggregate-boundaries.ts` for the enforced list). Direct `db.member.update`/`db.attribution.create` outside those files fails `pnpm test:aggregate-boundaries`.
11. **Follow TDD when the architecture-conventions doc requires it** — for new service functions (`app/features/*/server/`) and bug regressions, **write the failing test first**, run it, **watch it fail**, then implement. Do not author the test and the code in the same save. See [Architecture Conventions › TDD Discipline](docs/development/architecture-conventions.md#tdd-discipline) — colocation is enforced by `pnpm test:service-test-coverage`, coverage floor by the vitest threshold.

### After Making Changes

Run the complete quality check:

```bash
pnpm test:unit && pnpm test:lint && pnpm test:typecheck
```

New service files must have a co-located test — verify with:

```bash
pnpm test:service-test-coverage
```

For integration tests (require a live database):

```bash
pnpm test:integration
```

### Security Rules

- **Never commit secrets** �� All sensitive config must use environment variables
- **Never commit `.env` files** — Local overrides only, never tracked
- **RLS enforces tenant isolation** — Do not rely solely on application-layer `congregationId` filtering; `withScope()` is mandatory for scoped queries
- **Validate user input at boundaries** — Use Conform + Zod schemas in route actions; service functions trust their callers
- **`requireParamId()`** — Always use this utility for parsing route params, never `parseInt` or `Number()` directly

## Project Structure

```
app/
├── root.tsx, entry.*, routes.ts, tailwind.css   # App shell
├── shell/                    # Shell routes (health, consent, privacy, suspended, cron.*)
├── features/
│   ├── authentication/       # Login, session, password reset, consent, profile
│   ├── congregation/         # Custom role CRUD (congregation/roles/*)
│   ├── dashboard/            # Dashboard stats and urgent items
│   ├── display-board/        # Document management, PDF upload, dynamic docs
│   ├── events/               # Days off, meeting events, programme assignments
│   ├── notifications/        # Notification events, preferences, flush worker
│   ├── platform-admin/       # Cross-congregation management (SaaS only)
│   ├── publishers/           # Publisher CRUD, groups, activity reports
│   ├── settings/             # User management, congregation config, data transfer
│   └── territories/          # Buildings, entrances, attributions, PDF, maps
├── shared/
│   ├── auth/                 # requireAuth middleware, route context helpers
│   ├── constants/            # limits, retention windows, shared numeric constants
│   ├── domain/               # audit, congregation, consent, limits, retention, setup
│   ├── errors/               # AppError hierarchy (NotFoundError, ConflictError, …)
│   ├── infra/                # db, redis, mailer, file-storage, logger, queues
│   ├── middleware/           # origin-check, security-headers (requireAuth lives in auth/)
│   ├── types/                # role, entrance, publisher-type, setting-key enums
│   ├── ui/                   # Shared components (shadcn/ui + PageHeader, RelativeTime, …)
│   │   └── hooks/            # use-debounced-value, use-online-status, use-unsaved-changes, …
│   └── utils/                # env, pagination, params, locale, cron, relative-time
├── database/                 # schema.prisma, migrations/, seed.ts, generated/ (gitignored)
└── tests/
    ├── e2e/                  # Playwright specs + helpers
    └── vitest.config.integration.ts
```

## Where to Find Things

| What | Where |
|------|-------|
| Database schema | `app/database/schema.prisma` |
| Auth middleware (`requireAuth`) | `app/shared/auth/middleware.server.ts` |
| Origin + security-header middleware | `app/shared/middleware/origin-check.server.ts`, `app/shared/middleware/security-headers.server.ts` |
| Route context helpers | `app/shared/auth/route-context.server.ts` |
| DB scope wrapper | `app/shared/infra/db.server.ts` → `withScope()` |
| Audit trail | `app/shared/domain/audit.server.ts` |
| Feature limits | `app/shared/domain/limits.server.ts` |
| File storage (S3/local) | `app/shared/infra/file-storage.server.ts` |
| Background queue | `app/shared/infra/queues.server.ts` |
| BullMQ worker | `app/workers/worker.server.ts` |
| i18n messages | `app/i18n/paraglide/messages.js` (generated) |
| Route definitions | `app/routes.ts` |
| Shared UI components | `app/shared/ui/` |
| AppError classes | `app/shared/errors/app-error.server.ts` |
| Permission enum | `app/shared/types/permission.ts` |
| Role helpers (display names, built-in keys, custom-role CRUD) | `app/shared/types/role.ts`, `app/shared/domain/built-in-roles.server.ts`, `app/shared/domain/roles.server.ts` |
| Territory edit map — which entrances show as candidates | `app/features/territories/server/map-visibility.ts` |

## Build and Test Commands

```bash
# Development
pnpm start:dev              # Start dev server with HMR
pnpm start:worker           # Start BullMQ worker (separate terminal)
pnpm start:emails           # React Email preview server

# Build
pnpm build                  # Production build
pnpm build:format           # Auto-format and lint with Biome (--write)
pnpm build:db               # Regenerate Prisma client

# Quality checks (run all three before committing)
pnpm test:unit              # Vitest unit tests
pnpm test:unit:watch        # Watch mode
pnpm test:unit:coverage     # With coverage report
pnpm test:integration       # Integration tests (requires live DB)
pnpm test:e2e               # Playwright E2E tests
pnpm test:lint              # Biome lint check
pnpm test:typecheck         # react-router typegen + tsc

# Architecture guards (all gate CI — run before pushing a structural change)
pnpm test:boundaries              # Cross-feature import boundaries
pnpm test:aggregate-boundaries    # Aggregate ownership + CQRS-lite split
pnpm test:tenant-scoping          # Bare-id queries that skip congregation scoping
pnpm test:server-barrel-exports   # index.ts / index.server.ts client/server split
pnpm test:service-test-coverage   # Co-located test for every service file
pnpm test:file-sizes              # File-size budgets

# Database
pnpm prisma generate        # Regenerate client after schema changes
pnpm prisma migrate deploy  # Apply migrations (prod / CI)
pnpm prisma db seed         # Seed initial roles and default data

# Infrastructure (dev)
docker compose -f docker/docker-compose.dev.yml up -d
```

## Code Style Guidelines

Enforced by **Biome 2.5.3** (`pnpm build:format` auto-fixes most issues):

- **Quotes:** Single quotes in JS/TS, double quotes in JSX attributes
- **Line width:** 120 characters
- **Trailing commas:** Everywhere
- **Semicolons:** Only when required (ASI)
- **Indentation:** 2 spaces
- **Array syntax:** Shorthand `string[]` not `Array<string>`
- **No `console.log`** in production code — use `createLogger()` from `~/shared/infra/logger.server`
- **Naming:** camelCase for variables/functions, PascalCase for types/components, CONSTANT_CASE for constants; naming convention is turned off for `*.server.ts`, route files, and test files (Prisma compound keys use a hybrid format)
- **Language:** French for all UI text and user-facing strings; English for code, comments, commits, PRs, documentation

### File naming

| Pattern | Purpose |
|---------|---------|
| `*.server.ts` | Server-only code (not importable from client bundles) |
| `*.aggregate.ts` | Aggregate root — owns mutations + invariants for a domain entity (e.g., `member.aggregate.ts`) |
| `*.workflow.ts` | Cross-aggregate orchestration for a single user action (e.g., `anonymize-member.workflow.ts` calls both `memberAggregate.anonymize` and `attributionAggregate.markReturnedForPublisher`) |
| `*.queries.ts` | Read-only query helpers (CQRS-lite read side) |
| `*.policy.ts` | Pure-function invariant checks shared across mutators (e.g., `event-status.policy.ts`) |
| `*.type.ts` | TypeScript type/interface definitions |
| `*.schema.ts` | Conform + Zod form validation schemas |
| `*.routes.ts` | Route configuration |
| `*-queue.server.ts` | BullMQ queue definitions |
| `handle-*-work.server.ts` | Background job handlers |
| PascalCase `.tsx` | React components |
| camelCase `.ts` | Utilities and services |

### File-size budgets

Files have soft (warning) and hard (CI failure) line limits. See [Architecture Conventions › File-size Budgets](docs/development/architecture-conventions.md#file-size-budgets) for the full table. Quick reference:

| Pattern | Soft | Hard |
|---|---|---|
| `*.server.ts`, `*.aggregate.ts` | 200 | 350 |
| Route `*.tsx` | 150 | 300 |
| Component `*.tsx` | 200 | 400 |

Tests and generated code are exempt.

### Pre-commit and pre-push hooks

`lefthook` runs two stages:
- **Pre-commit** (fast — keeps the inner loop tight): Biome lint on staged files + unit tests for changed files.
- **Pre-push** (heavier — catches before CI): full typecheck + file-size budget check.

Installed automatically via `pnpm install` (triggers `lefthook install` from the `prepare` script). `--no-verify` is allowed only when the hook itself is broken; CI gates the merge regardless of bypass.

## Testing Strategy

**Unit tests** (`*.server.test.ts` or `*.test.ts` co-located with source):
- Vitest with `vi.mock()` for `db.server`, `redis.server`, external services
- Assert on return values and thrown errors — never on spy call counts
- Use sentinel values (e.g., unique IDs) to distinguish test data from coincidental matches
- For client hooks: shim `globalThis.window`, mock `react-router` entirely

**Integration tests** (`*.integration.test.ts`):
- Use `PrismaPg` adapter + `testDb.$transaction` + `SET LOCAL app.congregation_id`
- Create isolated test congregations with `Date.now()` suffix
- Always clean up in `afterAll` — delete in FK dependency order (attributions before territories, etc.)
- Tests are order-independent: each test sets up its own state

**E2E tests** (`app/tests/e2e/*.spec.ts`):
- Playwright against a running application
- Auth helper in `app/tests/e2e/helpers/auth.ts`
- Use `test.skip()` gracefully when optional features are absent
- `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` env vars for credentials

### TDD expectations

Test-Driven Development applies to two situations specifically:

- **New service functions** — write the test first. The test describes the contract; the implementation conforms to it.
- **Bug regressions** — write a failing test that reproduces the bug *before* writing the fix. The test stays as a regression guard.

Aggregate invariant tests should aim for 100% branch coverage of the `_assert*` helpers. TDD is **not** required for route components, glue code, or migrations. See [Architecture Conventions › TDD Discipline](docs/development/architecture-conventions.md#tdd-discipline) for the full rules.

## Architecture Patterns

### Service layer

Routes call service functions; service functions call Prisma. No Prisma calls in route loaders/actions.

```typescript
// features/territories/server/delete-territory.server.ts
export async function deleteTerritory(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const territory = await db.territory.findFirst({ where: { id } })
  if (!territory) return null

  await db.territory.delete({ where: { id } })

  audit({ action: AuditAction.TerritoryDeleted, congregationId, actorId, entityType: 'Territory', entityId: id })
  return territory
}

// In the route action:
return withScopeFromContext(context, async db => {
  const result = await deleteTerritory(db, id, user.congregationId, user.id)
  if (!result) throw redirect('/territories')
  return redirect('/territories')
})
```

### Authentication & authorization

```typescript
// Layout route — the _required arg is deprecated and ignored
export const middleware = [requireAuth()]

// Route loader/action
const user = context.get(userContext)
const permissions = context.get(permissionsContext)
if (!permissions.has(Permission.TerritoriesManager)) throw redirect('/dashboard')
```

**Auth model:** `Permission` (24 entries, in `app/shared/types/permission.ts`) is the unit of access. **Roles** (DB table) bundle permissions and are assigned to users — built-in roles plus custom roles a Roles Manager creates. A role is the *only* way a permission reaches an account: the direct `CongregationUserPermission` edge was migrated into auto-roles and dropped in #149, so never reintroduce a user→permission write. `requireAuth()` runs `resolveEffectivePermissions` and stores the user's full granted set in `permissionsContext`; the legacy `_required` parameter is retained for call-site compatibility but no longer filters anything. See `docs/development/permissions-and-roles.md`.

**Two-factor (TOTP):** opt-in per user. `UserAccount.twoFactorSecret` stores the AES-256-GCM ciphertext of the base32 seed (`null` = never enrolled) and `twoFactorEnabledAt` stays `null` while enrollment is pending. An enrolled user's login lands on `authentication/routes/two-factor-challenge.tsx` before the session is issued — anything that changes the login path must keep that hop intact. Server side: `totp.server.ts`, `start-two-factor-enrollment.server.ts`, `verify-two-factor-challenge.server.ts`.

### Form validation

```typescript
// Schema: features/territories/schemas/territory.schema.ts
export const territorySchema = z.object({ number: z.string().min(1) })

// Action:
const submission = parseWithZod(formData, { schema: territorySchema })
if (submission.status !== 'success') return submission.reply()
```

### Error handling

Service functions return `null` for not-found; throw `AppError` subclasses for business rule violations. Routes decide whether to redirect or show an error.

```typescript
// Service: throw for violations
if (duplicate) throw new ConflictError('Territory number already exists')

// Route: handle null → redirect
const territory = await getTerritory(db, id)
if (!territory) throw redirect('/territories')
```

### Audit trail

```typescript
// After every write in a service function:
audit({
  action: AuditAction.TerritoryUpdated,
  congregationId,
  actorId,
  entityType: 'Territory',   // Prisma model name
  entityId: territory.id,
  metadata: { changes },
})
```

`audit()` is fire-and-forget (never throws). Use `auditInTransaction(tx, entry)` only when atomicity is required.

### Multi-tenancy / RLS

```typescript
// withScope sets SET LOCAL app.congregation_id for the duration of the transaction
await withScope(congregationId, async db => {
  return db.territory.findMany()  // RLS returns only this congregation's territories
})

// In routes, prefer the context helper:
return withScopeFromContext(context, async db => { ... })
```

**RLS policy rule:** Always use `CASE WHEN NULLIF(current_setting(...), '') IS NULL THEN true ELSE ... END` — never `OR` (optimizer may reorder branches). See `docs/development/row-level-security.md`.

### Feature limits

```typescript
const congregation = getCongregationFromContext(context)
const limits = new LimitService(db, congregation)
await limits.errorIfWouldGoOverLimit('territories')  // throws LimitReachedError if at limit
await createTerritory(db, ...)
```

## Common Pitfalls to Avoid

- ❌ **Don't put business logic in routes** — Delegate to service functions in `features/*/server/`
- ❌ **Don't write `db.*.create/update/delete` in route files** — Zero inline DB writes in routes
- ❌ **Don't bypass aggregates** — `db.member.update`, `db.attribution.create`, etc. outside their respective `*.aggregate.ts` files fails `pnpm test:aggregate-boundaries`. Call the aggregate's exported function instead. Allowlist: `import-*.server.ts` orchestrators, `*.test.*` files, and `app/tests/` infra.
- ❌ **Don't mix reads and writes in one file** — `*.aggregate.ts` files do not export `findMany`/`count`/`aggregate` helpers (single-row `findFirst`/`findUnique` are fine for preconditions); query files do not call `create`/`update`/`delete`. See [CQRS-lite](docs/development/architecture-conventions.md#cqrs-lite-readwrite-split-within-a-feature).
- ❌ **Don't deep-import another feature** — Import from `~/features/X` (client-safe) or `~/features/X/index.server` (server-only), not `~/features/X/server/...` or `~/features/X/ui/...`. Enforced by `pnpm test:boundaries` + `pnpm test:server-barrel-exports`.
- ❌ **Don't `throw redirect()` from service functions** — Only in route guards and middleware
- ❌ **Don't use `findUnique` on compound keys** — `Setting` and `EventKind` have `[key, congregationId]` compound unique; use `findFirst({ where: { key } })` instead
- ❌ **Don't use `prisma migrate dev` in CI/scripts** — Non-interactive; use `migrate diff` + `migrate deploy`
- ❌ **Don't add `.server.ts` to files in `features/*/model/`** — These are shared between client and server; the suffix causes bundler errors
- ❌ **Don't read flash messages in individual route loaders** — The authenticated layout already reads them; double-reading causes duplicate toasts
- ❌ **Don't omit `congregationId` in `db.*.create()`** — Pass the real value explicitly (`congregationId: params.congregationId`). RLS *filters* reads and blocks cross-tenant writes, but it does not populate the column on insert. (An older `congregationId: 0 as number` placeholder convention is gone — it appears nowhere in the codebase.)
- ❌ **Don't use `any` type** — TypeScript strict mode is enforced everywhere except explicit `noExplicitAny` suppressions
- ❌ **Don't create circular imports between features** — Features must be independent; use `shared/` for cross-feature utilities

## Gotchas

- **`.env` files are not readable** via the Read tool or `cat` — derive env vars by grepping `process.env\.` in `app/`.
- **Job handlers** live in `app/features/{feature}/jobs/handle-*-work.server.ts`, not under `server/`. Worker imports them from `app/workers/worker.server.ts`.
- **Email templates** are colocated per feature (`app/features/{feature}/emails/*.tsx`); the `pnpm start:emails` dev server is configured with `--dir app/features`.
- **Built-in role memberships are auto-synced** from `Member` flags (`isPublisher`, `type`, `isMale`, `baptismDate`, `isAnointed`, `isHelder`, `isServant`, `leftAt`). All `Member` mutations go through `app/features/publishers/server/member.aggregate.ts`, which calls `syncBuiltInRoleAssignments` internally — callers never invoke it directly. Route callers use `memberAggregate.setLifecycle('left'|'returned'|'active'|'inactive')`, `togglePublisher`, `updateIdentity`, etc. Identity-role assignments live on `MemberRoleAssignment`; management/custom roles on `UserRoleAssignment` (UserAccount-bound).
- **Member anonymize preconditions** (Wave 8): `memberAggregate.anonymize` throws `ConflictError` if the member is a `PublisherGroup.responsible` — the FK is required + unique in the schema, so admins must reassign the group's responsibility first. On success it nulls `Member.publisherGroupId` and clears any `PublisherGroup.deputyId` pointing at the member.
- **Member vs UserAccount FK rule of thumb**: action requires login → `UserAccount`; subject is a person in the congregation → `Member`. See `docs/development/coding-conventions.md` for the full table.

## Known gaps

- **Pre-2.0 archive import**: handled by `migrateLegacyUsersNdjson` in `import-congregation.server.ts` — v1.x archives are split into `members.ndjson` + `user-accounts.ndjson` in memory before the regular import path runs. Placeholder-email accounts (`*.placeholder.unitae.app`) are dropped on the fly.
- **Retention cron** (Wave 8): a daily BullMQ scheduled job (`app/features/settings/jobs/handle-retention-work.server.ts`) auto-anonymizes members whose `leftAt` is older than `DEFAULT_RETENTION_MONTHS` (6). Runs at `RETENTION_CRON_HOUR_UTC` (03:00 UTC). Skips group responsibles with a warning log (they need admin reassignment first — anonymize would throw `ConflictError`). Per-congregation override for the retention window is a future wave.

## Environment Configuration

Minimum required `.env`:

```ini
DB_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
DB_RUNTIME_URL="postgresql://unitae_app:unitae_app@localhost:5432/unitae_dev"  # Non-superuser for RLS enforcement
UNITAE_SESSION_SECRET="a-long-random-string"
REDIS_HOST="localhost"
REDIS_PORT="6379"
RESEND_API_KEY="re_..."                # Email sending
```

Optional:

```ini
GOOGLE_MAPS_API_KEY=""                 # Enables territory maps and PDF map exports
GOOGLE_MAPS_MAP_ID=""                  # Custom styled map
S3_ENDPOINT=""                         # S3-compatible storage (fallback: local ./content/uploads/)
S3_BUCKET=""
S3_ACCESS_KEY=""
S3_SECRET_KEY=""
UNITAE_MULTI_TENANT="true"             # Enables /register route for SaaS mode
UNITAE_COOKIE_DOMAIN=".unitae.app"     # Cookie scoping for multi-subdomain SaaS
UNITAE_OPEN_DATA_ALLOWLIST=""          # Extra comma-separated hosts for BANO sync (SSRF allowlist), added to the built-in OPEN_DATA_DEFAULT_HOSTS defaults
LOGIN_RATE_LIMIT_IP_MAX="10"           # Max failed login attempts per client IP per 15 min (default 10)
LOGIN_RATE_LIMIT_GLOBAL_MAX="100"      # Max failed login attempts instance-wide per 15 min (default 100)
```

**Prisma config:** Uses `prisma.config.ts` with `import 'dotenv/config'` — no `url` field in `schema.prisma`.

## Troubleshooting

| Issue | Solution |
|-------|---------|
| `Cannot find module '~/database/generated/...'` | Run `pnpm prisma generate` |
| Lint errors after schema changes | Run `pnpm build:format` to auto-fix most; check for new `biome-ignore` needs |
| Integration tests fail with RLS errors | Ensure `DB_RUNTIME_URL` points to the `unitae_app` role (not superuser) |
| `prisma migrate dev` hangs in terminal | Use `prisma migrate diff --script` + manual migration + `prisma migrate deploy` |
| Session not persisting in dev | Check `UNITAE_SESSION_SECRET` is set; cookie lifetime is 8h in dev, 1h in prod |
| Port already in use | `lsof -i :5173` (dev server) or `lsof -i :9090` (worker health) |
| Worker not processing jobs | Start with `pnpm start:worker`; check Redis connection via `REDIS_HOST`/`REDIS_PORT` |
| `compound key` TypeScript error | Pass `congregationId` explicitly in the `data` of the create call; for `where` on a compound unique use the generated key (e.g. `id_congregationId: { id, congregationId }`) |
| Flash toast appearing twice | Remove `session.flash()` reads from individual route loaders — layout handles it |

## Commit Message Format

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding tests
- `docs`: Documentation changes
- `chore`: Maintenance tasks
- `build`: Build system or dependency changes
- `perf`: Performance improvement

**Examples:**

```
feat(territories): add favourite toggle for attributions

fix(auth): resolve session expiry on concurrent requests

refactor(publishers): extract activity aggregation to service function

test(settings): add integration tests for update-user role replacement

chore(lint): configure Biome overrides to eliminate per-line suppressions

build(deps): bump Prisma from 7.0.0 to 7.1.0
```

## Additional Documentation

Detailed guides are in `docs/development/`:

| File | Content |
|------|---------|
| `architecture-conventions.md` | Feature shape, `index.ts` boundaries, aggregate doctrine, CQRS-lite, file-size budgets, TDD discipline |
| `architecture.md` | Request flow, multi-tenancy model, audit logging patterns |
| `row-level-security.md` | PostgreSQL RLS policies, `withScope`, connection pool safety |
| `coding-conventions.md` | Style rules, service layer mechanics, Member vs UserAccount FK rule, language conventions |
| `background-processing.md` | BullMQ worker architecture, queue names, job data shapes |
| `getting-started.md` | Local environment setup from scratch |
| `testing.md` | Unit / integration / E2E setup and conventions |
| `permissions-and-roles.md` | Permission enum, built-in vs custom roles, effective-permission resolution |
| `internationalization.md` | Paraglide setup, message keys, locale handling |
| `notifications.md` | Notification events, preferences, flush worker |
| `data-transfer.md` | Congregation import/export and archive format |
| `email-templates.md` | React Email templates, per-feature colocation |

---

**Note for AI Agents**: This file is your primary reference for understanding and contributing to this codebase. Always consult this document before making changes. When in doubt about a pattern, read an existing similar implementation before writing new code — the codebase is consistent and existing patterns are the ground truth.
