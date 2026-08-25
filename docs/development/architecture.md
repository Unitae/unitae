# Architecture

## Member, UserAccount, and the four valid personas

Identity is split across two tables:

- **`Member`** — a person currently part of *this* congregation. Holds identity (firstname/lastname, demographics, phone), publisher status (`isPublisher`, `type`, `baptismDate`, `isAnointed`, `isHelder`, `isServant`), and three orthogonal lifecycle flags: `leftAt` (soft-leave; reversible), `inactiveAt` (publisher has reported no preaching for 6 consecutive monthly reports; reversible, auto-cleared on the next hours report; see `app/features/publishers/server/evaluate-inactive-status.server.ts`), and `anonymizedAt` (GDPR scrub; irreversible).
- **`UserAccount`** — a login. Holds email, password, tokens. Optionally points 1:1 at a `Member` via `memberId`. When `memberId` is null, the account belongs to a circuit overseer or external admin who is not in this congregation; the account carries fallback `firstname`/`lastname` for display.

Four valid combinations, all real personas:

| Persona | Member | UserAccount |
|---|---|---|
| Publisher who logs in | ✓ (`isPublisher=true`) | ✓ → member |
| Publisher without account | ✓ | ✗ |
| Ministry-school student | ✓ (`isPublisher=false`) | optional |
| Circuit overseer / external admin | ✗ | ✓ (no member link) |

FK target rule of thumb:

- **Action requires a login** → FK targets `UserAccount`. Examples: audit `actorId`, `Event.createdBy`, `BoardDocument.viewedBy`, `BoardDocumentVersion.uploadedBy`, all token tables, `UserRoleAssignment.user`.
- **Subject is a person in the congregation** → FK targets `Member`. Examples: `Attribution.publisherId`, `PublisherActivity.publisherId`, `EventPart.{assigneeId,assistantId}`, `EventServicePart.assigneeId`, `PublisherGroup.{members,responsible,deputy}`, `MemberRoleAssignment.member`.

Helpers: `account.member?.firstname ?? account.firstname` for display (use the `accountDisplayName` helper in `app/shared/utils/display-name.ts`); `currentUser.member?.id` to get the linked member id from the session-loaded account.

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
│  │  Members        │  │  Members         │              │
│  │  UserAccounts   │  │  UserAccounts    │              │
│  │  Territories    │  │  Territories     │              │
│  │  Buildings      │  │  Buildings       │              │
│  │  Attributions   │  │  Attributions    │              │
│  │  Activities     │  │  Activities      │              │
│  │  Events         │  │  Events          │              │
│  │  Settings       │  │  Settings        │              │
│  │  Board Docs     │  │  Board Docs      │              │
│  └─────────────────┘  └──────────────────┘              │
│                                                         │
│  Global: Permission (24 permission definitions)         │
│  Global: PasswordResetToken, EmailVerificationToken,    │
│          CalendarFeedToken                              │
└─────────────────────────────────────────────────────────┘
```

## Request Flow

1. **Reverse Proxy** (Traefik/Nginx) routes incoming requests to web pods
2. **React Router** matches route, runs middleware then loader/action
3. **`requireAuth()`** middleware (from `app/shared/auth/middleware.server.ts`) authenticates user, resolves the full effective permission set, checks GDPR consent, and sets typed context. The `_required` parameter on the function signature is retained for call-site compatibility but no longer used — see [Permissions and Roles](permissions-and-roles.md)
4. **Loader/action** reads context via `context.get(currentAccountContext)`, `context.get(congregationContext)`, `context.get(permissionsContext)`
5. **`withScopeFromContext(context, fn)`** opens a PostgreSQL transaction with `SET LOCAL` for Row-Level Security
6. **Service functions** (`features/*/server/`) receive the scoped `TransactionClient` and handle business logic
7. **Route component** renders with loader data

```
Middleware → requireAuth()
           → verifySession(request)                          // authenticates user, returns congregation
           → resolveEffectivePermissions(userId, congId)     // unions direct + role-mediated permissions
           → enforceGdprConsent(userId)                      // redirects to /consent if not granted
           → context.set(currentAccountContext, currentUser)
           → context.set(congregationContext, congregation)
           → context.set(permissionsContext, permissions)

Route     → context.get(currentAccountContext)             // read current user
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
- RLS only works when the runtime connects as a **non-superuser** role. A superuser / `BYPASSRLS` role defeats `withScope` entirely, so the app probes the role at boot and **fails closed in production** (refuses to start) via `assertRuntimeRoleEnforcesRls` — see [Row-Level Security](row-level-security.md)

When to use each:

| Context | Method | Example |
|---------|--------|---------|
| Authenticated routes | `withScope(congregationId, async db => { ... })` | Territory list, publisher creation |
| Login, setup, health | `unscopedDb` directly | Password validation, health check |
| Background workers | `withScope(congregationId, ...)` or `unscopedDb` | Sync jobs use `withScope`, email jobs use `unscopedDb` with explicit `where` |
| Platform admin | `unscopedDb` | Cross-congregation queries |

**Scoped models** (all carry `congregationId` and are isolated by RLS):
- **Identity**: Member (person currently in the congregation), UserAccount (login), MemberRoleAssignment (identity-role memberships)
- **Auth**: Role, RolePermission, UserRoleAssignment (management-role memberships)
- **Board**: BoardSection, BoardSectionVisibilityRole, BoardDocument, BoardDocumentVersion, BoardDynamicDocumentSettings
- **Territories**: Territory, Attribution, Building, BuildingEntrance, BuildingAccess, BuildingResidentialData, TerritoryCardOverlay, TerritoryPerimeter
- **Publishers**: PublisherGroup, PublisherActivity
- **Events**: Event, EventTemplate, TemplatePart, TemplateServicePart, EventPart, EventServicePart, TemplateResponsible, ExternalSpeaker
- **Settings**: Setting
- **Notifications**: NotificationEvent, NotificationPreference
- **GDPR / Audit**: AuditLog, DataDeletionRecord, ConsentRecord

**Global models** (no `congregationId`, not scoped by RLS): Congregation, Permission, PasswordResetToken, EmailVerificationToken, CalendarFeedToken, BoardDynamicDocumentView

The authoritative list lives in `app/database/schema.prisma`.

## Authentication & Permission Flow

```
Login → validateCredentials(email, password)
      → set session cookie (userId)
      → redirect to `?redirectTo=<path>` (sanitized via safeRedirectUrl)
        or `/` when no redirectTo is present

Session expiry → verifySession bounces to /login?redirectTo=<current path>
              → after re-auth, user lands back on the original path
              → tenant mismatch, suspended congregation, expired trial,
                unverified email, and missing GDPR consent bounce bare
                (no redirectTo — those wall pages are the correct terminal state)

Protected Route → requireAuth() middleware on layout route
                → verifySession: fetch user (unscopedDb), check suspension/trial/email
                → resolveEffectivePermissions: union role-mediated grants
                  (account roles + linked-member identity roles)
                  (RolePermission joined to UserRoleAssignment); expands Admin
                  to every Permission value
                → context.set(currentAccountContext, currentUser)
                → context.set(congregationContext, congregation)
                → context.set(permissionsContext, Set<Permission>)

Permission Check → context.get(permissionsContext).has(Permission.TerritoriesViewer) → boolean
                (resolved during requireAuth middleware, no extra DB query)
```

The end-to-end model — Permission enum, Role/RolePermission/UserRoleAssignment tables, built-in vs custom roles — is documented in [Permissions and Roles](permissions-and-roles.md).

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
- **`app/features/territories/ui/CardOverlayMap.tsx`** — the drawing-enabled Google Map shared by the *Carte de l'assemblée* settings page (`/settings/territories/card-overlays`). Uses [Terra Draw](https://terradraw.io/) via `terra-draw-google-maps-adapter` for polygon drawing + vertex editing (Google removed `google.maps.drawing.DrawingManager` in Maps JS v3.65). One `TerraDraw` instance drives both the "draw new" (`TerraDrawPolygonMode`) and "edit existing" (`TerraDrawSelectMode`) flows; pure GeoJSON↔`CardOverlayPath` conversion is isolated in the colocated `card-overlay-map-bridge.ts` module. Renders existing zones + perimeter as read-only `google.maps.Polygon` (with an `excludeOverlayId` / `excludePerimeter` prop to hide whichever shape is currently being edited).
- **`app/features/territories/ui/ColorPicker.tsx`** — small Popover with a curated 8-swatch palette + a custom-color tile. Used in the new-zone draft form and the per-zone metadata edit dialog.

### Bbox endpoint

`GET /territories/api/entrances-in-bbox?bbox=swLat,swLng,neLat,neLng&territoryId=:id` returns `{ entrances, truncated, total }`. `entrances` is capped at 1500; `truncated` flags when the cap is hit and `total` carries the unfiltered count for the truncation hint. Source: `app/features/territories/server/buildings.server.ts → getEntrancesInBbox`. Routed via `app/features/territories/routes/api/entrances-in-bbox.tsx`. RLS-scoped via `withScopeFromContext`.

### Notes

- `BuildingEntrance` carries a stored centroid (`latitude` / `longitude`) recomputed on building add/remove and on a building's coord change. Maintained by `recalculateEntranceCentroid` in `update-buildings-in-entrance.server.ts` and called by `createBuilding`, `editBuilding`, `importOpenData`, and `updateBuildingsInEntrance`.
- Vite's SSR pipeline must bundle `@googlemaps/markerclusterer` (it ships a CommonJS main entry) — `vite.config.ts` has it in `ssr.noExternal`.
- The editor's reassignment flow validates source territory + entrance link before disconnect/connect, runs everything in a single Prisma transaction, and audits each move as `EntranceReassigned` (see [Audit Logging](#audit-logging)).

## Territory Search & Geocoding

The shared filter row on `/territories`, `/territories/attributions`, `/territories/attributions/new/available-territories`, `/territories/buildings` and `/territories/split-tool/*` is a single search input with three resolution paths: text-only, address-or-place auto-detect, and `@`-forced proximity. Each path produces a stable URL query (`?search=`, `?sort=`, `?page=`) so loaders are pure functions of the URL.

### Diacritic-folded text search

Names and street names are matched against **pre-normalized** lowercase + diacritic-stripped copies of the original columns, so runtime queries stay in pure Prisma `contains` (no `unaccent` extension, no raw SQL):

- `Member.firstnameNormalized`, `Member.lastnameNormalized`, `Building.streetNormalized` are NOT NULL with `''` default.
- Maintained at write-time by `app/shared/utils/strip-diacritics.ts` (`stripDiacritics(s)` = `s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()`) — called from every write path that touches the source columns: `createMember`, `updateMember`, `anonymizeMember`, `linkMemberToAccount`, `updateAccount`, `createBuilding`, `editBuilding`, `import-congregation`, `import-open-data`, and the marketing seed.
- The migration `20260606000000_add_normalized_search_columns` backfills pre-existing rows in pure SQL via Postgres `translate(lower(...), 'àáâã…', 'aaaa…')` — no `unaccent` extension required, runs cleanly on managed Postgres without superuser. The SQL/JS parity of the translate map is locked by `backfill-parity.integration.test.ts`.
- Composite B-tree indexes `(congregationId, *Normalized)` match the RLS-scoped `where` shape so filter queries stay on the index.

### Address parsing

`app/features/territories/server/address-regex.ts` exposes `addressRegex = /^(\d+\s*(bis|ter|quater)?)\s+(.+)$/` — splits `12 bis Rue de la Paix` into `[number, repeater?, street]`. Used by all three filter files (`territory-filters`, `attribution-filters`, `building-filters`) to split a leading number from the street so each piece can be matched against `Building.number` and `streetNormalized` separately, while still allowing a plain text search to fall back to `streetNormalized.contains` only.

### Server-side geocoder

`app/shared/infra/geocoder.server.ts` wraps `@googlemaps/google-maps-services-js`:

- `geocode(query: string): Promise<GeocodeResult | null>` returns `null` for empty input, missing `GOOGLE_MAPS_API_KEY`, network errors, and non-OK Google statuses (`REQUEST_DENIED`, `OVER_QUERY_LIMIT`, …). Non-OK statuses are logged at error level and **not** cached.
- Results (including `ZERO_RESULTS`) are cached in Redis under `geocode:v1:<stripDiacritics(query)>` with a 90-day TTL. Empty-string sentinel for misses.
- `Client` instance is lazy so test mocks can install before construction.
- 5-second request timeout via `params.timeout`.
- `locationType` is normalized at the boundary — unknown Google enum values (e.g. a future `PLUS_CODE`) coerce to `'OTHER'` rather than corrupting the union type.

### Search intent classifier

`app/features/territories/server/search-intent.server.ts` decides whether to spend an API call:

```ts
classifySearch(raw): { freeText: string; geoQuery: string | null; forced: boolean }
```

- A leading `@` forces proximity (`forced: true`, `geoQuery = trimmed-after-@`); `@` alone returns `geoQuery: null, forced: true` so the UI can prompt for a place.
- Otherwise the geocoder is only called when the query has ≥3 tokens, contains a French street word (`rue|avenue|boulevard|place|chemin|impasse|allee|cours|quai|route|square|voie|pont`), or matches the address regex. Short ambiguous strings (`12`, `D012`, single-token surnames) stay text-only.

### Distance ranking and partitioning

`app/features/territories/server/proximity-sort.server.ts`:

- `closestTerritoryPoint(origin, entrances)` returns the closest `BuildingEntrance.{latitude,longitude}` falling back to the parent `Building.{latitude,longitude}`. `Number.isFinite` guards reject NaN coords from open-data CSV imports.
- `paginateByProximity(items, origin, getCoords, url)` Haversine-sorts items with coords ascending, appends items without coords in their original order, and paginates the combined list using `paginationFromUrl`.
- `app/shared/utils/distance.ts` exposes `haversineMeters(a, b)` and `formatDistance(meters, locale)` — the formatter cache is keyed per locale so the loader can pass `getLocale()` from Paraglide.

The two pagination service functions accept an optional `proximity: { origin: LatLng }`:

- `findTerritoriesWithDetailsPaginated(db, selectors, url, congregationId, proximity?)` and `findAvailableTerritoriesPaginated(...)` fetch every matching row with the full `entrances → buildings` include shape, then partition; without `proximity` they fall back to standard `skip`/`take` Prisma pagination.
- `findActiveAttributionsPaginated(db, selectors, url, congregationId, proximity?)` does the same for attributions, joining through `Attribution.territory.entrances.buildings` to derive coords.

### Loader wiring

The three list routes (`territory/list.tsx`, `attributions/list.tsx`, `attributions/territories.tsx`) follow the same shape:

1. `classifySearch(?search)` → `intent`
2. If `intent.geoQuery != null`, call `geocode(intent.geoQuery)` → `geocodeResult`
3. Default sort = `'proximity'` when `geocodeResult != null`, else `'number'` or `'date'` (per-route default); `sortFromUrl` clamps to the per-route allowlist
4. `proximityActive = geocodeResult != null && sort === 'proximity'`
5. `geocodeNotice` is the discriminated union `{ kind: 'failed', query } | { kind: 'missing-query' }` rendered by the `GeocodeNotice` component above the filters
6. The `ProximityBanner` renders whenever `geocodeResult != null` — even when the user reverted to the default sort — so the resolved address stays visible
7. The Distance column and the `Sans coordonnées` divider/banner are gated on `proximityActive`

`paginationFromUrl` clamps the page to `[1, max(1, pages)]` so an out-of-range `?page=99` lands on the last page instead of rendering an empty table.

### Mobile filter form

`TerritoryFilters` / `AttributionFilters` render the advanced Selects **exactly once** inside the `<Form>`. Visibility on small screens is a CSS toggle driven by the *Filtres avancés* button — rendering the Selects twice (one copy `max-sm:hidden`, one inside a Collapsible) caused Radix to inject duplicate hidden form inputs, and mobile submissions lost the user's choice to the desktop default. Single-render + CSS-only toggling avoids that whole class of bug.

### Test coverage

- Unit: `stripDiacritics`, `haversineMeters`, `formatDistance`, `classifySearch` (incl. adversarial cases — `@@`, leading whitespace, single-token street words), `paginateByProximity`, `closestTerritoryPoint` (incl. NaN/Infinity), all three filter compute functions, `paginationFromUrl` (incl. clamp), `build-filter-chips`, `geocoder.server` (mocked Redis + Google client — cache hit/miss/malformed, `ZERO_RESULTS`, non-OK status no-cache, API throw, API key forwarding, unknown `location_type` → `OTHER`).
- Integration (require live DB): `backfill-parity` (SQL ↔ JS map equivalence), `normalized-columns` (write-through for Member create/update/anonymize), `building-normalized-columns` (Building create/edit + import-update path), `proximity-loader` (full Prisma path for both service functions).
- E2E (Playwright): `territories-search.spec.ts` — search → URL → chip → *Tout effacer*.

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
| `GET /territories/territory/:id/pdf` | `territories/routes/territory/pdf-download.tsx` | Individual territory card — accessible to anyone with `Permission.TerritoriesViewer` or the attributed publisher |
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

Every service function that writes data must accept `actorId: number` — as a positional parameter right after `congregationId`, or as a field in the params interface. Routes extract it from `context.get(currentAccountContext).id` and forward it explicitly.

```typescript
// Service function
export async function updateTerritory(db, id, congregationId, actorId, params) {
  const territory = await db.territory.update({ ... })
  audit({ action: AuditAction.TerritoryUpdated, congregationId, actorId, entityType: 'Territory', entityId: id })
  return territory
}

// Route action
const currentUser = context.get(currentAccountContext)
return withScopeFromContext(context, async db => {
  return updateTerritory(db, id, currentUser.congregationId, currentUser.id, params)
})
```

### entityType convention

Always use the Prisma model name as the `entityType` string: `'Member'`, `'UserAccount'`, `'Territory'`, `'Attribution'`, `'BoardDocument'`, `'BoardSection'`, `'PublisherGroup'`, `'PublisherActivity'`, `'Congregation'`, `'TerritoryCardOverlay'`, `'TerritoryPerimeter'`. Audit logs that pre-date the User → Member/UserAccount split still use `'User'` as the historical entity type and are not rewritten.

### What is not audited

Bulk operations (`bulkDeleteBoardItems`, `bulkMoveBoardItems`) and high-frequency low-signal operations (`reorderBoardSections`) are intentionally excluded — high noise, low investigative value.

### Covered actions

The full list lives in the `AuditAction` map in `app/shared/domain/audit.server.ts`. As of writing it covers:

| Domain | When fired |
|---|---|
| Authentication | Login, logout, failed login |
| User management | User created/updated/anonymized, role assignments synced and changed |
| Roles | Role created/updated/deleted, role-permission set changed, allowed-roles changed (programme parts, service roles) |
| Calendar feed | Personal token created and revoked |
| Consent | Granted, withdrawn |
| Passwords | Reset requested, changed |
| Territories | Created, updated, deleted |
| Entrances | Reassigned (`EntranceReassigned` — when the map editor moves an entrance from one territory to another) |
| Attributions | Created, updated, deleted |
| Publishers | Created, updated, status changed (publisher ↔ ministry-school student), inactivated, reactivated |
| Member lifecycle | Marked as left, marked as returned |
| Account ↔ Member linking | Account linked to a Member, account unlinked from a Member |
| Publisher groups | Created, deleted |
| Publisher activity | Created, updated, deleted |
| Board documents | Created, updated, deleted |
| Board sections | Created, updated, visibility role list changed |
| Territory card overlays | Created, updated, deleted |
| Territory perimeter | Updated, cleared |
| External speakers | Created, updated, archived, unarchived |
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

- **Session**: Cookie-based (HTTP-only, `SameSite=Lax`, optional `UNITAE_COOKIE_DOMAIN` for multi-subdomain SaaS), 1h (prod) / 8h (dev) maxAge. `UNITAE_SESSION_SECRET` is validated at boot (min 32 chars; the example placeholder is refused) — fail-closed in production, warn-only in dev, like the RLS guard. Rotation is supported by comma-separating the value into `[current, ...previous]`: the first entry signs new cookies, the rest validate existing ones; the same secrets derive the TOTP seed encryption key so rotation does not force 2FA re-enrollment (keep the previous secret in the list until all seeds have been re-enrolled — seeds are never re-encrypted)
- **Passwords**: scrypt hashed with a 16-byte random salt and 32-byte derived key, constant-time comparison, never stored in plain text, reset via 24h single-use time-limited tokens generated with `crypto.randomBytes(32)`
- **Email verification**: Required before accessing the app, 24h token expiry
- **Rate limiting** (via `redisRateLimit`): Login is keyed on the client IP (`LOGIN_RATE_LIMIT_IP_MAX`, default 10 / 15min) plus an instance-wide global counter (`LOGIN_RATE_LIMIT_GLOBAL_MAX`, default 100 / 15min) — deliberately **never** keyed on the target email, so no one can lock out a specific account. Password reset is limited per email (3/15min). Two-factor challenge is limited per account (`TWO_FACTOR_RATE_LIMIT_MAX`, default 5)
- **Calendar feed tokens**: 32 random bytes encoded as base64url (`crypto.randomBytes(32)`), one active per user, no automatic expiry, manually revoked or regenerated. Audited via `calendar_feed.token.created` and `calendar_feed.token.revoked` actions
- **Permissions**: 24 congregation-scoped permissions, granted directly via `CongregationUserPermission` or through `Role` membership (see [Permissions and Roles](permissions-and-roles.md))
- **Files**: Congregation-scoped storage keys with UUID filenames (`{congregationId}/board/{uuid}.pdf`)
- **RLS**: PostgreSQL Row-Level Security for tenant data isolation
- **Log PII redaction**: Email addresses and personal data fields hashed with SHA-256 in application logs

## Related

- [Row-Level Security](row-level-security.md) — How RLS enforces tenant isolation
- [Coding Conventions](coding-conventions.md) — Patterns, philosophy, and rules
- [Background Processing](background-processing.md) — BullMQ worker architecture
