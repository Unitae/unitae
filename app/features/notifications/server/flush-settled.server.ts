import { unscopedDb } from '~/shared/infra/db.server'
import { emailQueue } from '~/shared/infra/email-queue.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('notifications')

export interface FlushResult {
  eventsProcessed: number
  emailsEnqueued: number
}

// Processes settled debounced notifications: groups them into digests and pushes to emailQueue
export async function flushSettledNotifications(): Promise<FlushResult> {
  const now = new Date()
  let eventsProcessed = 0
  let emailsEnqueued = 0

  // Use a transaction with raw SQL FOR UPDATE SKIP LOCKED to prevent concurrent processing
  await unscopedDb.$transaction(async tx => {
    // biome-ignore lint/suspicious/noExplicitAny: raw query returns untyped rows
    const settledEvents: any[] = await tx.$queryRaw`
      SELECT * FROM "NotificationEvent"
      WHERE "status" = 'pending'
        AND "debounceUntil" IS NOT NULL
        AND "debounceUntil" <= ${now}
      ORDER BY "congregationId", "createdAt"
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    `

    if (settledEvents.length === 0) return

    eventsProcessed = settledEvents.length

    // Group by (congregationId, recipientId or recipientRole, type family)
    const groups = groupEvents(settledEvents)

    for (const [_groupKey, events] of groups) {
      const first = events[0]
      const congregationId = first.congregationId as number

      await emailQueue.add('notification-digest', {
        type: 'notification-digest',
        congregationId,
        recipientId: (first.recipientId as number | null) ?? 0,
        events: events.map(e => ({
          type: e.type as string,
          entityType: e.entityType as string,
          entityId: e.entityId as number,
          payload: e.payload as string,
        })),
        notificationEventIds: events.map(e => e.id as number),
      })

      emailsEnqueued++
    }

    // Mark all processed events as sent
    const eventIds = settledEvents.map(e => e.id as number)
    await tx.notificationEvent.updateMany({
      where: { id: { in: eventIds } },
      data: { status: 'sent', processedAt: now },
    })
  })

  if (eventsProcessed > 0) {
    logger.info('Flushed settled notifications', { eventsProcessed, emailsEnqueued })
  }

  return { eventsProcessed, emailsEnqueued }
}

// Groups events by congregation + recipient + type family (e.g., 'board', 'attribution')
// biome-ignore lint/suspicious/noExplicitAny: raw query rows are untyped
export function groupEvents(events: any[]): Map<string, any[]> {
  // biome-ignore lint/suspicious/noExplicitAny: raw query rows are untyped
  const groups = new Map<string, any[]>()

  for (const event of events) {
    const typeFamily = (event.type as string).split('.')[0]
    const recipientPart = event.recipientId != null ? `user:${event.recipientId}` : `role:${event.recipientRole ?? ''}`
    const groupKey = `${event.congregationId}:${recipientPart}:${typeFamily}`

    const group = groups.get(groupKey)
    if (group) {
      group.push(event)
    } else {
      groups.set(groupKey, [event])
    }
  }

  return groups
}
