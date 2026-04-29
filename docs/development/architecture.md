# Architecture

## High-Level Architecture

```
                         ┌──────────────────┐
                         │  Reverse Proxy   │
                         │   your.domain    │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼──────┐ ┌────▼─────┐ ┌─────▼─────┐
              │  Web Pod   │ │ Web Pod  │ │ Web Pod   │
              │ (port 8080)│ │(port 8080│ │(port 8080)│
              └─────┬──────┘ └────┬─────┘ └─────┬─────┘
                    │             │             │
         ┌──────────┴─────────────┴─────────────┘
         │
    ┌────▼─────┐    ┌───────┐    ┌──────────┐    ┌──────────────┐
    │PostgreSQL│    │ Redis │    │  Worker  │    │ File Storage │
    │   (PVC)  │    │ (PVC) │    │ (BullMQ) │    │ (S3 or local)│
    └──────────┘    └───────┘    └──────────┘    └──────────────┘
```

## Multi-Tenancy Model

```
┌─────────────────────────────────────────────────────────┐
│                      Platform                           │
│                                                         │
│  ┌─────────────────┐  ┌──────────────────┐              │
│  │ Congregation A  │  │  Congregation B  │   ...        │
│  │ (slug: lyon)    │  │  (slug: paris)   │              │
│  │                 │  │                  │              │
│  │  Users          │  │  Users           │              │
│  │  Territories    │  │  Territories     │              │
│  │  Buildings      │  │  Buildings       │              │
│  │  Attributions   │  │  Attributions    │              │
│  │  Activities     │  │  Activities      │              │
│  │  Events         │  │  Events          │              │
│  │  Settings       │  │  Settings        │              │
│  │  Board Docs     │  │  Board Docs      │              │
│  └─────────────────┘  └──────────────────┘              │
│                                                         │
│  Global: UserRole (14 role definitions)                 │
│  Global: PasswordResetToken, EmailVerificationToken     │
└─────────────────────────────────────────────────────────┘
```

## Request Flow

1. **Reverse Proxy** (Traefik/Nginx) routes incoming requests to web pods
2. **React Router** matches route, runs middleware then loader/action
3. **`requireAuth(roles)`** middleware (from `app/shared/middleware/auth.server.ts`) authenticates user, resolves permissions, checks GDPR consent, and sets typed context
4. **Loader/action** reads context via `context.get(userContext)`, `context.get(congregationContext)`, `context.get(permissionsContext)`
5. **`withScopeFromContext(context, fn)`** opens a PostgreSQL transaction with `SET LOCAL` for Row-Level Security
6. **Service functions** (`features/*/server/`) receive the scoped `TransactionClient` and handle business logic
7. **Route component** renders with loader data

```
Middleware → requireAuth([Role.X, Role.Y])
           → verifySession(request)     // authenticates user, returns congregation
           → verifyRole(request, role)  // checks permissions (via Promise.all)
           → context.set(userContext, currentUser)
           → context.set(congregationContext, congregation)
           → context.set(permissionsContext, permissions)

Route     → context.get(userContext)             // read current user
          → withScopeFromContext(context, async db => { ... })
          → db is a TransactionClient scoped by RLS
          → service functions receive db as first parameter
```

## Data Isolation

Tenant isolation uses **PostgreSQL Row-Level Security (RLS)** activated via `SET LOCAL` inside transactions.

- **`db` and `unscopedDb`** are the **same** `PrismaClient` instance — there is no Prisma extension or automatic injection
- **`withScope(congregationId, fn)`** runs `fn` inside a `$transaction` that first executes `SET LOCAL app.congregation_id = '<id>'`. The `SET LOCAL` is automatically rolled back when the transaction ends, preventing context leakage through the connection pool
- Without `SET LOCAL` (outside `withScope`), RLS policies permit all rows — this is the "unscoped" mode

When to use each:

| Context | Method | Example |
|---------|--------|---------|
| Authenticated routes | `withScope(congregationId, async db => { ... })` | Territory list, publisher creation |
| Login, setup, health | `unscopedDb` directly | Password validation, health check |
| Background workers | `withScope(congregationId, ...)` or `unscopedDb` | Sync jobs use `withScope`, email jobs use `unscopedDb` with explicit `where` |
| Platform admin | `unscopedDb` | Cross-congregation queries |

**Scoped models** (28 — all carry `congregationId` and are isolated by RLS):
- **Auth**: User, CongregationUserRole
- **Board**: BoardSection, BoardDocument, BoardDocumentVersion, BoardDynamicDocumentSettings
- **Territories**: Territory, Attribution, Building, BuildingEntrance, BuildingAccess, BuildingResidentialData
- **Publishers**: PublisherGroup, PublisherActivity
- **Events**: Event, EventKind, ProgrammeTemplate, ProgrammeTemplatePart, ProgrammeTemplateServiceRole, ProgrammePartAssignment, ProgrammeServiceRoleAssignment, ProgrammeTemplateResponsible
- **Settings**: Setting
- **Notifications**: NotificationEvent, NotificationPreference
- **GDPR / Audit**: AuditLog, DataDeletionRecord, ConsentRecord

**Global models** (5 — no `congregationId`, not scoped by RLS): Congregation, UserRole, PasswordResetToken, EmailVerificationToken, BoardDynamicDocumentView

## Authentication & Role Flow

```
Login → validateCredentials(email, password)
      → set session cookie (userId)
      → redirect to /

Protected Route → requireAuth([roles]) middleware on layout route
                → verifySession: fetch user (unscopedDb), check suspension/trial/email
                → verifyRole: check CongregationUserRole (unscopedDb, via Promise.all)
                → context.set(userContext, currentUser)
                → context.set(congregationContext, congregation)
                → context.set(permissionsContext, Set<Role>)

Role Check → context.get(permissionsContext).has(Role.TerritoriesViewer) → boolean
           (resolved during requireAuth middleware, no extra DB query)
```

## Redis Architecture

Two Redis clients serve different purposes:

| Client | Timeout | Purpose |
|--------|---------|---------|
| `redis` | 60s command, infinite retries | BullMQ queues (needs long timeouts for job processing) |
| `redisRateLimit` | 2s command, 0 retries | Login/password-reset rate limiting (fails fast to avoid blocking login) |

Both share the same host/port/password configuration.

## File Storage

Two storage drivers, selected automatically based on `S3_ENDPOINT`:

| Condition | Driver | Storage location |
|-----------|--------|------------------|
| `S3_ENDPOINT` is set | S3 | S3-compatible bucket |
| `S3_ENDPOINT` is absent | Local filesystem | `content/uploads/` (configurable via `UNITAE_STORAGE_PATH`) |

Key structure: `{congregationId}/{feature}/{uuid}.pdf`

## Google Maps Integration

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_MAPS_API_KEY` | No | Enables map rendering on territory pages and static maps in PDF exports |
| `GOOGLE_MAPS_MAP_ID` | No | Enables custom styled maps (requires API key) |

When not set, map features are silently disabled.

## PDF Generation

All PDF generation runs **server-side only** using `@react-pdf/renderer`. The library references Node.js globals (`process.env`) that are unavailable in the browser — never use `PDFDownloadLink` or `PDFViewer` in client components.

### Shared utility

`app/shared/infra/pdf.server.ts` exposes a single helper used by every PDF route:

```ts
renderPdfResponse(document: ReactElement<DocumentProps>, filename: string): Promise<Response>
```

It renders the JSX document to a buffer and returns a `Response` with `Content-Type: application/pdf` and `Content-Disposition: attachment`.

### Pattern

PDF downloads are plain `<a href="/path/to/pdf">` links pointing to a dedicated loader route. The loader fetches the data, calls `renderPdfResponse`, and returns the response directly — no action, no form.

```ts
// Example: app/features/.../pdf-download.tsx
export async function loader({ params, context }: Route.LoaderArgs) {
  // 1. Check permissions
  // 2. Fetch data
  return renderPdfResponse(<MyDocument {...data} />, 'filename.pdf')
}
```

### Existing PDF routes

| Route | File | Description |
|-------|------|-------------|
| `GET /territories/territory/:id/pdf` | `territories/routes/territory/pdf-download.tsx` | Individual territory card — accessible to `TerritoriesViewer` or the attributed publisher |
| `GET /publishers/:id/activity/pdf` | `publishers/routes/publishers/activity-pdf.tsx` | Publisher S-21 activity report |
| `GET /territories/attributions/export/:year/pdf` | `territories/routes/attributions/pdf-export.tsx` | S-13 annual attribution report |
| `GET /programs/export-pdf/download` | `events/routes/programs/export-pdf-download.tsx` | Programme PDF export |

### Business rules

`showPhoneOnTerritoryCard(phoneTypeActive: boolean)` in `territories/server/territory-pdf.server.ts` encodes the following invariant: when dedicated phone territory cards exist (`phoneTypeActive = true`), phone entrance data is only shown on those cards — not on regular territory cards. The inverse applies when no dedicated phone cards exist.

## Audit Logging

Fire-and-forget audit logging via `audit()` from `app/shared/domain/audit.server.ts`. Uses `unscopedDb` to write without RLS context. Never throws — audit failures are logged but don't block operations.

Actions tracked: user login/logout/creation/update/anonymization, role changes, data export, consent grant/withdrawal, password changes, board read status.

## Testing

```bash
pnpm test:unit              # Unit tests (Vitest, 441+ tests)
pnpm test:unit:watch        # Watch mode
pnpm test:unit:coverage     # With coverage report
pnpm test:integration       # Integration tests (requires running PostgreSQL)
pnpm test:e2e               # E2E tests (Playwright, requires running app)
pnpm test:e2e:headed        # E2E tests with browser visible
```

## Security

- **Session**: Cookie-based, `UNITAE_SESSION_SECRET` required, 1h (prod) / 8h (dev) maxAge
- **Passwords**: scrypt hashed with random salt, reset via 24h time-limited tokens
- **Email verification**: Required before accessing the app, 24h token expiry
- **Rate limiting**: Login (5/15min), password reset (3/15min) per email via Redis
- **Roles**: 14 congregation-scoped roles via CongregationUserRole
- **Files**: Congregation-scoped storage keys, UUID filenames
- **RLS**: PostgreSQL Row-Level Security for tenant data isolation

## Related

- [Row-Level Security](row-level-security.md) — How RLS enforces tenant isolation
- [Coding Conventions](coding-conventions.md) — Patterns, philosophy, and rules
- [Background Processing](background-processing.md) — BullMQ worker architecture
