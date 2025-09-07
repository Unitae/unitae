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
    ┌────▼────┐    ┌───────┐    ┌──────────┐    ┌─────┐
    │PostgreSQL│    │ Redis │    │  Worker   │    │ S3  │
    │  (PVC)  │    │ (PVC) │    │ (BullMQ) │    │     │
    └─────────┘    └───────┘    └──────────┘    └─────┘
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
2. **React Router** matches route, runs loader
3. **`verifySession()`** authenticates user, resolves congregation, sets `AsyncLocalStorage` context
4. **Prisma extension** auto-injects `congregationId` into all scoped queries
5. **Service layer** (`features/*/server/`) handles business logic
6. **Route component** renders with loader data

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

## File Storage

```
S3 Bucket: unitae/
├── {congregationId}/
│   └── board/
│       ├── {uuid}.pdf
│       └── {uuid}.pdf
```

## Background Job Flow

```
User triggers sync → syncQueue.add({ userEmail, userName, congregationId })
                   → Redis queue

Worker picks up job → congregationContext.enterWith({ congregationId })
                   → importOpenData() (scoped queries via extension)
                   → sendMailAfterDataSync(email, name, congregation)
                   → job complete
```

## Security

- **Session**: Cookie-based, `SESSION_SECRET` required, rate-limited login (5/15min)
- **Passwords**: scrypt hashed, reset via time-limited tokens (24h)
- **Roles**: Congregation-scoped via CongregationUserRole — admin in A ≠ admin in B
- **Platform admin**: Separate `platformAdmin` boolean on User
- **K8s**: PSS restricted, seccomp, NetworkPolicies, non-root pods
- **Files**: S3 with congregation-scoped keys, UUID validation
