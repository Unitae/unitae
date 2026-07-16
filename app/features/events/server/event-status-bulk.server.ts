// Bulk orchestrators for release / unrelease. Each event runs in its own
// withScope so a slow or failing event does not eat the batch tx budget;
// per-event failures land in a `failed` bucket instead of aborting the loop.

import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import {
  fireReleaseNotifications,
  type ReleaseNotificationContext,
  type ReleaseResult,
  releaseEvent,
  type UnreleaseResult,
  unreleaseEvent,
} from './event-status.server'

const logger = createLogger('event-status')

export type BulkReleaseResult = {
  released: number[]
  blocked: { id: number; error: string }[]
  notFound: number[]
  failed: { id: number; error: string }[]
}

// Per-event withScope wrapping — a slow or failing event does not eat the
// batch budget. A Prisma error inside the release tx (pool exhaustion,
// timeout, connection reset) lands in the `failed` bucket via the try/catch
// around withScope; the loop continues. Notifications fire outside the
// release tx to keep the tx pure and rollback-safe.
export async function bulkReleaseEvents(
  eventIds: number[],
  congregationId: number,
  actorId: number,
  ctx: ReleaseNotificationContext,
): Promise<BulkReleaseResult> {
  const released: number[] = []
  const blocked: { id: number; error: string }[] = []
  const notFound: number[] = []
  const failed: { id: number; error: string }[] = []

  for (const id of eventIds) {
    let result: ReleaseResult | null
    try {
      result = await withScope(congregationId, tx => releaseEvent(tx, id, congregationId, actorId))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('bulk release: per-event transaction failed', { eventId: id, congregationId, actorId, err })
      failed.push({ id, error: message })
      continue
    }
    if (result == null) {
      notFound.push(id)
      continue
    }
    if ('error' in result) {
      blocked.push({ id, error: result.error })
      continue
    }
    released.push(id)
    // Notifications AFTER the release tx has committed. Any per-target
    // failure is swallowed inside fireReleaseNotifications, so this call
    // never throws.
    await fireReleaseNotifications(result.event, result.notifyTargets, congregationId, actorId, ctx)
  }

  return { released, blocked, notFound, failed }
}

export type BulkUnreleaseResult = {
  unreleased: number[]
  notFound: number[]
  failed: { id: number; error: string }[]
}

export async function bulkUnreleaseEvents(
  eventIds: number[],
  congregationId: number,
  actorId: number,
): Promise<BulkUnreleaseResult> {
  const unreleased: number[] = []
  const notFound: number[] = []
  const failed: { id: number; error: string }[] = []

  for (const id of eventIds) {
    let result: UnreleaseResult | null
    try {
      result = await withScope(congregationId, tx => unreleaseEvent(tx, id, congregationId, actorId))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('bulk unrelease: per-event transaction failed', { eventId: id, congregationId, actorId, err })
      failed.push({ id, error: message })
      continue
    }
    if (result == null) notFound.push(id)
    else if ('error' in result) failed.push({ id, error: result.error })
    else unreleased.push(id)
  }

  return { unreleased, notFound, failed }
}
