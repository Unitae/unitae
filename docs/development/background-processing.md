# Background Processing

## Overview

Unitae uses a Redis-based background job processing system built on **BullMQ**. A single multi-queue worker process handles five job types: territory data sync, email notifications, PDF thumbnail generation, data transfer (export/import), and data retention (daily auto-anonymisation). Jobs carry `congregationId` to maintain tenant isolation.

## Architecture

```
Web Pod                                    Worker Pod (workers/worker.server.ts)
┌──────────────────────────────┐           ┌─────────────────────────────────────────┐
│  Route / Cron Action         │           │  syncWorker           (concurrency 1)   │
│                              │           │    → handleSyncWork()                   │
│  syncQueue.add(...)          │── Redis ─▶│                                         │
│  emailQueue.add(...)         │── Redis ─▶│  emailWorker          (concurrency 5)   │
│  thumbnailQueue.add(...)     │── Redis ─▶│    → handleEmailWork()                  │
│  dataTransferQueue.add(...)  │── Redis ─▶│                                         │
│                              │           │  thumbnailWorker      (concurrency 2)   │
└──────────────────────────────┘           │    → handleThumbnailWork()              │
                                           │                                         │
                                           │  dataTransferWorker   (concurrency 1)   │
                                           │    → handleDataTransferWork()           │
                                           │                                         │
                                           │  retentionWorker      (concurrency 1)   │
                                           │    → handleRetentionWork()              │
                                           │    ▲ daily cron @ 03:00 UTC             │
                                           │      (upsertJobScheduler)               │
                                           │                                         │
                                           │  Health: :9090                          │
                                           └─────────────────────────────────────────┘
```

## Queue Registry

Queue names are centralized in `app/shared/infra/queues.server.ts`:

```typescript
export const QUEUE_NAMES = {
  sync: 'syncQueue',
  email: 'emailQueue',
  thumbnail: 'thumbnailQueue',
  dataTransfer: 'dataTransferQueue',
  retention: 'retentionQueue',
} as const
```

## Queues

### Sync Queue

Imports and processes open data (BANO addresses) for territory management.

- **Producer**: `app/features/territories/server/sync-queue.server.ts`
- **Handler**: `app/features/territories/jobs/handle-sync-work.server.ts`
- **Concurrency**: 1 (CPU/IO-intensive import)
- **Retries**: 3 attempts, exponential backoff (10s base)
- **Tenant isolation**: Uses `withScope(congregationId, ...)` for RLS-scoped DB access
- **Job data**: `{ userId, congregationId }`

### Email Queue

Sends notification emails asynchronously with automatic retries.

- **Producer**: `app/shared/infra/email-queue.server.ts`
- **Handler**: `app/features/notifications/jobs/handle-email-work.server.tsx`
- **Concurrency**: 5 (IO-bound Resend API calls)
- **Retries**: 3 attempts, exponential backoff (5s base)
- **Tenant isolation**: Uses `unscopedDb` with explicit `congregationId` filtering
- **Locale**: Wraps email rendering in `runInWorkerContext(congregation.locale, congregation.timezone, ...)` for i18n

Job types (discriminated union on `type`):
- `notification-digest`: Batched notification email after the debounce window settles
- `notification-instant`: Immediate notification email (no debounce)

### Thumbnail Queue

Generates PDF thumbnails asynchronously after document upload.

- **Producer**: `app/features/display-board/server/thumbnail-queue.server.ts`
- **Handler**: `app/features/display-board/jobs/handle-thumbnail-work.server.ts`
- **Concurrency**: 2 (CPU-bound `pdftoppm` subprocess)
- **Retries**: 3 attempts, exponential backoff (5s base)
- **Job data**: `{ congregationId, documentId, pdfStorageKey }`
- **Flow**: Fetch PDF from storage → run `pdftoppm` → upload thumbnail → update document record

Documents are created with `thumbnailUri: null` and updated asynchronously when the worker completes.

### Data Transfer Queue

Handles congregation data export and import as background jobs.

- **Producer**: `app/features/settings/server/data-transfer-queue.server.ts`
- **Handler**: `app/features/settings/jobs/handle-data-transfer-work.server.ts`
- **Concurrency**: 1 (IO-intensive archive creation/extraction)
- **Retries**: None (1 attempt only)
- **Tenant isolation**: Uses `withScope(congregationId, ...)` for RLS-scoped DB access

Job types (discriminated union on `type`):
- `export`: Creates a `.unitae` archive (ZIP) with congregation data and optional uploaded files
- `import`: Extracts a `.unitae` archive and imports entities with ID remapping

### Retention Queue

Runs the daily data-retention sweep that auto-anonymises members who left the congregation longer ago than the retention window.

- **Producer**: `app/features/settings/server/retention-queue.server.ts`
- **Handler**: `app/features/settings/jobs/handle-retention-work.server.ts`
- **Concurrency**: 1
- **Retries**: None (1 attempt only)
- **Schedule**: A single repeating job registered at worker startup via `retentionQueue.upsertJobScheduler('retention-daily', { pattern: '0 <RETENTION_CRON_HOUR_UTC> * * *', tz: 'UTC' })` — runs daily at 03:00 UTC by default. `upsertJobScheduler` is idempotent, so restarts don't pile up duplicate schedules.
- **Behaviour**: Iterates every active congregation and calls `autoAnonymizeRetentionCandidates(db, congregationId, DEFAULT_RETENTION_MONTHS, ...)`, which anonymises members whose `leftAt` is older than the window. Group responsibles are skipped with a warning (they must be reassigned by an admin first).

This is distinct from the `/cron/retention` HTTP endpoint (expired-token / withdrawn-consent cleanup), which is triggered by an external scheduler — see [Cron Jobs](../self-hosting/cron-jobs.md).

## Worker Locale Support

Background emails must render in the congregation's language. The worker uses `AsyncLocalStorage` via `app/shared/utils/worker-locale.server.ts`:

```typescript
import { runInWorkerContext } from '~/shared/utils/worker-locale.server'

// In email handler:
await runInWorkerContext(congregation.locale, congregation.timezone, async () => {
  // All Paraglide m.*() calls resolve to the correct locale
  await mailer.emails.send({ subject: m.email_subject(), ... })
})
```

This module is imported at the top of `workers/worker.server.ts` before any handler imports, ensuring `overwriteGetLocale()` is called once at startup.

## Worker Health & Lifecycle

The unified worker (`workers/worker.server.ts`) manages all five queue workers:

- **Health endpoint**: HTTP server on port `UNITAE_WORKER_HEALTH_PORT` (default 9090)
- **Ready check**: Returns 200 only when ALL workers have fired `ready` and none are closing
- **Graceful shutdown**: On SIGINT/SIGTERM, closes the health server then calls `worker.close()` on all workers via `Promise.allSettled`

## Development

```bash
# Start Redis
docker compose -f docker/docker-compose.dev.yml up -d

# Start worker (separate terminal)
pnpm start:worker

# Start web app
pnpm start:dev
```

The worker is only needed if you're working on territory sync, document uploads, or board notifications. Most development can be done without it.

## Deployment

- Worker runs as a separate process from the web server
- Same Docker image, different command: `pnpm start:worker`
- Health endpoint on port 9090 for K8s liveness/readiness probes
- Scales independently from web processes

## Adding New Job Types

1. Add queue name to `QUEUE_NAMES` in `app/shared/infra/queues.server.ts`
2. Create queue producer: `app/features/{feature}/server/{name}-queue.server.ts`
3. Create handler: `app/features/{feature}/jobs/handle-{name}-work.server.ts` (handlers live in a per-feature `jobs/` directory, separate from `server/`)
   - For scoped DB access: use `withScope(congregationId, ...)`
   - For cross-tenant queries: use `unscopedDb` with explicit `where: { congregationId }`
   - For email rendering: wrap in `runInWorkerContext(congregation.locale, congregation.timezone, ...)`
4. Register worker in `workers/worker.server.ts` with appropriate concurrency
5. No new K8s deployment needed — the unified worker handles all queues

## Related

- [Notifications](notifications.md) — Notification system architecture
- [Email Templates](email-templates.md) — React Email templates and Resend
- [Architecture](architecture.md) — System design overview
