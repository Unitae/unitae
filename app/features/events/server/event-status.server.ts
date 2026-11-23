import { isAwaitingProgramme, programmeTemplate } from '~/features/events/model/empty-meetings'
import { EventStatus } from '~/features/events/model/event-status.type'
import { TEMPLATE_PROGRAMME_COUNT } from '~/features/events/server/give-programme.server'
import { PART_ITEMS, SERVICE_ITEM_ORDER, SERVICE_ITEMS } from '~/features/events/server/item-projection.server'
import { setEventSchedulesStatus } from '~/features/events/server/schedules.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { assertCanRelease, EVENT_STATUS_ERRORS } from './event-status.policy'
import { type AssignmentChangeType, PROGRAMME_ASSIGNMENT_TYPE } from './notifications.server'
import { buildAssignmentContext, cancelPendingAssignmentNotices, notifyAssignment } from './notify-assignment.server'
import { computeNotifyTargets, type NotifyTarget } from './release-notifications.server'

const logger = createLogger('event-status')

export type ReleaseNotificationContext = {
  locale: string
  timezone: string
}

type EventWithStatus = {
  id: number
  name: string
  startDate: Date
  status: string
  templateId: number | null
}

export type ReleaseResult =
  | { event: EventWithStatus; notifyTargets: NotifyTarget[] }
  // Absence conflicts to resolve, or a meeting with no programme yet: the bulk page tells them apart.
  | { error: string; reason: 'conflicts' | 'awaiting' }
// No policy currently blocks an un-release — the only ways it can not-succeed
// are "event doesn't exist" (returns null) or a raw Prisma throw (caught by
// the bulk caller). Keep this shape narrow; widen it the day an unrelease
// invariant is introduced.
export type UnreleaseResult = { event: EventWithStatus }

export const ASSIGNMENT_SELECT = {
  id: true,
  name: true,
  hasConflict: true,
  assigneeId: true,
  assistantId: true,
} as const

/** An event with its parts and services, read from items (plan T12), in the shape the release checks take. */
async function eventWithAssignments(db: TransactionClient, eventId: number, congregationId: number) {
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    include: { template: { select: { key: true, ...TEMPLATE_PROGRAMME_COUNT } } },
  })
  if (!event) return null
  const [eventParts, services] = await Promise.all([
    db.item.findMany({ where: { eventId, congregationId, ...PART_ITEMS }, select: ASSIGNMENT_SELECT }),
    db.item.findMany({
      where: { eventId, congregationId, ...SERVICE_ITEMS },
      select: ASSIGNMENT_SELECT,
      orderBy: SERVICE_ITEM_ORDER,
    }),
  ])
  const eventServiceParts = services.map(({ assistantId: _assistant, ...service }) => service)
  return { ...event, eventParts, eventServiceParts }
}

// Tx-only half of the release flow. State flip + audit happen on the tx
// client; notification enqueue is DEFERRED to fireReleaseNotifications so a
// Prisma error inside a notify.create cannot poison this transaction (in
// Postgres, once a statement errors inside a tx the whole tx is marked
// aborted and any subsequent COMMIT becomes ROLLBACK).
export async function releaseEvent(
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  actorId: number,
): Promise<ReleaseResult | null> {
  const event = await eventWithAssignments(db, eventId, congregationId)
  if (!event) return null

  // Already-released events return with empty notifyTargets so callers do
  // not re-fire notifications on every retry.
  if (event.status === EventStatus.Released) return { event, notifyTargets: [] }

  // A meeting created ahead has nothing to publish until it has its programme.
  if (
    isAwaitingProgramme({
      parts: event.eventParts.length,
      services: event.eventServiceParts.length,
      template: programmeTemplate(event.template),
    })
  ) {
    return { error: EVENT_STATUS_ERRORS.releaseAwaitingProgramme, reason: 'awaiting' }
  }

  try {
    assertCanRelease({ eventParts: event.eventParts, eventServiceParts: event.eventServiceParts })
  } catch (e) {
    if (e instanceof ConflictError) {
      const conflictingParts = event.eventParts.filter(p => p.hasConflict).length
      const conflictingServices = event.eventServiceParts.filter(s => s.hasConflict).length
      logger.warn('release blocked by conflicts', {
        eventId,
        congregationId,
        actorId,
        conflictingParts,
        conflictingServices,
      })
      return { error: e.message, reason: 'conflicts' }
    }
    throw e
  }

  const updated = await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId } },
    data: { status: EventStatus.Released },
  })
  await setEventSchedulesStatus(db, [eventId], EventStatus.Released, congregationId)

  // auditInTransaction (not audit) so the audit row is written on the same
  // client as the release flip and rolls back with it.
  await auditInTransaction(db, {
    action: AuditAction.EventReleased,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: eventId,
  })
  logger.info('event released', {
    eventId,
    congregationId,
    actorId,
    partCount: event.eventParts.length,
    servicePartCount: event.eventServiceParts.length,
  })

  const notifyTargets = computeNotifyTargets(event.eventParts, event.eventServiceParts)
  return { event: updated, notifyTargets }
}

// Fires the release-time "you are assigned" notification for every target.
// Runs OUTSIDE any release tx and opens a fresh withScope per target so a
// single failure is isolated — neither pollutes another notify's tx nor
// affects the release itself, which has already committed by this point.
export async function fireReleaseNotifications(
  event: { id: number; name: string; startDate: Date; templateId: number | null },
  targets: NotifyTarget[],
  congregationId: number,
  actorId: number,
  ctx: ReleaseNotificationContext,
  /** « vous êtes assigné » on publishing; « Attribution annulée » when a published schedule is deleted (D41). */
  type: AssignmentChangeType = PROGRAMME_ASSIGNMENT_TYPE.assigned,
): Promise<void> {
  if (targets.length === 0) return

  const ctxBase = buildAssignmentContext({
    event: {
      id: event.id,
      name: event.name,
      startDate: event.startDate,
      templateId: event.templateId,
    },
    assignmentName: '',
    entityType: 'Item',
    entityId: 0,
    congregationId,
    actorId,
    locale: ctx.locale,
    timezone: ctx.timezone,
  })

  for (const target of targets) {
    try {
      await withScope(congregationId, tx =>
        notifyAssignment(
          tx,
          {
            ...ctxBase,
            entityType: target.entityType,
            entityId: target.entityId,
            assignmentName: target.assignmentName,
          },
          { type, memberId: target.memberId, role: target.role },
        ),
      )
    } catch (err) {
      logger.error('release notification enqueue failed', {
        eventId: event.id,
        congregationId,
        memberId: target.memberId,
        entityType: target.entityType,
        entityId: target.entityId,
        role: target.role,
        err,
      })
    }
  }
}

export async function unreleaseEvent(
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  actorId: number,
): Promise<UnreleaseResult | null> {
  const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
  if (!event) return null

  if (event.status === EventStatus.Draft) return { event }

  const updated = await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId } },
    data: { status: EventStatus.Draft },
  })
  await setEventSchedulesStatus(db, [eventId], EventStatus.Draft, congregationId)

  const itemIds = (await db.item.findMany({ where: { eventId, congregationId }, select: { id: true } })).map(
    item => item.id,
  )

  // Nobody is told about assignments on a programme going back to a draft.
  const cancelledCount = await cancelPendingAssignmentNotices(db, congregationId, itemIds)

  await auditInTransaction(db, {
    action: AuditAction.EventUnreleased,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: eventId,
  })
  logger.info('event unreleased', {
    eventId,
    congregationId,
    actorId,
    cancelledCount,
    itemCount: itemIds.length,
  })

  return { event: updated }
}
