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
docker compose -f docker-compose.dev.yml up -d  # Start PostgreSQL + Redis
```
```ini
DATABASE_URL="postgresql://unitae:unitae@localhost:5432/unitae_dev"
RESEND_API_KEY="re_123"
SESSION_SECRET="your-secret-key"
REDIS_HOST="localhost"
REDIS_PORT="6379"
GOOGLE_MAPS_API_KEY=""              # Optional — enables maps on territory pages and PDF exports
GOOGLE_MAPS_MAP_ID=""               # Optional — enables custom styled maps
```

## Architecture Overview

### FSD-Inspired Project Structure

```
app/
├── root.tsx, entry.*, routes.ts, tailwind.css   # App shell
├── routes/                   # Shell routes (_index, health, suspended)
├── features/
│   ├── authentication/       # server/, routes/, model/
│   ├── authorization/        # server/, model/
│   ├── board/                # server/, routes/, ui/
│   ├── events/               # server/, routes/, ui/, model/
│   ├── platform-admin/       # server/, routes/
│   ├── publishers/           # server/, routes/, ui/
│   ├── settings/             # server/, routes/
│   └── territories/          # server/, routes/, ui/, model/
├── shared/
│   ├── libs/                 # db, redis, logger, mailer, crypto, pagination, file-storage, congregation, limits
│   ├── types/                # entrance, user-input, setting keys
│   └── ui/                   # HeroHeader, Pagination, AlertMessages, DeleteButton, DeleteLink, S13ExportButton
├── database/                 # schema.prisma, migrations/, seed.ts, generated/ (gitignored)
```

Each feature owns all its code through consistent segments:
- `server/` — Server-side business logic and service functions
- `routes/` — Route components (referenced from `app/routes.ts`)
- `ui/` — Feature-specific UI components
- `model/` — TypeScript type definitions

### Data Isolation

**Congregation model**: Each congregation record isolates its data. 12 models carry a `congregationId` FK. `UserRole` is global (shared role definitions).

**Scoped queries** (`app/shared/libs/db.server.ts`):
- `db` and `unscopedDb` are the **same** `PrismaClient` instance — there is no Prisma extension or automatic injection
- Tenant isolation relies on **PostgreSQL Row-Level Security (RLS)**: scoped tables have policies that filter by `current_setting('app.congregation_id')`
- `withScope(congregationId, fn)` — Runs `fn` inside a `$transaction` that first executes `SET LOCAL app.congregation_id`. The `SET LOCAL` is automatically rolled back when the transaction ends, preventing context leakage through the connection pool
- Without `SET LOCAL` (i.e., outside `withScope`), RLS policies permit all rows — this is the "unscoped" mode used for login, setup, health, password reset, and platform admin
- All authenticated route loaders/actions that access tenant-scoped data must wrap their DB calls in `withScope(congregationId, async db => { ... })`

**Congregation context** (`app/shared/libs/congregation.server.ts`):
- `verifySession()` resolves congregation info and sets context via `congregationContext.enterWith()`
- `requireCongregation()` / `getCongregationFromContext()` — access congregation branding (displayName, emailFrom, baseUrl)

### Authentication & Authorization

**Authentication**:
- Cookie-based sessions via `createCookieSessionStorage`
- `verifySession(request)` — returns `{ currentUser, congregation, session }`, sets congregation context
- Session maxAge: 1 hour production, 8 hours development
- `SESSION_SECRET` required (validated at startup via `env.server.ts`)
- Login rate limiting: 5 attempts per 15 min per email via Redis

**Role system** (congregation-scoped):
- `UserRole` — Global role definitions (14 roles: Admin, BoardUploader, TerritoriesManager, etc.)
- `CongregationUserRole` — Explicit join: `userId + roleId + congregationId`
- `verifyRole(request, roleKey)` — queries `CongregationUserRole` with congregation context

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
- Examples: `findBuildingsPaginated()`, `getPublishers()`, `findActiveAttributionsPaginated()`

**Database Layer**:
- Prisma ORM with PostgreSQL via `@prisma/adapter-pg`
- Schema at `app/database/schema.prisma`
- Generated client at `app/database/generated/` (gitignored)
- Config at `prisma.config.ts` (project root)
- Migrations run separately (not on app startup)

**File Storage** (dual driver):
- **S3**: used when `S3_ENDPOINT` is set. Configured via `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- **Local filesystem**: used when `S3_ENDPOINT` is not set. Files stored in `content/uploads/` (configurable via `LOCAL_STORAGE_PATH`)
- Key pattern: `{congregationId}/{feature}/{uuid}.pdf`

**Background Jobs** (BullMQ):
- `syncQueue` in `app/features/territories/server/sync-queue.server.ts`
- `handleSyncWork` in `app/features/territories/server/handle-sync-work.server.ts`
- Worker at `workers/sync-worker.server.ts` with HTTP health server on port 9090
- Jobs carry `congregationId` — worker sets congregation context before processing
- Worker concurrency: 1 for sync operations

**Email**:
- Resend API via `app/shared/libs/mailer.server.ts`
- React Email templates in `emails/` directory
- Sender address: per-congregation `emailFrom` or default `Unitae <noreply@unitae.app>`
- All email sends wrapped in try/catch with logging

**Feature Limits** (`app/shared/libs/limits.server.ts`):
- `LimitService` class reads nullable limit columns from `Congregation` record
- When limit columns are `null` (default), resources are unlimited
- Limit checks are called in route actions before creating publishers, territories, users, board documents
- `LimitError` thrown when a limit is reached
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

**Information Board** (`features/board/`):
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
- **Test style**: Black-box testing — assert on observable outcomes, no spy assertions
- **Config**: `vitest.config.ts` at project root (separate from `vite.config.ts` to avoid reactRouter plugin issues)
- **Mocking**: `vi.mock()` for `db.server`, `redis.server`, `crypto.server` — mock return values, assert on results
- TypeScript strict mode enabled
- Biome linting with custom rules (no console.log in production)
- Prisma generates types from schema
- Startup env validation for `DATABASE_URL` and `SESSION_SECRET`
- `requireParamId()` utility for safe route param parsing

### Gotchas & Patterns

- **Prisma 7**: No `url` in schema — use `prisma.config.ts` with `import 'dotenv/config'` for env loading
- **Prisma generate**: Run `pnpm prisma generate` after schema changes — generated client is in `app/database/generated/` (gitignored)
- **Custom migrations**: Use `pnpm prisma migrate diff --from-config-datasource --to-schema app/database/schema.prisma --script` to generate SQL, create migration dir manually with `mkdir -p app/database/migrations/{timestamp}_{name}`
- **Tenant scoping placeholder**: RLS injects `congregationId` at runtime but TS requires it at compile time — use `congregationId: 0 as number` in create calls on scoped models
- **`db` vs `unscopedDb`**: Both reference the same PrismaClient. The distinction is semantic only. Use `withScope(congregationId, ...)` for tenant-scoped queries. Use `db`/`unscopedDb` directly (without `withScope`) for cross-tenant operations: login, password reset, setup, health check, platform admin, seed.
- **`findUnique` on compound keys**: Setting and EventKind have compound unique `[key, congregationId]` — use `findFirst({ where: { key } })` instead, the extension adds `congregationId`
- **Biome suppress for Prisma/AWS**: Prisma compound keys (`key_congregationId`) and AWS SDK properties (`Bucket`, `Key`) need `biome-ignore lint/style/useNamingConvention` suppression
- **Non-interactive Prisma CLI**: `prisma migrate dev` fails in non-interactive shells — use `migrate diff` + manual migration + `migrate deploy`
- **`LimitService` pattern**: Always call `requireCongregation()` first, then `new LimitService(congregation)`, then `await limits.errorIfWouldGoOverLimit('name')` before `db.*.create()` calls

## Development Notes

The application follows Conventional Commits. French is the primary language for UI and comments.

Session cookies: 1 hour production, 8 hours development. Cookie domain configurable via `COOKIE_DOMAIN` env var.

## Production

- `Dockerfile` — Multi-stage build (node:22-slim) with `runtime` and `migrate` targets
- `.github/workflows/continuous-deployment.yml` — Builds and pushes Docker images to GHCR
- Kubernetes deployment manifests are managed in the private `unitae-platform` repository
