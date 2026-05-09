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
   - Business logic → `features/*/server/*.server.ts`
   - Route handlers → `features/*/routes/*.tsx`
   - Feature-specific UI → `features/*/ui/`
   - Type definitions → `features/*/model/*.type.ts`
   - Form schemas → `features/*/schemas/*.schema.ts`
3. **Zero inline DB writes in routes** — `db.*.create()`, `db.*.update()`, `db.*.delete()` calls belong in service functions, never in route loaders or actions
4. **Always use `withScopeFromContext`** — Every authenticated route that touches the DB must wrap its logic in `withScopeFromContext(context, async db => { ... })`
5. **Thread `actorId`** — Every service function that writes data must accept `actorId: number` and call `audit()` after the write
6. **No `throw redirect()` in service functions** — Redirects are only allowed in route guards, middleware, and session validation
7. **Black-box testing** — Assert on observable outcomes; never spy on implementations
8. **TypeScript strict mode** — Never use `any`; always define proper interfaces

### After Making Changes

Run the complete quality check:

```bash
pnpm test:unit && pnpm test:lint && pnpm test:typecheck
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
├── routes/                   # Shell routes (_index, health, suspended)
├── features/
│   ├── authentication/       # Login, session, password reset, consent, profile
│   ├── authorization/        # Role resolution
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
│   ├── domain/               # audit, congregation, consent, limits, retention, setup
│   ├── errors/               # AppError hierarchy (NotFoundError, ConflictError, …)
│   ├── hooks/                # useDebouncedValue, useOnlineStatus, useUnsavedChanges, …
│   ├── infra/                # db, redis, mailer, file-storage, logger, queues
│   ├── middleware/           # requireAuth
│   ├── types/                # role, entrance, publisher-type, setting-key enums
│   ├── ui/                   # Shared components (shadcn/ui + PageHeader, RelativeTime, …)
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
| Auth middleware | `app/shared/middleware/auth.server.ts` |
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

# Database
pnpm prisma generate        # Regenerate client after schema changes
pnpm prisma migrate deploy  # Apply migrations (prod / CI)
pnpm prisma db seed         # Seed initial roles and default data

# Infrastructure (dev)
docker compose -f docker/docker-compose.dev.yml up -d
```

## Code Style Guidelines

Enforced by **Biome 2.4.13** (`pnpm build:format` auto-fixes most issues):

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
| `*.type.ts` | TypeScript type/interface definitions |
| `*.schema.ts` | Conform + Zod form validation schemas |
| `*.routes.ts` | Route configuration |
| `*-queue.server.ts` | BullMQ queue definitions |
| `handle-*-work.server.ts` | Background job handlers |
| PascalCase `.tsx` | React components |
| camelCase `.ts` | Utilities and services |

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

**Auth model:** `Permission` (20 entries, in `app/shared/types/permission.ts`) is the unit of access. **Roles** (DB table) bundle permissions and are assigned to users — built-in roles plus custom roles a Roles Manager creates. `requireAuth()` runs `resolveEffectivePermissions` and stores the user's full granted set in `permissionsContext`; the legacy `_required` parameter is retained for call-site compatibility but no longer filters anything. See `docs/development/permissions-and-roles.md`.

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
- ❌ **Don't `throw redirect()` from service functions** — Only in route guards and middleware
- ❌ **Don't use `findUnique` on compound keys** — `Setting` and `EventKind` have `[key, congregationId]` compound unique; use `findFirst({ where: { key } })` instead
- ❌ **Don't use `prisma migrate dev` in CI/scripts** — Non-interactive; use `migrate diff` + `migrate deploy`
- ❌ **Don't add `.server.ts` to files in `features/*/model/`** — These are shared between client and server; the suffix causes bundler errors
- ❌ **Don't read flash messages in individual route loaders** — The authenticated layout already reads them; double-reading causes duplicate toasts
- ❌ **Don't use `congregationId: <real value>` in `db.*.create()`** — Use `congregationId: 0 as number`; RLS injects the real value at runtime
- ❌ **Don't use `any` type** — TypeScript strict mode is enforced everywhere except explicit `noExplicitAny` suppressions
- ❌ **Don't create circular imports between features** — Features must be independent; use `shared/` for cross-feature utilities

## Gotchas

- **`.env` files are not readable** via the Read tool or `cat` — derive env vars by grepping `process.env\.` in `app/`.
- **Job handlers** live in `app/features/{feature}/jobs/handle-*-work.server.ts`, not under `server/`. Worker imports them from `app/workers/worker.server.ts`.
- **Email templates** are colocated per feature (`app/features/{feature}/emails/*.tsx`); the `pnpm start:emails` dev server is configured with `--dir app/features`.
- **Built-in role memberships are auto-synced** from `User` boolean fields. After editing `isPublisher`, `isMale`, `baptismDate`, `isAnointed`, `isHelder`, or `isServant`, call `syncBuiltInRoleAssignments` (`app/shared/domain/built-in-roles.server.ts`).

## Known gaps

- **#170** — the data-transfer export (`ENTITY_FILES` in `app/features/settings/server/data-transfer.type.ts`) silently drops 11 feature tables added since the export feature shipped (custom roles, allowed-roles, external speakers, card overlays, perimeter, board section visibility). Bump `ARCHIVE_VERSION` if you fix it.
- **#171** — `BoardDocumentVersion` and `BoardDynamicDocumentSettings` carry `congregationId` but have no `CREATE POLICY` in any migration. They're reached only through scoped Prisma queries today; the database-side guarantee is missing.
- **Notification recipient resolver** (`app/features/notifications/server/resolve-recipients.server.ts`) reads `CongregationUserPermission` directly; users who hold a permission only via a custom role aren't picked up.

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
MULTI_TENANT="true"                    # Enables /register route for SaaS mode
UNITAE_COOKIE_DOMAIN=".unitae.app"     # Cookie scoping for multi-subdomain SaaS
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
| `compound key` TypeScript error | Use `congregationId: 0 as number` in create calls; RLS fills the real value |
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
| `architecture.md` | Request flow, multi-tenancy model, audit logging patterns |
| `row-level-security.md` | PostgreSQL RLS policies, `withScope`, connection pool safety |
| `coding-conventions.md` | Feature-based structure, naming rules, service layer contracts |
| `background-processing.md` | BullMQ worker architecture, queue names, job data shapes |
| `getting-started.md` | Local environment setup from scratch |

---

**Note for AI Agents**: This file is your primary reference for understanding and contributing to this codebase. Always consult this document before making changes. When in doubt about a pattern, read an existing similar implementation before writing new code — the codebase is consistent and existing patterns are the ground truth.
