// BullMQ defaults shared across queues.
//
// Each queue owns its own tuple so per-queue trade-offs (backoff base,
// retention count) stay explicit at the call site — extracting a single
// "SHARED_ATTEMPTS = 3" would hide legitimate variation between queues.

// One attempt: a failed sync closes its run as failed and says why; the person runs it again.
// A retry would re-enter a run that is already closed.
export const SYNC_QUEUE_ATTEMPTS = 1
export const SYNC_QUEUE_REMOVE_ON_COMPLETE = 5
export const SYNC_QUEUE_REMOVE_ON_FAIL = 10

export const THUMBNAIL_QUEUE_ATTEMPTS = 3
export const THUMBNAIL_QUEUE_BACKOFF_MS = 5_000
export const THUMBNAIL_QUEUE_REMOVE_ON_COMPLETE = 20
export const THUMBNAIL_QUEUE_REMOVE_ON_FAIL = 10

export const EMAIL_QUEUE_ATTEMPTS = 3
export const EMAIL_QUEUE_BACKOFF_MS = 5_000
export const EMAIL_QUEUE_REMOVE_ON_COMPLETE = 10
export const EMAIL_QUEUE_REMOVE_ON_FAIL = 20
