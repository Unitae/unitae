import { EventStatus } from '~/features/events/model/event-status.type'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { assertCanRelease } from './event-status.policy'
import { PROGRAMME_ASSIGNMENT_TYPE } from './notifications.server'
import { buildAssignmentContext, notifyAssignment } from './notify-assignment.server'

const logger = createLogger('event-status')

export type ReleaseNotificationContext = {
  locale: string
  timezone: string
}

// Descriptor for a single publisher who needs the "you are assigned"
// notification when the event flips to released. Computed from the event
// under the release tx and fired OUTSIDE the tx by fireReleaseNotifications.
export type NotifyTarget = {
  entityType: 'EventPart' | 'EventServiceRole'
  entityId: number
  assignmentName: string
  memberId: number
  role: 'speaker' | 'reader' | 'servant'
}

type EventWithStatus = {
  id: number
  name: string
  startDate: Date
  status: string
  templateId: number | null
}

export type ReleaseResult = { event: EventWithStatus; notifyTargets: NotifyTarget[] } | { error: string }
// No policy currently blocks an un-release — the only ways it can not-succeed
// are "event doesn't exist" (returns null) or a raw Prisma throw (caught by
// the bulk caller). Keep this shape narrow; widen it the day an unrelease
// invariant is introduced.
export type UnreleaseResult = { event: EventWithStatus }

const eventWithAssignmentsInclude = {
  parts: {
    select: {
      id: true,
      name: true,
      hasConflict: true,
      assigneeId: true,
      assistantId: true,
    },
  },
  serviceRoles: {
    select: {
      id: true,
      name: true,
      hasConflict: true,
      assigneeId: true,
    },
  },
}

type PartRow = { id: number; name: string; hasConflict: boolean; assigneeId: number | null; assistantId: number | null }
type ServiceRoleRow = { id: number; name: string; hasConflict: boolean; assigneeId: number | null }

function computeNotifyTargets(parts: PartRow[], services: ServiceRoleRow[]): NotifyTarget[] {
  const targets: NotifyTarget[] = []
  for (const part of parts) {
    if (part.assigneeId != null) {
      targets.push({
        entityType: 'EventPart',
        entityId: part.id,
        assignmentName: part.name,
        memberId: part.assigneeId,
        role: 'speaker',
      })
    }
    if (part.assistantId != null) {
      targets.push({
        entityType: 'EventPart',
        entityId: part.id,
        assignmentName: part.name,
        memberId: part.assistantId,
        role: 'reader',
      })
    }
  }
  for (const service of services) {
    if (service.assigneeId != null) {
      targets.push({
        entityType: 'EventServiceRole',
        entityId: service.id,
        assignmentName: service.name,
        memberId: service.assigneeId,
        role: 'servant',
      })
    }
  }
  return targets
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
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    include: eventWithAssignmentsInclude,
  })
  if (!event) return null

  // Already-released events return with empty notifyTargets so callers do
  // not re-fire notifications on every retry.
  if (event.status === EventStatus.Released) return { event, notifyTargets: [] }

  try {
    assertCanRelease({ parts: event.parts, serviceRoles: event.serviceRoles })
  } catch (e) {
    if (e instanceof ConflictError) {
      const conflictingParts = event.parts.filter(p => p.hasConflict).length
      const conflictingServices = event.serviceRoles.filter(s => s.hasConflict).length
      logger.warn('release blocked by conflicts', {
        eventId,
        congregationId,
        actorId,
        conflictingParts,
        conflictingServices,
      })
      return { error: e.message }
    }
    throw e
  }

  const updated = await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId } },
    data: { status: EventStatus.Released },
  })

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
    partCount: event.parts.length,
    serviceRoleCount: event.serviceRoles.length,
  })

  const notifyTargets = computeNotifyTargets(event.parts, event.serviceRoles)
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
): Promise<void> {
  if (targets.length === 0) return

  const ctxBase = buildAssignmentContext({
    event: {
      id: event.id,
      name: event.name,
      startDate: event.startDate,
      templateId: event.templateId,
      // Load-bearing: dispatchAssignmentDiffs whitelist-gates on this. If
      // we dropped this stamp, the whole release burst would self-suppress.
      status: EventStatus.Released,
    },
    assignmentName: '',
    entityType: 'EventPart',
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
          { type: PROGRAMME_ASSIGNMENT_TYPE.assigned, memberId: target.memberId, role: target.role },
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
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    include: {
      parts: { select: { id: true } },
      serviceRoles: { select: { id: true } },
    },
  })
  if (!event) return null

  if (event.status === EventStatus.Draft) return { event }

  const updated = await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId } },
    data: { status: EventStatus.Draft },
  })

  const partIds = event.parts.map(p => p.id)
  const serviceIds = event.serviceRoles.map(s => s.id)

  // Skip the notificationEvent updateMany entirely when there are no
  // assignments — an empty `in: []` matches nothing under Prisma today, but
  // depending on that contract is brittle: one refactor and we'd cancel
  // every pending notification in the congregation.
  let cancelledCount = 0
  if (partIds.length > 0 || serviceIds.length > 0) {
    const result = await db.notificationEvent.updateMany({
      where: {
        congregationId,
        status: 'pending',
        OR: [
          { entityType: 'EventPart', entityId: { in: partIds } },
          { entityType: 'EventServiceRole', entityId: { in: serviceIds } },
        ],
      },
      data: { status: 'cancelled', processedAt: new Date() },
    })
    cancelledCount = result.count
  }

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
    partCount: partIds.length,
    serviceRoleCount: serviceIds.length,
  })

  return { event: updated }
}
