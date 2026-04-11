# Unitae — Architecture Schema

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
│  Global: PasswordResetToken                             │
└─────────────────────────────────────────────────────────┘
```

## Request Flow

1. **Reverse Proxy** (Traefik/Nginx) routes incoming requests to web pods
2. **React Router** matches route, runs loader/action
3. **`authenticateAndAuthorize(request, roles)`** authenticates user, checks roles, and returns a **scoped `db` client**
4. **Scoped `db`** auto-injects `congregationId` into all queries (via closure, not AsyncLocalStorage)
5. **Service layer** (`features/*/server/`) receives `db` as first parameter and handles business logic
6. **Route component** renders with loader data

```
Request → authenticateAndAuthorize(request, [Role.X, Role.Y])
        → verifySession(request)     // authenticates user
        → verifyRole(request, role)  // checks permissions (via Promise.all)
        → createScopedDb(congregationId)  // scoped db from closure
        → return { currentUser, congregation, session, can, db }
```

> **Why not AsyncLocalStorage?** The Prisma 7 pg adapter breaks ALS propagation after async queries. Using a closure-based scoped `db` client eliminates this issue entirely.

## Authentication & Role Flow

```
Login → validateCredentials(email, password)
      → set session cookie (userId)
      → redirect to /

Protected Route → authenticateAndAuthorize(request, [roles])
                → verifySession: fetch user (unscopedDb)
                → verifyRole: check CongregationUserRole (unscopedDb, via Promise.all)
                → createScopedDb(congregationId)  // closure-based, no ALS
                → return { currentUser, congregation, session, can, db }

Role Check → can(Role.TerritoriesViewer) → boolean
           (resolved during authenticateAndAuthorize, no extra DB query)
```

## Data Isolation

- **`db` from `authenticateAndAuthorize`** (scoped): Injects `congregationId` via closure — use in all authenticated routes and pass to service functions
- **`unscopedDb`** (global): No injection — use for login, setup, health, password reset
- **`createScopedDb(congregationId)`**: Creates a scoped client for non-route contexts (e.g., background workers)
- **Scoped models** (12): User, Territory, Building, BuildingEntrance, Attribution, PublisherGroup, PublisherActivity, BoardSection, BoardDocument, Event, EventKind, Setting
- **Global models**: UserRole, Congregation, CongregationUserRole, PasswordResetToken

> **Important**: Service functions must receive `db: ScopedDb` as their first parameter. Never import the global `db` in service functions — it relies on AsyncLocalStorage which is unreliable with the Prisma 7 pg adapter.

## File Storage

Two storage drivers, selected automatically based on `S3_ENDPOINT`:

| Condition | Driver | Storage location |
|-----------|--------|------------------|
| `S3_ENDPOINT` is set | S3 | S3-compatible bucket |
| `S3_ENDPOINT` is absent | Local filesystem | `content/uploads/` (configurable via `LOCAL_STORAGE_PATH`) |

Key structure (same for both drivers):

```
{root}/
├── {congregationId}/
│   └── board/
│       ├── {uuid}.pdf
│       └── {uuid}.pdf.meta    ← content-type sidecar (local driver only)
```

No S3 setup needed — document uploads work out of the box with local storage.

## Google Maps Integration

Territory features use Google Maps for interactive maps (building entrance locations) and static map images in territory PDF cards.

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_MAPS_API_KEY` | No | Google Maps API key — enables map rendering on territory pages and static maps in PDF exports |
| `GOOGLE_MAPS_MAP_ID` | No | Google Maps Map ID — enables custom styled maps (requires `GOOGLE_MAPS_API_KEY`) |

When `GOOGLE_MAPS_API_KEY` is not set, map features are silently disabled: interactive maps are hidden and PDF territory cards skip the map page.

The API key must have the following Google APIs enabled:
- **Maps JavaScript API** — for interactive maps on territory and split-tool pages
- **Maps Static API** — for map images in territory PDF cards

## Background Job Flow

```
User triggers sync → syncQueue.add({ userEmail, userName, congregationId })
                   → Redis queue

Worker picks up job → createScopedDb(congregationId)
                    → resolveCongregation(congregationId)
                    → importOpenData(db, congregationId, progressCallback)
                    → sendMailAfterDataSync(email, name, congregation)
                    → job complete
```

## Testing

Unit tests use **Vitest** with co-located test files (`*.server.test.ts` next to source):

```bash
pnpm test:unit              # Run tests once
pnpm test:unit:watch        # Watch mode
pnpm test:unit:coverage     # With coverage report
```

Testing conventions:
- **Black-box testing**: assert on return values and thrown errors, not on mock call counts
- **Mocking**: `vi.mock()` for `db.server`, `redis.server`, `crypto.server`
- **Sentinel pattern**: for negative tests expecting `undefined`, use a sentinel initial value to prove the code path ran

## Security

- **Session**: Cookie-based, `SESSION_SECRET` required, rate-limited login (5/15min)
- **Passwords**: scrypt hashed, reset via time-limited tokens (24h)
- **Roles**: Congregation-scoped via CongregationUserRole
- **Files**: Congregation-scoped storage keys, UUID filenames
