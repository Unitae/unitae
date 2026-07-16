import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { assertCanRelease } from './event-status.policy'
import { PROGRAMME_ASSIGNMENT_TYPE } from './notifications.server'
import { buildAssignmentContext, notifyAssignment } from './notify-assignment.server'

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
    if (e instanceof ConflictError) return { error: e.message }
    throw e
  }

  const updated = await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId } },
    data: { status: 'released' },
  })

  audit({
    action: AuditAction.EventReleased,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: eventId,
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

  // Cancel every notification that hasn't fired yet for this event's
  // assignments — the schedule is not public anymore. Mails already sent
  // stay sent; the 30-min debounce is the safety net for that case.
  await db.notificationEvent.updateMany({
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

  audit({
    action: AuditAction.EventUnreleased,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: eventId,
  })

  return { event: updated }
}
