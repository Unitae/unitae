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
│  Global: PasswordResetToken, EmailVerificationToken,    │
│          CalendarFeedToken                              │
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

### Token-resolved public routes

A small number of routes are reachable without a Unitae session because the client (e.g. a calendar app) cannot send our authentication cookie. These routes authenticate the request with an opaque per-user token in the URL instead. The flow:

1. The route is registered **outside** the authenticated layout in `app/routes.ts` — no `requireAuth` middleware runs.
2. The loader looks up the token via `unscopedDb` (token tables have no `congregationId` and no RLS).
3. The loader resolves `congregationId` from the token's user record.
4. The loader wraps data queries in `withScope(congregationId, ...)`, exactly like authenticated routes — RLS enforces tenant isolation in the same way.

Currently used by `/feed/:token/calendar.ics` (personal calendar subscription). Reusable for any future read-only personal feed.

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

**Scoped models** (30 — all carry `congregationId` and are isolated by RLS):
- **Auth**: User, CongregationUserRole
- **Board**: BoardSection, BoardDocument, BoardDocumentVersion, BoardDynamicDocumentSettings
- **Territories**: Territory, Attribution, Building, BuildingEntrance, BuildingAccess, BuildingResidentialData, TerritoryCardOverlay, TerritoryPerimeter
- **Publishers**: PublisherGroup, PublisherActivity
- **Events**: Event, EventKind, ProgrammeTemplate, ProgrammeTemplatePart, ProgrammeTemplateServiceRole, ProgrammePartAssignment, ProgrammeServiceRoleAssignment, ProgrammeTemplateResponsible
- **Settings**: Setting
- **Notifications**: NotificationEvent, NotificationPreference
- **GDPR / Audit**: AuditLog, DataDeletionRecord, ConsentRecord

**Global models** (6 — no `congregationId`, not scoped by RLS): Congregation, UserRole, PasswordResetToken, EmailVerificationToken, CalendarFeedToken, BoardDynamicDocumentView

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
| `GOOGLE_MAPS_API_KEY` | No | Enables map rendering on territory pages, static maps in PDF exports, and the *Carte de l'assemblée* drawing editor |
| `GOOGLE_MAPS_MAP_ID` | No | Enables custom styled maps (requires API key) |

When not set, on-screen interactive maps are hidden, the PDF map page is skipped, and the *Carte de l'assemblée* page falls back to the GeoJSON import/export workflow only (no visual editor).

### Components

- **`app/features/territories/ui/BuildingEntranceMap.tsx`** — read-only Google Map (`@vis.gl/react-google-maps`) used by the territory view, the new-territory preview, the five split-tool variants, and the publisher dashboard. Renders `<AdvancedMarker>` + the shared `<EntranceMarkerPin>` (defaults to the in-territory blue + check variant). Accepts `className` / `mapClassName` overrides so the territory view can shrink the map to a 40/50% sticky sidebar without affecting other call sites.
- **`app/features/territories/ui/BuildingEntranceMapEditor.tsx`** — the interactive map-driven territory editor. Uses the same `<EntranceMarkerPin>` with the relevant variant per state (in-territory / available / on-other / pending-add / pending-remove). Wires `@googlemaps/markerclusterer` for clustering, fetches viewport entrances on map idle (debounced + cached by a coarse 0.01° grid), and surfaces a search box, legend, retry chip, and empty-state overlay.
- **`app/features/territories/ui/EntranceMarkerPin.tsx`** — single source of truth for the marker visual. Five variants. Used everywhere on screen.
- **`app/features/territories/ui/TerritoryDocument.tsx`** — uses Google's Static Maps API for the printable territory card. Marker stays yellow on print intentionally. The map page renders the congregation's `TerritoryCardOverlay` zones (each a colored Polygon path) and falls back to the `TerritoryPerimeter` (drawn as a thin gray outline) when no zone is configured. The Static Maps URL is built by the pure `app/features/territories/model/static-map-url.ts` helper — there are zero hardcoded coordinates anywhere in the file (a snapshot test enforces this).
- **`app/features/territories/ui/CardOverlayMap.tsx`** — the drawing-enabled Google Map shared by the *Carte de l'assemblée* settings page (`/settings/territories/card-overlays`). Loads the `drawing` library, instantiates a `google.maps.drawing.DrawingManager` for new polygons, and renders existing zones + perimeter as read-only polygons (with an `excludeOverlayId` / `excludePerimeter` prop to hide whichever shape is currently being dragged in the editable draft).
- **`app/features/territories/ui/ColorPicker.tsx`** — small Popover with a curated 8-swatch palette + a custom-color tile. Used in the new-zone draft form and the per-zone metadata edit dialog.

### Bbox endpoint

`GET /territories/api/entrances-in-bbox?bbox=swLat,swLng,neLat,neLng&territoryId=:id` returns `{ entrances, truncated, total }`. `entrances` is capped at 1500; `truncated` flags when the cap is hit and `total` carries the unfiltered count for the truncation hint. Source: `app/features/territories/server/buildings.server.ts → getEntrancesInBbox`. Routed via `app/features/territories/routes/api/entrances-in-bbox.tsx`. RLS-scoped via `withScopeFromContext`.

### Notes

- `BuildingEntrance` carries a stored centroid (`latitude` / `longitude`) recomputed on building add/remove and on a building's coord change. Maintained by `recalculateEntranceCentroid` in `update-buildings-in-entrance.server.ts` and called by `createBuilding`, `editBuilding`, `importOpenData`, and `updateBuildingsInEntrance`.
- Vite's SSR pipeline must bundle `@googlemaps/markerclusterer` (it ships a CommonJS main entry) — `vite.config.ts` has it in `ssr.noExternal`.
- The editor's reassignment flow validates source territory + entrance link before disconnect/connect, runs everything in a single Prisma transaction, and audits each move as `EntranceReassigned` (see [Audit Logging](#audit-logging)).

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

`app/shared/domain/audit.server.ts` exposes two functions:

- **`audit(entry)`** — fire-and-forget; writes via `unscopedDb` (bypasses RLS), never throws. Use this in service functions for all normal mutations.
- **`auditInTransaction(tx, entry)`** — writes inside an existing transaction; use only when the audit record must succeed or fail atomically with the main write (rare).

### Placement rule

Audit calls belong in service functions (`features/*/server/`), **not** in route loaders or actions. The only exception is logout: there is no service function for it, so the audit call lives directly in the route action.

### actorId threading

Every service function that writes data must accept `actorId: number` — as a positional parameter right after `congregationId`, or as a field in the params interface. Routes extract it from `context.get(userContext).id` and forward it explicitly.

```typescript
// Service function
export async function updateTerritory(db, id, congregationId, actorId, params) {
  const territory = await db.territory.update({ ... })
  audit({ action: AuditAction.TerritoryUpdated, congregationId, actorId, entityType: 'Territory', entityId: id })
  return territory
}

// Route action
const currentUser = context.get(userContext)
return withScopeFromContext(context, async db => {
  return updateTerritory(db, id, currentUser.congregationId, currentUser.id, params)
})
```

### entityType convention

Always use the Prisma model name as the `entityType` string: `'User'`, `'Territory'`, `'Attribution'`, `'BoardDocument'`, `'BoardSection'`, `'PublisherGroup'`, `'PublisherActivity'`, `'Congregation'`, `'TerritoryCardOverlay'`, `'TerritoryPerimeter'`.

### What is not audited

Bulk operations (`bulkDeleteBoardItems`, `bulkMoveBoardItems`) and high-frequency low-signal operations (`reorderBoardSections`) are intentionally excluded — high noise, low investigative value.

### Covered actions

| Domain | When fired |
|---|---|
| Authentication | Login, logout, failed login |
| Consent | Granted, withdrawn |
| Passwords | Reset requested, changed |
| Territories | Created, updated, deleted |
| Entrances | Reassigned (`EntranceReassigned` — when the map editor moves an entrance from one territory to another) |
| Attributions | Created, updated, deleted |
| Publishers | Created, updated, status changed |
| Publisher groups | Created, deleted |
| Publisher activity | Created, updated, deleted |
| Board documents | Created, updated, deleted |
| Board sections | Created, updated |
| Congregation settings | Updated |
| Data transfer | Export, import |
| Platform admin | All cross-congregation operations |

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
