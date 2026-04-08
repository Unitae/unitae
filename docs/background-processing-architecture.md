# Background Processing Architecture

## Overview

Unitae uses a Redis-based background job processing system built on **BullMQ** for handling long-running tasks asynchronously. Jobs carry `congregationId` to maintain tenant isolation in the worker process.

## Architecture

```
Web Pod                          Worker Pod
┌────────────────┐               ┌─────────────────────┐
│  Route Action   │               │  sync-worker.server  │
│                 │               │                     │
│  syncQueue.add({│──── Redis ───▶│  handleSyncWork()   │
│    userEmail,   │               │    ↓                │
│    userName,    │               │  congregationContext │
│    congregationId│              │    .enterWith()     │
│  })            │               │    ↓                │
└────────────────┘               │  importOpenData()    │
                                 │    ↓                │
                                 │  sendMailAfterSync() │
                                 │                     │
                                 │  Health: :9090/health│
                                 └─────────────────────┘
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
- HTTP health server on port 9090 (for K8s probes)
- Graceful SIGTERM/SIGINT shutdown (closes health server + worker)
- Tracks `isReady` and `closing` state for health checks

### Job Handler
- **Location**: `app/features/territories/server/handle-sync-work.server.ts`
- Sets `congregationContext.enterWith()` before processing — all scoped DB queries are tenant-isolated
- Resolves congregation info for branded email notifications
- Progress tracking (0-100%)

## Tenant Isolation in Workers

Workers don't have HTTP request context, so they set congregation context manually from job data:

```typescript
export async function handleSyncWork(job: Job<SyncJobData>) {
  const { congregationId } = job.data
  const congregation = await resolveCongregation(congregationId)
  congregationContext.enterWith({ congregationId, congregation })

  // Pass congregationId explicitly to avoid AsyncLocalStorage context loss
  await importOpenData(congregationId, progressCallback)
  await sendMailAfterDataSync(email, name, congregation)
}
```

> **Note**: Service functions that create records should accept `congregationId` as an explicit parameter rather than relying on AsyncLocalStorage context, which can be lost across async boundaries with the Prisma 7 pg adapter.

## Development

```bash
# Start Redis
docker compose -f docker-compose.dev.yml up -d

# Start worker (separate terminal)
pnpm start:worker

# Start web app
pnpm start:dev
```

## K8s Deployment

- Worker runs as separate Deployment (`k8s/base/worker.yaml`)
- Same Docker image, different command: `pnpm start:worker`
- Health probes on port 9090
- 60s termination grace period for in-progress jobs
- Scales independently from web pods

## Adding New Job Types

1. **Queue**: `app/features/{feature}/server/{name}-queue.server.ts`
2. **Handler**: `app/features/{feature}/server/handle-{name}-work.server.ts`
   - Set `congregationContext.enterWith()` from job data
   - Pass `congregationId` explicitly to service functions that create records
3. **Worker**: `workers/{name}-worker.server.ts`
   - Include HTTP health server
   - Handle SIGTERM gracefully
4. **Package script**: `"start:{name}-worker": "pnpm tsx ./workers/{name}-worker.server.ts"`
5. **K8s**: Add Deployment to `k8s/base/`
