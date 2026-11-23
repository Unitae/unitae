import { isAwaitingProgramme, programmeTemplate } from '~/features/events/model/empty-meetings'
import { EventStatus } from '~/features/events/model/event-status.type'
import { ScheduleStatus } from '~/features/events/model/schedule.type'
import { TEMPLATE_PROGRAMME_COUNT } from '~/features/events/server/give-programme.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { assertCanRelease, EVENT_STATUS_ERRORS } from './event-status.policy'
import { cancelPendingAssignmentNotices } from './notify-assignment.server'
import { computeNotifyTargets, type NotifyTarget } from './release-notifications.server'

// Each schedule is published on its own (plan §10, D8, D51): its own conflicts block it, its own assignees are told,
// its own pending notices go when it is withdrawn. `Event.status` stays written until PR 6: released while any of its
// schedules is published, as members see it.

const logger = createLogger('schedule-status')

export type PublishScheduleResult =
  | { schedule: { id: number; eventId: number }; notifyTargets: NotifyTarget[] }
  // Absence conflicts to resolve, or a programme still to give: the routes tell them apart.
  | { error: string; reason: 'conflicts' | 'awaiting' }

const ITEM_SELECT = { id: true, name: true, hasConflict: true, assigneeId: true, assistantId: true } as const

/**
 * Whether the caller may publish or withdraw a schedule (plan §10, D8): « Publier » reaches every one; otherwise the
 * responsible of its template, through the role it names. A schedule without a template has no responsible (D47).
 */
export async function canPublishSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  scheduleId: number,
  congregationId: number,
): Promise<boolean> {
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, congregationId },
    select: { scheduleTemplate: { select: { responsibleRoleId: true } } },
  })
  if (schedule == null) return false
  if (can(Permission.CanPublishPrograms)) return true
  const role = schedule.scheduleTemplate?.responsibleRoleId
  if (role == null) return false
  return (await resolveEffectiveRoleIds(db, userId, congregationId)).includes(role)
}

/** Gives events holding schedules the status their schedules make: released while any is published (D51). */
export async function settleEventStatus(db: TransactionClient, eventIds: number[], congregationId: number) {
  if (eventIds.length === 0) return
  const scoped = { id: { in: eventIds }, congregationId }
  const published = { some: { status: ScheduleStatus.Published } }
  await db.event.updateMany({
    where: { ...scoped, schedules: published, status: { not: EventStatus.Released } },
    data: { status: EventStatus.Released },
  })
  await db.event.updateMany({
    where: {
      ...scoped,
      schedules: { some: {}, none: { status: ScheduleStatus.Published } },
      status: { not: EventStatus.Draft },
    },
    data: { status: EventStatus.Draft },
  })
}

/**
 * Publishes one schedule (tx-only, like releaseEvent: the notices go out afterwards, from the targets returned). Refused
 * while its own items hold a conflict, and for a programme its kind has yet to give. Publishing it again tells no one.
 */
export async function publishSchedule(
  db: TransactionClient,
  scheduleId: number,
  congregationId: number,
  actorId: number,
): Promise<PublishScheduleResult | null> {
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, congregationId },
    select: {
      id: true,
      eventId: true,
      kind: true,
      status: true,
      items: { select: ITEM_SELECT },
      event: { select: { template: { select: { key: true, ...TEMPLATE_PROGRAMME_COUNT } } } },
    },
  })
  if (schedule == null) return null
  const ref = { id: schedule.id, eventId: schedule.eventId }
  if (schedule.status === ScheduleStatus.Published) return { schedule: ref, notifyTargets: [] }

  const isProgramme = schedule.kind === 'programme'
  const parts = isProgramme ? schedule.items : []
  const services = isProgramme ? [] : schedule.items.map(({ assistantId: _assistant, ...service }) => service)
  // A meeting created ahead has no programme to publish until it is given one; its duties publish as they are.
  if (
    isProgramme &&
    isAwaitingProgramme({ parts: parts.length, services: 0, template: programmeTemplate(schedule.event.template) })
  ) {
    return { error: EVENT_STATUS_ERRORS.releaseAwaitingProgramme, reason: 'awaiting' }
  }
  try {
    assertCanRelease({ eventParts: parts, eventServiceParts: services })
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error
    logger.warn('publishing blocked by conflicts', { scheduleId, congregationId, actorId })
    return { error: error.message, reason: 'conflicts' }
  }

  await db.schedule.update({
    where: { id_congregationId: { id: scheduleId, congregationId } },
    data: { status: ScheduleStatus.Published },
  })
  await settleEventStatus(db, [schedule.eventId], congregationId)
  await auditInTransaction(db, {
    action: AuditAction.SchedulePublished,
    congregationId,
    actorId,
    entityType: 'Schedule',
    entityId: scheduleId,
    metadata: { eventId: schedule.eventId, kind: schedule.kind },
  })
  logger.info('schedule published', { scheduleId, eventId: schedule.eventId, congregationId, actorId })
  return { schedule: ref, notifyTargets: computeNotifyTargets(parts, services) }
}

/** Withdraws one schedule: nobody is told about its assignments while it is a draft again. */
export async function unpublishSchedule(
  db: TransactionClient,
  scheduleId: number,
  congregationId: number,
  actorId: number,
): Promise<{ schedule: { id: number; eventId: number } } | null> {
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, congregationId },
    select: { id: true, eventId: true, kind: true, status: true, items: { select: { id: true } } },
  })
  if (schedule == null) return null
  const ref = { id: schedule.id, eventId: schedule.eventId }
  if (schedule.status === ScheduleStatus.Draft) return { schedule: ref }

  await db.schedule.update({
    where: { id_congregationId: { id: scheduleId, congregationId } },
    data: { status: ScheduleStatus.Draft },
  })
  await settleEventStatus(db, [schedule.eventId], congregationId)
  const itemIds = schedule.items.map(item => item.id)
  const cancelledCount = await cancelPendingAssignmentNotices(db, congregationId, itemIds)
  await auditInTransaction(db, {
    action: AuditAction.ScheduleUnpublished,
    congregationId,
    actorId,
    entityType: 'Schedule',
    entityId: scheduleId,
    metadata: { eventId: schedule.eventId, kind: schedule.kind },
  })
  logger.info('schedule unpublished', {
    scheduleId,
    eventId: schedule.eventId,
    congregationId,
    actorId,
    cancelledCount,
  })
  return { schedule: ref }
}
