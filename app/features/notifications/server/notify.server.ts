import type { TransactionClient } from '~/shared/infra/db.server'
import { emailQueue } from '~/shared/infra/email-queue.server'
import { createLogger } from '~/shared/infra/logger.server'
import { isCancellationType } from '../model/notification-event.type'
import { NOTIFICATION_TYPES } from './notification-types.server'

const logger = createLogger('notifications')

export interface NotifyParams {
  type: string
  entityType: string
  entityId: number
  congregationId: number
  recipientId?: number
  recipientRole?: string
  actorId?: number
  payload?: Record<string, unknown>
}

export async function notify(db: TransactionClient, params: NotifyParams): Promise<void> {
  const config = NOTIFICATION_TYPES[params.type]
  if (!config) {
    logger.warn('Unknown notification type, skipping', { type: params.type })
    return
  }

  // Resolve recipientRole from config if not explicitly provided
  const resolvedParams = { ...params }
  if (!resolvedParams.recipientRole && !isCancellationType(config) && config.recipientRole) {
    resolvedParams.recipientRole = config.recipientRole
  }

  if (isCancellationType(config)) {
    // For cancellation types, resolve role from the fallback config
    if (!resolvedParams.recipientRole && config.fallback.recipientRole) {
      resolvedParams.recipientRole = config.fallback.recipientRole
    }
    await handleCancellation(db, resolvedParams, config.cancels, config.fallback)
    return
  }

  if (config.debounceMinutes > 0) {
    await queueDebounced(db, resolvedParams, config.debounceMinutes)
    return
  }

  // Instant — push directly to BullMQ
  await pushToEmailQueue(resolvedParams)
}

async function handleCancellation(
  db: TransactionClient,
  params: NotifyParams,
  cancels: string[],
  fallback: { debounceMinutes: number; recipientStrategy: string; recipientRole?: string },
): Promise<void> {
  const debounceKey = buildDebounceKey(params)

  // Try to cancel matching pending events
  const { count: cancelledCount } = await db.notificationEvent.updateMany({
    where: {
      debounceKey,
      status: 'pending',
      type: { in: cancels },
    },
    data: {
      status: 'cancelled',
      processedAt: new Date(),
    },
  })

  if (cancelledCount > 0) {
    logger.info('Cancelled pending notifications', {
      type: params.type,
      debounceKey,
      cancelledCount,
    })
    return
  }

  // Nothing to cancel — send fallback notification
  if (fallback.debounceMinutes > 0) {
    await queueDebounced(db, params, fallback.debounceMinutes)
  } else {
    await pushToEmailQueue(params)
  }
}

async function queueDebounced(db: TransactionClient, params: NotifyParams, debounceMinutes: number): Promise<void> {
  const debounceKey = buildDebounceKey(params)

  // Replace any existing pending event with the same key and type
  await db.notificationEvent.updateMany({
    where: {
      debounceKey,
      status: 'pending',
      type: params.type,
    },
    data: {
      status: 'cancelled',
      processedAt: new Date(),
    },
  })

  const debounceUntil = new Date(Date.now() + debounceMinutes * 60 * 1000)

  await db.notificationEvent.create({
    data: {
      type: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      congregationId: params.congregationId,
      recipientId: params.recipientId ?? null,
      recipientRole: params.recipientRole ?? null,
      actorId: params.actorId ?? null,
      payload: JSON.stringify(params.payload ?? {}),
      debounceKey,
      debounceUntil,
    },
  })

  logger.info('Queued debounced notification', {
    type: params.type,
    debounceKey,
    debounceUntil: debounceUntil.toISOString(),
  })
}

async function pushToEmailQueue(params: NotifyParams): Promise<void> {
  try {
    await emailQueue.add('notification-instant', {
      type: 'notification-instant',
      congregationId: params.congregationId,
      notificationType: params.type,
      recipientId: params.recipientId ?? null,
      recipientRole: params.recipientRole ?? null,
      payload: JSON.stringify(params.payload ?? {}),
    })
  } catch (error) {
    // Fire-and-forget: a missed notification email is less critical than a failed business write
    logger.error('Failed to enqueue instant notification', { type: params.type, error })
  }
}

function buildDebounceKey(params: NotifyParams): string {
  const recipientPart = params.recipientId != null ? `user:${params.recipientId}` : `role:${params.recipientRole ?? ''}`
  return `${params.entityType}:${params.entityId}:${recipientPart}`
}
