# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Unitae is an open-source application for managing Jehovah's Witnesses congregations. Built as a monolithic React Router v7 application with TypeScript, PostgreSQL database, and Redis for background job processing.

## Essential Commands

### Development
```bash
pnpm start:dev              # Start development server
pnpm build                  # Build for production
pnpm start                  # Run production server
pnpm build:format           # Format and lint with Biome
pnpm test:lint              # Check linting only
pnpm test:typecheck         # Generate types and run TypeScript compiler
```

### Testing
```bash
pnpm test:unit              # Run unit tests once
pnpm test:unit:watch        # Run tests in watch mode
pnpm test:unit:coverage     # Run tests with coverage report
pnpm test:integration       # Run integration tests (against real database)
pnpm test:e2e              # Run Playwright E2E tests
pnpm test:e2e:headed       # Run E2E tests in headed browser
pnpm test:boundaries       # Check cross-feature import boundaries (eslint-plugin-boundaries)
```

### Database & Infrastructure
```bash
pnpm prisma migrate deploy  # Apply database migrations
pnpm prisma db seed         # Seed database with initial data
pnpm build:db              # Generate Prisma client
pnpm db:migrate            # Apply migrations (alias)
pnpm db:seed               # Seed database (alias)
pnpm start:emails          # Start email development server
pnpm start:worker          # Start sync background job worker (BullMQ)
```

### Environment Setup

**Development** - Start infrastructure and create `.env` file:
```bash
docker compose -f docker/docker-compose.dev.yml up -d  # Start PostgreSQL + Redis
```
```ini
DB_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
DB_RUNTIME_URL="postgresql://unitae_app:unitae_app@localhost:5432/unitae_dev"  # Optional — non-superuser for RLS enforcement
RESEND_API_KEY="re_123"
UNITAE_SESSION_SECRET="your-secret-key"
REDIS_HOST="localhost"
REDIS_PORT="6379"
GOOGLE_MAPS_API_KEY=""              # Optional — enables maps on territory pages and PDF exports
GOOGLE_MAPS_MAP_ID=""               # Optional — enables custom styled maps
```

## Documentation

The `docs/` folder contains detailed human-readable documentation. Consult it for architecture decisions, design rationale, and implementation guides:

- `docs/development/architecture.md` — system design, request flow, multi-tenancy model
- `docs/development/row-level-security.md` — PostgreSQL RLS implementation and policy patterns
- `docs/development/coding-conventions.md` — feature-based architecture, code organization
- `docs/development/background-processing.md` — BullMQ worker architecture
- `docs/development/getting-started.md` — local development environment setup

## Architecture Overview

### FSD-Inspired Project Structure

```
app/
├── root.tsx, entry.*, routes.ts, tailwind.css   # App shell
├── routes/                   # Shell routes (_index, health, suspended)
├── features/
│   ├── authentication/       # server/, routes/, schemas/
│   ├── authorization/        # server/, model/
│   ├── dashboard/            # server/, routes/
│   ├── display-board/        # server/, routes/, ui/, model/, schemas/
│   ├── events/               # server/, routes/, ui/, model/, schemas/
│   ├── platform-admin/       # server/, routes/, schemas/
│   ├── publishers/           # server/, routes/, ui/, schemas/
│   ├── settings/             # server/, routes/, schemas/
│   └── territories/          # server/, routes/, ui/, model/, schemas/
├── shared/
│   ├── auth/                 # auth wrapper, crypto, sanitize-user, route context
│   ├── domain/               # congregation, limits, audit, settings, retention, host-settings, consent, setup
│   ├── errors/               # AppError hierarchy (NotFoundError, ValidationError, ConflictError, etc.)
│   ├── hooks/                # Shared React hooks
│   ├── infra/                # db, redis, mailer, file-storage, logger, queues
│   ├── middleware/           # requireAuth middleware
│   ├── types/                # role, entrance, publisher-type, setting keys
│   ├── ui/                   # Shared UI components (shadcn/ui + custom)
│   └── utils/                # env, pagination, params, locale, cron, worker-locale, utils
├── database/                 # schema.prisma, migrations/, seed.ts, generated/ (gitignored)
```

Each feature owns all its code through consistent segments:
- `server/` — Server-side business logic and service functions
- `routes/` — Route components (referenced from `app/routes.ts`)
- `ui/` — Feature-specific UI components
- `model/` — TypeScript type definitions
- `schemas/` — Conform + Zod form validation schemas

### Data Isolation

**Congregation model**: Each congregation record isolates its data. 12 models carry a `congregationId` FK. `UserRole` is global (shared role definitions).

**Scoped queries** (`app/shared/infra/db.server.ts`):
- `db` and `unscopedDb` are the **same** `PrismaClient` instance — there is no Prisma extension or automatic injection
- Tenant isolation relies on **PostgreSQL Row-Level Security (RLS)**: scoped tables have `CASE`-based policies that safely cast `current_setting('app.congregation_id')` to int only when the value is non-empty (see `docs/development/row-level-security.md`)
- `withScope(congregationId, fn)` — Runs `fn` inside a `$transaction` that first executes `SET LOCAL app.congregation_id`. The `SET LOCAL` is automatically rolled back when the transaction ends, preventing context leakage through the connection pool
- Without `SET LOCAL` (i.e., outside `withScope`), RLS policies permit all rows — this is the "unscoped" mode used for login, setup, health, password reset, and platform admin
- All authenticated route loaders/actions that access tenant-scoped data must use `withScopeFromContext(context, async db => { ... })` to wrap their DB calls

**Congregation context** (`app/shared/domain/congregation.server.ts`):
- `requireCongregation()` / `getCongregationFromContext()` — access congregation branding (displayName, emailFrom, baseUrl)

### Authentication & Authorization

**Middleware pattern** (`app/shared/middleware/auth.server.ts`):
- Authenticated layout routes export `middleware = [requireAuth([...roles])]`
- `requireAuth()` verifies the session, resolves role permissions, checks GDPR consent, and sets typed context. **Only roles explicitly listed are resolved** — omitting a role means `permissions.has(Role.X)` is always `false`, silently hiding features. All 14 roles must be listed in `_authenticated-layout.tsx`.
- Loaders/actions read auth state via `context.get(userContext)`, `context.get(congregationContext)`, `context.get(permissionsContext)`
- `withScopeFromContext(context, async db => {...})` reads `congregationId` from context and runs the callback inside `withScope`

```typescript
// In _authenticated-layout.tsx
import { requireAuth } from '~/shared/middleware/auth.server'
export const middleware = [requireAuth([Role.Admin, Role.TerritoriesManager])]

// In a route loader
export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)
  return withScopeFromContext(context, async db => {
    return getPublishers(db)
  })
}
```

**Role system** (congregation-scoped):
- `UserRole` — Global role definitions (14 roles: Admin, BoardUploader, TerritoriesManager, etc.)
- `CongregationUserRole` — Explicit join: `userId + roleId + congregationId`
- Roles are resolved in middleware and available via `context.get(permissionsContext)`

**Platform admin**:
- `platformAdmin` boolean on `User` model
- Separate from congregation roles — grants access to `/platform-admin/` routes
- `verifyPlatformAdmin(request)` guard

**Password reset**:
- `PasswordResetToken` model with 24h expiration
- Tokens are `crypto.randomBytes(32)`, consumed on use

### Key Architectural Patterns

**Service layer** (`features/*/server/`):
- Business logic centralized in service functions (not in route loaders)
- Service functions take explicit parameters (no `request` object)
- Service functions receive `db: TransactionClient` as their first parameter
- **Zero inline DB writes in routes**: route files must NOT contain `db.*.create()`, `db.*.update()`, `db.*.delete()`, or `db.*.deleteMany()` calls directly — all write operations go through service functions
- Examples: `findBuildingsPaginated()`, `getPublishers()`, `findActiveAttributionsPaginated()`

**Form validation** (Conform + Zod):
- Feature schemas live in `features/*/schemas/*.schema.ts`
- Actions use `parseWithZod(formData, { schema })` to validate input
- On validation failure, return `submission.reply()` — Conform handles error display in the form
- Schemas define Zod objects with French error messages

```typescript
// features/publishers/schemas/publisher.schema.ts
export const publisherSchema = z.object({
  firstname: z.string().min(1),
  lastname: z.string().min(1),
})

// In route action
const submission = parseWithZod(formData, { schema: publisherSchema })
if (submission.status !== 'success') return submission.reply()
```

**Error handling** (`app/shared/errors/app-error.server.ts`):
- `AppError` — Abstract base class with `code` and `statusCode`
- `NotFoundError` — 404
- `ValidationError` — 400 (with field name)
- `ConflictError` — 409
- `ForbiddenError` — 403
- `LimitReachedError` — 429 (with limit name)
- Service functions throw these; route actions catch and convert to user-facing responses
- Unexpected errors bubble up to the error boundary

**Database Layer**:
- Prisma ORM with PostgreSQL via `@prisma/adapter-pg`
- Schema at `app/database/schema.prisma`
- Generated client at `app/database/generated/` (gitignored)
- Config at `prisma.config.ts` (project root)
- Migrations run separately (not on app startup)

**File Storage** (dual driver):
- **S3**: used when `S3_ENDPOINT` is set. Configured via `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- **Local filesystem**: used when `S3_ENDPOINT` is not set. Files stored in `content/uploads/` (configurable via `UNITAE_STORAGE_PATH`)
- Key pattern: `{congregationId}/{feature}/{uuid}.pdf`

**Background Jobs** (BullMQ):
- `syncQueue` in `app/features/territories/server/sync-queue.server.ts`
- `handleSyncWork` in `app/features/territories/server/handle-sync-work.server.ts`
- Worker at `app/workers/worker.server.ts` with HTTP health server on port 9090
- Jobs carry `congregationId` — worker sets congregation context before processing
- Worker concurrency: 1 for sync operations

**Email**:
- Resend API via `app/shared/infra/mailer.server.ts`
- React Email templates in `app/emails/` directory
- Sender address: per-congregation `emailFrom` or default `Unitae <noreply@unitae.app>`
- All email sends wrapped in try/catch with logging

**Feature Limits** (`app/shared/domain/limits.server.ts`):
- `LimitService` class reads nullable limit columns from `Congregation` record
- When limit columns are `null` (default), resources are unlimited
- Limit checks are called in route actions before creating publishers, territories, users, board documents
- `LimitReachedError` thrown when a limit is reached
- Storage limits checked separately via `checkStorageLimit(currentBytes, additionalBytes)`

**Suspension**:
- `verifySession()` checks `congregation.suspendedAt` — redirects to `/suspended` if set
- The `/suspended` route shows a message and optionally a billing link (configurable via env)

### Main Application Areas

**Territory Management** (`features/territories/`):
- Building prospection with open data sync
- Territory attribution to publishers
- PDF generation for territory cards
- Map integration for building locations
- Statistics and coverage reports

**Publisher Management** (`features/publishers/`):
- Activity tracking (hours, studies, publications)
- Publisher groups with responsible/deputy roles
- Statistics and report generation (Excel, PDF)

**Information Board** (`features/display-board/`):
- Document management with sections
- PDF upload to S3 and viewing
- Visibility controls and highlighting

**Event Management** (`features/events/`):
- Days off tracking
- Event kinds and programs

**Settings** (`features/settings/`):
- User management (within congregation)
- Territory and congregation configuration

**Platform Admin** (`features/platform-admin/`):
- Cross-congregation management
- User overview across all congregations

### Database Schema Highlights

**Data isolation**:
- `Congregation` — Record with branding (name, slug, domain, displayName, emailFrom, baseUrl) and optional plan/limit columns
- 12 models scoped by `congregationId`: User, Territory, Building, BuildingEntrance, Attribution, PublisherGroup, PublisherActivity, BoardSection, BoardDocument, Event, EventKind, Setting

**Auth**:
- `UserRole` — Global role definitions (14 roles)
- `CongregationUserRole` — Role assignments scoped per congregation
- `PasswordResetToken` — Time-limited reset tokens (24h)

**Core Entities**:
- `User` — Publishers, elders, servants with congregation membership
- `Territory` — Geographic areas with building entrances
- `Building` — Individual buildings with prospection data
- `Attribution` — Territory assignments to publishers
- `PublisherActivity` — Monthly field service reports

### File Naming Conventions

- `server/*.server.ts` — Server-side only code in feature server/ directories
- `*.routes.ts` — Route configuration files
- `model/*.type.ts` — TypeScript type definitions in feature model/ directories
- `schemas/*.schema.ts` — Conform + Zod form validation schemas
- `routes/_layout.tsx` — Route layout components
- `*-queue.server.ts` — BullMQ queue definitions
- `handle-*-work.server.ts` — Background job handlers
- Components use PascalCase, utilities use camelCase

### Code Style

Uses Biome for formatting with these key rules:
- Single quotes for JavaScript, double quotes for JSX
- 120 character line width
- Trailing commas everywhere
- Semicolons as needed (ASI)
- Space indentation

### Testing & Quality

- **Unit tests**: Vitest with co-located test files (`*.server.test.ts` next to source)
- **Integration tests**: Vitest with `*.integration.test.ts` files, run against real database via `pnpm test:integration`
- **E2E tests**: Playwright tests in `tests/e2e/*.spec.ts`, run via `pnpm test:e2e`
- **Boundary checks**: `eslint-plugin-boundaries` enforces cross-feature import rules via `pnpm test:boundaries`
- **Test style**: Black-box testing — assert on observable outcomes, no spy assertions
- **Testing client hooks**: Vitest runs in `environment: 'node'` (no DOM). Mock `react` and `react-router` entirely. Shim `globalThis.window` for browser APIs (`addEventListener`). Suppress `biome-ignore lint/correctness/useHookAtTopLevel` in test helpers that call hooks.
- **Config**: `vitest.config.ts` at project root (separate from `vite.config.ts` to avoid reactRouter plugin issues); `app/tests/vitest.config.integration.ts` for integration tests; `app/tests/playwright.config.ts` for E2E tests
- **Mocking**: `vi.mock()` for `db.server`, `redis.server`, `crypto.server` — mock return values, assert on results
- TypeScript strict mode enabled
- Biome linting with custom rules (no console.log in production)
- Prisma generates types from schema
- Startup env validation for `DB_URL` and `UNITAE_SESSION_SECRET`
- `requireParamId()` utility for safe route param parsing

### Gotchas & Patterns

- **Flash messages are global**: The authenticated layout reads `session.flash()` and displays toasts via Sonner. Individual route loaders must NOT also read flash messages — both loaders parse the same cookie independently, causing duplicate display (toast + inline alert). Use the global toast only.
- **Personal routes convention**: User-specific pages live under `/me/*` (profile, territories, days-off, consents). The `/me` prefix uses `features/authentication/routes/user/_layout.tsx` as layout. New personal features should follow this pattern.
- **Shared UI components**: `SubmitButton` (auto-disables during submission), `SearchInput` (debounced live search), `DeleteConfirmation` (entity details + cancel + impact), `PageBreadcrumb` (breadcrumb convenience wrapper), `RelativeTime` (Intl.RelativeTimeFormat), `UnsavedChangesDialog` (renders alert dialog from blocker state), `OfflineBanner`, `CommandPalette` (Cmd+K). `PageHeader` supports `breadcrumbs` and `backTo` props.
- **Shared hooks**: `useFocusError(actionData)` auto-focuses first invalid field, `useDebouncedValue(value, delay)`, `useUnsavedChanges()` returns `{ blocker, markDirty }` — manages dirty state internally, resets on form submission, blocks only cross-pathname navigations, `useOnlineStatus()`, `usePersistedState(key, default)` wraps localStorage.
- **Prisma 7**: No `url` in schema — use `prisma.config.ts` with `import 'dotenv/config'` for env loading
- **Prisma generate**: Run `pnpm prisma generate` after schema changes — generated client is in `app/database/generated/` (gitignored)
- **Custom migrations**: Use `pnpm prisma migrate diff --from-config-datasource --to-schema app/database/schema.prisma --script` to generate SQL, create migration dir manually with `mkdir -p app/database/migrations/{timestamp}_{name}`
- **Tenant scoping placeholder**: RLS injects `congregationId` at runtime but TS requires it at compile time — use `congregationId: 0 as number` in create calls on scoped models
- **RLS policies must use `CASE`, never `OR`**: PostgreSQL may reorder `OR` branches in RLS policies. After `SET LOCAL` reverts, pool connections have `app.congregation_id = ''`. If the optimizer evaluates `''::int` before the `IS NULL` guard, the cast fails. Always use `CASE WHEN NULLIF(current_setting(...), '') IS NULL THEN true ELSE ... END` — see `docs/development/row-level-security.md`
- **`db` vs `unscopedDb`**: Both reference the same PrismaClient. The distinction is semantic only. Use `withScopeFromContext(context, ...)` or `withScope(congregationId, ...)` for tenant-scoped queries. Use `db`/`unscopedDb` directly (without `withScope`) for cross-tenant operations: login, password reset, setup, health check, platform admin, seed.
- **`findUnique` on compound keys**: Setting and EventKind have compound unique `[key, congregationId]` — use `findFirst({ where: { key } })` instead, the extension adds `congregationId`
- **Biome suppress for Prisma/AWS**: Prisma compound keys (`key_congregationId`) and AWS SDK properties (`Bucket`, `Key`) need `biome-ignore lint/style/useNamingConvention` suppression
- **Non-interactive Prisma CLI**: `prisma migrate dev` fails in non-interactive shells — use `migrate diff` + manual migration + `migrate deploy`
- **`LimitService` pattern**: Always get congregation from context first, then `new LimitService(db, congregation)`, then `await limits.errorIfWouldGoOverLimit('name')` before `db.*.create()` calls
- **`.server.ts` suffix exceptions**: Files in `features/*/server/` that are pure functions used in client route components (e.g., `compute-territory-quantity.ts`) must NOT have the `.server.ts` suffix — React Router's bundler will reject them with "Server-only module referenced by client"
- **Shared model files for client+server**: Files in `features/*/model/` (e.g., `access-format.ts`, `territory-kind.type.ts`) are importable from both server and client code. Never add `.server.ts` suffix to these.
- **Zod version**: Must use Zod v3 (`zod@^3.25`), not v4 — `@conform-to/zod` v1.x imports `ZodEffects`/`ZodBranded` which were removed in Zod v4. Import as `from 'zod'` (not `from 'zod/v4'`)
- **Middleware context types**: The `context.set()` in middleware requires `RouterContext` type constraint: `context: { set<C extends RouterContext>(context: C, value: ...): void }`. Don't use plain object types.
- **File upload + Zod**: Routes with file uploads (e.g., `documents/new.tsx`) use `parseFormData` from `@mjackson/form-data-parser` first, then `parseWithZod` on the resulting FormData for text fields. Don't try to validate files through Zod.
- **`useBlocker` timing**: `useBlocker` fires synchronously *before* `navigation.state` updates — checking `useNavigation().state` in a boolean passed to `useBlocker` cannot detect in-flight form submissions. Use a `BlockerFunction` with pathname comparison instead.
- **Batch import path updates**: Use `find app workers -name '*.ts' -o -name '*.tsx' | xargs perl -pi -e 's|old-path|new-path|g'` — also update `vi.mock()` strings and dynamic `import()` calls in test files
- **Multi-queue worker**: `app/workers/worker.server.ts` runs 3 queues (sync concurrency 1, email concurrency 5, thumbnail concurrency 2). Queue names in `app/shared/infra/queues.server.ts`. Worker locale via `app/shared/utils/worker-locale.server.ts` + `runWithLocale()`.
- **Two Redis clients**: `redis` (60s timeout, for BullMQ) and `redisRateLimit` (2s timeout, for auth rate limiting) in `app/shared/infra/redis.server.ts`

## Development Notes

The application follows Conventional Commits. French is the primary language for UI text. English is used for code comments, test descriptions, commits, PRs, and documentation.

Session cookies: 1 hour production, 8 hours development. Cookie domain configurable via `UNITAE_COOKIE_DOMAIN` env var.

## Production

- `docker/Dockerfile` — Multi-stage build (node:22-slim) with `runtime` and `migrate` targets
- `.github/workflows/continuous-deployment.yml` — Builds and pushes Docker images to GHCR
- Kubernetes deployment manifests are managed in the private `unitae-platform` repository
