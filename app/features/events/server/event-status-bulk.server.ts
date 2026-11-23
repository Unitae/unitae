// Bulk orchestrators for release / unrelease: « Tout publier » and « Tout retirer » (D43) on each selected event,
// each in its own withScope so a slow or failing event does not eat the batch tx budget; per-event failures land in a
// `failed` bucket instead of aborting the loop.

import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import {
  type PublishEventResult,
  publishEvent,
  type UnpublishEventResult,
  unpublishEvent,
} from './event-publishing.server'
import { fireReleaseNotifications, type ReleaseNotificationContext } from './event-status.server'

const logger = createLogger('event-status')

export type BulkReleaseResult = {
  /** Events published by this call, or with nothing of theirs left to publish. */
  released: number[]
  blocked: { id: number; error: string }[]
  /** Meetings with no programme yet: nothing to publish. */
  awaiting: number[]
  /** Events none of whose schedules is the person's to publish. */
  refused: number[]
  notFound: number[]
  failed: { id: number; error: string }[]
  /** Draft schedules of the published events left to someone else. */
  heldSchedules: number
  /** Schedules of the published events their own absence conflicts held back as drafts. */
  conflictedSchedules: number
}

// Notifications fire outside each event's tx to keep it pure and rollback-safe; a Prisma error inside one (pool
// exhaustion, timeout, connection reset) lands in `failed` and the loop continues.
export async function bulkReleaseEvents(
  eventIds: number[],
  can: (permission: Permission) => boolean,
  actorId: number,
  congregationId: number,
  ctx: ReleaseNotificationContext,
): Promise<BulkReleaseResult> {
  const out: BulkReleaseResult = {
    released: [],
    blocked: [],
    awaiting: [],
    refused: [],
    notFound: [],
    failed: [],
    heldSchedules: 0,
    conflictedSchedules: 0,
  }

  for (const id of eventIds) {
    let result: PublishEventResult | null
    try {
      result = await withScope(congregationId, tx => publishEvent(tx, can, actorId, id, congregationId))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('bulk release: per-event transaction failed', { eventId: id, congregationId, actorId, err })
      out.failed.push({ id, error: message })
      continue
    }
    if (result == null) {
      out.notFound.push(id)
      continue
    }
    if ('refused' in result) {
      out.refused.push(id)
      continue
    }
    out.heldSchedules += result.skipped
    const held = result.blocked[0]
    if (!result.changed && held != null) {
      if (held.reason === 'awaiting') out.awaiting.push(id)
      else out.blocked.push({ id, error: held.error })
      continue
    }
    out.released.push(id)
    // Published in part: what stayed a draft is said, a programme still to give with the meetings awaiting one.
    out.conflictedSchedules += result.blocked.filter(blocked => blocked.reason === 'conflicts').length
    if (result.blocked.some(blocked => blocked.reason === 'awaiting')) out.awaiting.push(id)
    // Notifications AFTER the event's tx has committed. Any per-target failure is swallowed inside
    // fireReleaseNotifications, so this call never throws.
    await fireReleaseNotifications(result.event, result.notifyTargets, congregationId, actorId, ctx)
  }

  return out
}

export type BulkUnreleaseResult = {
  unreleased: number[]
  refused: number[]
  notFound: number[]
  failed: { id: number; error: string }[]
  /** Published schedules of the withdrawn events left to someone else. */
  heldSchedules: number
}

export async function bulkUnreleaseEvents(
  eventIds: number[],
  can: (permission: Permission) => boolean,
  actorId: number,
  congregationId: number,
): Promise<BulkUnreleaseResult> {
  const out: BulkUnreleaseResult = { unreleased: [], refused: [], notFound: [], failed: [], heldSchedules: 0 }

  for (const id of eventIds) {
    let result: UnpublishEventResult | null
    try {
      result = await withScope(congregationId, tx => unpublishEvent(tx, can, actorId, id, congregationId))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('bulk unrelease: per-event transaction failed', { eventId: id, congregationId, actorId, err })
      out.failed.push({ id, error: message })
      continue
    }
    if (result == null) out.notFound.push(id)
    else if ('refused' in result) out.refused.push(id)
    else {
      out.unreleased.push(id)
      out.heldSchedules += result.skipped
    }
  }

  return out
}
