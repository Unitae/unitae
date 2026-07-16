import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { assertCanRelease } from './event-status.policy'
import { PROGRAMME_ASSIGNMENT_TYPE } from './notifications.server'
import { buildAssignmentContext, notifyAssignment } from './notify-assignment.server'

const logger = createLogger('event-status')

export type ReleaseNotificationContext = {
  locale: string
  timezone: string
}

export type ReleaseResult = { event: EventWithStatus } | { error: string }

type EventWithStatus = {
  id: number
  status: string
  templateId: number | null
}

const eventWithAssignmentsInclude = {
  partAssignments: {
    select: {
      id: true,
      name: true,
      hasConflict: true,
      assigneeId: true,
      assistantId: true,
    },
  },
  serviceRoleAssignments: {
    select: {
      id: true,
      name: true,
      hasConflict: true,
      assigneeId: true,
    },
  },
}

export async function releaseEvent(
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  actorId: number,
  ctx: ReleaseNotificationContext,
): Promise<ReleaseResult | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    include: eventWithAssignmentsInclude,
  })
  if (!event) return null

  if (event.status === 'released') return { event }

  try {
    assertCanRelease({ parts: event.partAssignments, serviceRoles: event.serviceRoleAssignments })
  } catch (e) {
    if (e instanceof ConflictError) {
      const conflictingParts = event.partAssignments.filter(p => p.hasConflict).length
      const conflictingServices = event.serviceRoleAssignments.filter(s => s.hasConflict).length
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
    data: { status: 'released' },
  })

  // auditInTransaction (not audit) so the audit row is written on the same
  // client as the release flip and rolls back with it. audit() writes on
  // unscopedDb — it would leave a phantom EventReleased row if the tx aborts
  // (e.g. mid-batch bulk-release failure).
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
    partCount: event.partAssignments.length,
    serviceRoleCount: event.serviceRoleAssignments.length,
  })

  const notificationCtxBase = buildAssignmentContext({
    event: {
      id: event.id,
      name: event.name,
      startDate: event.startDate,
      templateId: event.templateId,
      // We just flipped the row to released; downstream dispatchAssignmentDiffs
      // gates on this and would suppress the whole release notification burst
      // otherwise.
      status: 'released',
    },
    assignmentName: '',
    entityType: 'ProgrammePartAssignment',
    entityId: 0,
    congregationId,
    actorId,
    locale: ctx.locale,
    timezone: ctx.timezone,
  })

  for (const part of event.partAssignments) {
    if (part.assigneeId != null) {
      await notifyAssignment(
        db,
        { ...notificationCtxBase, entityType: 'ProgrammePartAssignment', entityId: part.id, assignmentName: part.name },
        { type: PROGRAMME_ASSIGNMENT_TYPE.assigned, memberId: part.assigneeId, role: 'speaker' },
      )
    }
    if (part.assistantId != null) {
      await notifyAssignment(
        db,
        { ...notificationCtxBase, entityType: 'ProgrammePartAssignment', entityId: part.id, assignmentName: part.name },
        { type: PROGRAMME_ASSIGNMENT_TYPE.assigned, memberId: part.assistantId, role: 'reader' },
      )
    }
  }

  for (const service of event.serviceRoleAssignments) {
    if (service.assigneeId != null) {
      await notifyAssignment(
        db,
        {
          ...notificationCtxBase,
          entityType: 'ProgrammeServiceRoleAssignment',
          entityId: service.id,
          assignmentName: service.name,
        },
        { type: PROGRAMME_ASSIGNMENT_TYPE.assigned, memberId: service.assigneeId, role: 'servant' },
      )
    }
  }

  return { event: updated }
}

export async function unreleaseEvent(
  db: TransactionClient,
  eventId: number,
  congregationId: number,
  actorId: number,
): Promise<ReleaseResult | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    include: {
      partAssignments: { select: { id: true } },
      serviceRoleAssignments: { select: { id: true } },
    },
  })
  if (!event) return null

  if (event.status === 'draft') return { event }

  const updated = await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId } },
    data: { status: 'draft' },
  })

  const partIds = event.partAssignments.map(p => p.id)
  const serviceIds = event.serviceRoleAssignments.map(s => s.id)

  // Skip the notificationEvent updateMany entirely when there are no
  // assignments — an empty `in: []` matches nothing under Prisma today, but
  // depending on that contract is brittle: one refactor and we'd cancel
  // every pending notification in the congregation.
  let cancelledCount = 0
  if (partIds.length > 0 || serviceIds.length > 0) {
    // Cancel every notification that hasn't fired yet for this event's
    // assignments — the schedule is not public anymore. Mails already sent
    // stay sent; the 30-min debounce is the safety net for that case.
    const result = await db.notificationEvent.updateMany({
      where: {
        congregationId,
        status: 'pending',
        OR: [
          { entityType: 'ProgrammePartAssignment', entityId: { in: partIds } },
          { entityType: 'ProgrammeServiceRoleAssignment', entityId: { in: serviceIds } },
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

export type BulkReleaseResult = {
  released: number[]
  blocked: { id: number; error: string }[]
  notFound: number[]
}

// Owns the per-event iteration for bulk release so the route stays a thin
// auth-plus-flash wrapper. releaseEvent returns a tagged union so a blocker
// on one event does not abort the batch — it lands in the `blocked` bucket
// while the transaction stays alive.
export async function bulkReleaseEvents(
  db: TransactionClient,
  eventIds: number[],
  congregationId: number,
  actorId: number,
  ctx: ReleaseNotificationContext,
): Promise<BulkReleaseResult> {
  const released: number[] = []
  const blocked: { id: number; error: string }[] = []
  const notFound: number[] = []
  for (const id of eventIds) {
    const result = await releaseEvent(db, id, congregationId, actorId, ctx)
    if (result == null) notFound.push(id)
    else if ('error' in result) blocked.push({ id, error: result.error })
    else released.push(id)
  }
  return { released, blocked, notFound }
}

export type BulkUnreleaseResult = {
  unreleased: number[]
  notFound: number[]
}

export async function bulkUnreleaseEvents(
  db: TransactionClient,
  eventIds: number[],
  congregationId: number,
  actorId: number,
): Promise<BulkUnreleaseResult> {
  const unreleased: number[] = []
  const notFound: number[] = []
  for (const id of eventIds) {
    const result = await unreleaseEvent(db, id, congregationId, actorId)
    if (result == null) notFound.push(id)
    else unreleased.push(id)
  }
  return { unreleased, notFound }
}
