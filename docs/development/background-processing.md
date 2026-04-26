# Background Processing

## Overview

Unitae uses a Redis-based background job processing system built on **BullMQ**. A single multi-queue worker process handles four job types: territory data sync, email notifications, PDF thumbnail generation, and data transfer (export/import). Jobs carry `congregationId` to maintain tenant isolation.

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
} as const
```

## Queues

### Sync Queue

Imports and processes open data (BANO addresses) for territory management.

- **Producer**: `app/features/territories/server/sync-queue.server.ts`
- **Handler**: `app/features/territories/server/handle-sync-work.server.ts`
- **Concurrency**: 1 (CPU/IO-intensive import)
- **Retries**: 3 attempts, exponential backoff (10s base)
- **Tenant isolation**: Uses `withScope(congregationId, ...)` for RLS-scoped DB access
- **Job data**: `{ userEmail, userName?, congregationId }`

### Email Queue

Sends notification emails asynchronously with automatic retries.

- **Producer**: `app/shared/infra/email-queue.server.ts`
- **Handler**: `app/shared/infra/handle-email-work.server.tsx`
- **Concurrency**: 5 (IO-bound Resend API calls)
- **Retries**: 3 attempts, exponential backoff (5s base)
- **Tenant isolation**: Uses `unscopedDb` with explicit `congregationId` filtering
- **Locale**: Wraps email rendering in `runWithLocale(congregation.locale, ...)` for i18n

Job types (discriminated union on `type`):
- `new-document-notification`: Notifies board validators when a document is uploaded
- `documents-expiring`: Notifies validators about documents expiring within 48h
- `notification-digest`: Batched notification email after debounce window settles
- `notification-instant`: Immediate notification email (no debounce)

### Thumbnail Queue

Generates PDF thumbnails asynchronously after document upload.

- **Producer**: `app/features/display-board/server/thumbnail-queue.server.ts`
- **Handler**: `app/features/display-board/server/handle-thumbnail-work.server.ts`
- **Concurrency**: 2 (CPU-bound `pdftoppm` subprocess)
- **Retries**: 3 attempts, exponential backoff (5s base)
- **Job data**: `{ congregationId, documentId, pdfStorageKey }`
- **Flow**: Fetch PDF from storage → run `pdftoppm` → upload thumbnail → update document record

Documents are created with `thumbnailUri: null` and updated asynchronously when the worker completes.

### Data Transfer Queue

Handles congregation data export and import as background jobs.

- **Producer**: `app/features/settings/server/data-transfer-queue.server.ts`
- **Handler**: `app/features/settings/server/handle-data-transfer-work.server.ts`
- **Concurrency**: 1 (IO-intensive archive creation/extraction)
- **Retries**: None (1 attempt only)
- **Tenant isolation**: Uses `withScope(congregationId, ...)` for RLS-scoped DB access

Job types (discriminated union on `type`):
- `export`: Creates a `.unitae` archive (ZIP) with congregation data and optional uploaded files
- `import`: Extracts a `.unitae` archive and imports entities with ID remapping

## Worker Locale Support

Background emails must render in the congregation's language. The worker uses `AsyncLocalStorage` via `app/shared/utils/worker-locale.server.ts`:

```typescript
import { runWithLocale } from '~/shared/utils/worker-locale.server'

// In email handler:
await runWithLocale(congregation.locale, async () => {
  // All Paraglide m.*() calls resolve to the correct locale
  await mailer.emails.send({ subject: m.email_subject(), ... })
})
```

This module is imported at the top of `workers/worker.server.ts` before any handler imports, ensuring `overwriteGetLocale()` is called once at startup.

## Worker Health & Lifecycle

The unified worker (`workers/worker.server.ts`) manages all four queue workers:

- **Health endpoint**: HTTP server on port `WORKER_HEALTH_PORT` (default 9090)
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
3. Create handler: `app/features/{feature}/server/handle-{name}-work.server.ts`
   - For scoped DB access: use `withScope(congregationId, ...)`
   - For cross-tenant queries: use `unscopedDb` with explicit `where: { congregationId }`
   - For email rendering: wrap in `runWithLocale(congregation.locale, ...)`
4. Register worker in `workers/worker.server.ts` with appropriate concurrency
5. No new K8s deployment needed — the unified worker handles all queues
