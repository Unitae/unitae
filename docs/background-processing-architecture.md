# Background Processing Architecture

## Overview

Unitae uses a Redis-based background job processing system built on **BullMQ** for handling long-running tasks asynchronously. Jobs carry `congregationId` to maintain tenant isolation in the worker process.

## Architecture

```
Web Pod                             Worker Pod
┌───────────────────┐               ┌───────────────────────┐
│  Route Action     │               │  sync-worker.server   │
│                   │               │                       │
│  syncQueue.add({  │──── Redis ───▶│  handleSyncWork()     │
│    userEmail,     │               │    ↓                  │
│    userName,      │               │  congregationContext  │
│    congregationId │               │    .enterWith()       │
│  })               │               │    ↓                  │
└───────────────────┘               │  importOpenData()     │
                                    │    ↓                  │
                                    │  sendMailAfterSync()  │
                                    │                       │
                                    │  Health: :9090/health │
                                    └───────────────────────┘
```

## Components

### Redis Connection
- **Config**: `app/shared/libs/redis.server.ts`
- Host/port via `REDIS_HOST`, `REDIS_PORT` env vars
- Password auth via `REDIS_PASSWORD`
- Lazy connection with auto-retry

### Job Queue
- **Location**: `app/features/territories/server/sync-queue.server.ts`
- 3 retry attempts with exponential backoff (10s base)
- Keeps 5 completed, 10 failed jobs

### Job Data
```typescript
interface SyncJobData {
  userEmail: string       // For completion notification
  userName?: string       // For email personalization
  congregationId: number  // For tenant isolation
}
```

### Worker
- **Location**: `workers/sync-worker.server.ts`
- Concurrency: 1 (sync operations)
- HTTP health server on port 9090 (for container probes)
- Graceful SIGTERM/SIGINT shutdown (closes health server + worker)
- Tracks `isReady` and `closing` state for health checks

### Job Handler
- **Location**: `app/features/territories/server/handle-sync-work.server.ts`
- Creates a scoped `db` client via `createScopedDb(congregationId)` — tenant-isolated queries via closure
- Resolves congregation info for branded email notifications
- Progress tracking (0-100%)

## Tenant Isolation in Workers

Workers don't have HTTP request context, so they create a scoped `db` client from job data:

```typescript
export async function handleSyncWork(job: Job<SyncJobData>) {
  const { congregationId } = job.data
  const db = createScopedDb(congregationId)
  const congregation = await resolveCongregation(congregationId)

  await importOpenData(db, congregationId, progressCallback)
  await sendMailAfterDataSync(email, name, congregation)
}
```

> **Note**: Workers use `createScopedDb(congregationId)` directly (same factory used by `authenticateAndAuthorize` in routes). The scoped client reads `congregationId` from a closure, not AsyncLocalStorage, so it's immune to the Prisma 7 pg adapter issue.

## Development

```bash
# Start Redis
docker compose -f docker-compose.dev.yml up -d

# Start worker (separate terminal)
pnpm start:worker

# Start web app
pnpm start:dev
```

## Deployment

- Worker runs as a separate process from the web server
- Same codebase, different command: `pnpm start:worker`
- Health endpoint on port 9090
- Scales independently from web processes

## Adding New Job Types

1. **Queue**: `app/features/{feature}/server/{name}-queue.server.ts`
2. **Handler**: `app/features/{feature}/server/handle-{name}-work.server.ts`
   - Create scoped client: `const db = createScopedDb(congregationId)`
   - Pass `db` as first argument to all service functions
3. **Worker**: `workers/{name}-worker.server.ts`
   - Include HTTP health server
   - Handle SIGTERM gracefully
4. **Package script**: `"start:{name}-worker": "pnpm tsx ./workers/{name}-worker.server.ts"`
