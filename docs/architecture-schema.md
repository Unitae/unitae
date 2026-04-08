# Unitae — Architecture Schema

## High-Level Architecture

```
                         ┌──────────────────┐
                         │     Traefik       │
                         │   your.domain     │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │              │
              ┌─────▼─────┐ ┌────▼─────┐ ┌─────▼─────┐
              │  Web Pod   │ │ Web Pod  │ │ Web Pod   │
              │ (port 8080)│ │(port 8080│ │(port 8080)│
              └─────┬──────┘ └────┬─────┘ └─────┬─────┘
                    │             │              │
         ┌─────────┴─────────────┴──────────────┘
         │
    ┌────▼────┐    ┌───────┐    ┌──────────┐    ┌──────────────┐
    │PostgreSQL│    │ Redis │    │  Worker   │    │ File Storage │
    │  (PVC)  │    │ (PVC) │    │ (BullMQ) │    │ (S3 or local)│
    └─────────┘    └───────┘    └──────────┘    └──────────────┘
```

## Multi-Tenancy Model

```
┌─────────────────────────────────────────────────────────┐
│                      Platform                           │
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Congregation A  │  │  Congregation B  │  ...        │
│  │  (slug: lyon)    │  │  (slug: paris)   │              │
│  │                  │  │                  │              │
│  │  Users           │  │  Users           │              │
│  │  Territories     │  │  Territories     │              │
│  │  Buildings       │  │  Buildings       │              │
│  │  Attributions    │  │  Attributions    │              │
│  │  Activities      │  │  Activities      │              │
│  │  Events          │  │  Events          │              │
│  │  Settings        │  │  Settings        │              │
│  │  Board Docs      │  │  Board Docs      │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                         │
│  Global: UserRole (14 role definitions)                  │
│  Global: PasswordResetToken                             │
│  Platform: User.platformAdmin for /platform-admin/      │
└─────────────────────────────────────────────────────────┘
```

## Request Flow

1. **Traefik** routes incoming requests to web pods
2. **React Router** matches route, runs loader/action
3. **`verifySession()`** authenticates user, resolves congregation, sets `AsyncLocalStorage` context
4. **Prisma extension** auto-injects `congregationId` into all scoped queries
5. **Service layer** (`features/*/server/`) handles business logic
6. **Route component** renders with loader data

> **Important**: Route actions must call `verifySession(request)` and use the returned `congregation` object directly (e.g., `congregation.id`) instead of reading from `congregationContext.getStore()`. The Prisma 7 pg adapter breaks AsyncLocalStorage propagation across async boundaries — context set by `enterWith()` can be lost after awaited Prisma queries.

## Authentication & Role Flow

```
Login → validateCredentials (unscopedDb)
     → set session cookie (userId)
     → redirect to /

Protected Route → verifySession(request)
              → fetch user (unscopedDb)
              → resolveCongregation(user.congregationId)
              → congregationContext.enterWith({ congregationId, congregation })
              → return { currentUser, congregation, session }

Role Check → verifyRole(request, roleKey)
          → query CongregationUserRole (unscopedDb)
          → check: admin for this congregation? OR has specific role?

Registration → /register (open, no auth)
            → create Congregation + User + CongregationUserRole(admin) + default EventKind
            → set session, redirect to /
```

## Data Isolation

- **`db`** (scoped): Auto-injects `congregationId` — use for all authenticated routes
- **`unscopedDb`** (global): No injection — use for login, setup, health, password reset, platform admin
- **Scoped models** (12): User, Territory, Building, BuildingEntrance, Attribution, PublisherGroup, PublisherActivity, BoardSection, BoardDocument, Event, EventKind, Setting
- **Global models**: UserRole, Congregation, CongregationUserRole, PasswordResetToken

> **Important**: Never use `congregationId: 0 as number` as a placeholder. Always pass the real `congregation.id` from `verifySession()`. The `0` placeholder relied on the Prisma extension to replace it at runtime, but context loss causes FK violations.

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

Self-hosted users need no S3 setup — document uploads work out of the box with local storage.

## Background Job Flow

```
User triggers sync → syncQueue.add({ userEmail, userName, congregationId })
                   → Redis queue

Worker picks up job → resolveCongregation(congregationId)
                   → congregationContext.enterWith({ congregationId, congregation })
                   → importOpenData(congregationId, progressCallback)
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
- **Roles**: Congregation-scoped via CongregationUserRole — admin in A ≠ admin in B
- **Platform admin**: Separate `platformAdmin` boolean on User
- **K8s**: PSS restricted, seccomp, NetworkPolicies, non-root pods
- **Files**: Congregation-scoped storage keys, UUID filenames
