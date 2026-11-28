import { EventStatus } from '~/features/events/model/event-status.type'
import { assignmentLines } from '~/features/events/model/part-rooms'
import { ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import { TEMPLATE_PROGRAMME_COUNT } from '~/features/events/server/give-programme.server'
import { MIXED_ITEM_ORDER } from '~/features/events/server/item-projection.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { EVENT_STATUS_ERRORS, type PublishRefusal, scheduleRefusal } from './event-status.policy'
import { ASSIGNMENT_SELECT } from './event-status.server'
import { cancelPendingAssignmentNotices } from './notify-assignment.server'
import { computeNotifyTargets, type NotifyTarget } from './release-notifications.server'

export type { PublishRefusal }

// Each schedule is published on its own (plan §10, D8, D51): its own conflicts block it, its own assignees are told,
// its own pending notices go when it is withdrawn. `Event.status` stays written until PR 6: released while any of its
// schedules is published (D51, the label following « has a published schedule »); an event holding no schedule keeps
// its own (D46). Whoever publishes or withdraws goes through these, never releaseEvent, or the two drift apart.

const logger = createLogger('schedule-status')

export interface ScheduleRef {
  id: number
  eventId: number
  kind: ScheduleKind
}

export type PublishScheduleResult =
  /** `changed`: this call published it; false when it already was, and no one is told again. */
  | { schedule: ScheduleRef; changed: boolean; notifyTargets: NotifyTarget[] }
  // Absence conflicts to resolve, a programme still to give, or nothing in it: callers switch on `reason`; `error` is
  // the event's wording, for a caller that has nothing better.
  | { schedule: ScheduleRef; error: string; reason: PublishRefusal }

/** `changed`: this call withdrew it; false when it was a draft already, and nothing was written. */
export type UnpublishScheduleResult = { schedule: ScheduleRef; changed: boolean }

/**
 * Whether the caller may publish or withdraw a schedule (plan §10, D8): « Publier » reaches every one; otherwise the
 * responsible of its template, through the role it names. A schedule without a template has no responsible (D47). A
 * schedule outside the congregation is refused whatever the rights: it is looked up before any right is read.
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
  const allowed = role != null && (await resolveEffectiveRoleIds(db, userId, congregationId)).includes(role)
  if (!allowed) {
    logger.warn('canPublishSchedule: refused', {
      userId,
      scheduleId,
      congregationId,
      reason: role == null ? 'no-responsible' : 'role-not-held',
    })
  }
  return allowed
}

/**
 * Gives events their schedules' status: released while any schedule is published, a draft once none is (D51). An
 * event holding no schedule keeps its status (D46). The caller holds the events' rows (lockEvent), so two schedules of
 * one event changing at once cannot leave it reading a draft with a schedule published.
 */
export async function settleEventStatus(db: TransactionClient, eventIds: number[], congregationId: number) {
  if (eventIds.length === 0) return
  const scoped = { id: { in: eventIds }, congregationId }
  await db.event.updateMany({
    where: {
      ...scoped,
      schedules: { some: { status: ScheduleStatus.Published } },
      status: { not: EventStatus.Released },
    },
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

/** The schedule's event row, locked for the rest of the transaction, as eventScheduleId does. */
export async function lockScheduleEvent(db: TransactionClient, scheduleId: number, congregationId: number) {
  const found = await db.schedule.findFirst({ where: { id: scheduleId, congregationId }, select: { eventId: true } })
  if (found == null) return false
  await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${found.eventId} AND "congregationId" = ${congregationId} FOR UPDATE`
  return true
}

/**
 * Publishes one schedule (tx-only, like releaseEvent). The caller fires the notices after commit from the targets
 * returned, with the event it already holds (fireReleaseNotifications). Refused while its own items hold a conflict,
 * for a programme left without parts while its template has parts to give, and for any schedule with nothing in it:
 * none is mandatory, so none is published empty. Publishing it again writes nothing and tells no one; the event's row
 * is locked first, so two calls at once tell them once.
 */
export async function publishSchedule(
  db: TransactionClient,
  scheduleId: number,
  congregationId: number,
  actorId: number,
): Promise<PublishScheduleResult | null> {
  if (!(await lockScheduleEvent(db, scheduleId, congregationId))) return null
  const schedule = await db.schedule.findFirstOrThrow({
    where: { id: scheduleId, congregationId },
    select: {
      id: true,
      eventId: true,
      kind: true,
      status: true,
      scheduleTemplateId: true,
      items: { select: ASSIGNMENT_SELECT, orderBy: MIXED_ITEM_ORDER },
      event: { select: { template: { select: { key: true, ...TEMPLATE_PROGRAMME_COUNT } } } },
    },
  })
  const ref: ScheduleRef = { id: schedule.id, eventId: schedule.eventId, kind: schedule.kind as ScheduleKind }
  // A line per room: a conflict in any room holds it back, and each room's people are told.
  const lines = assignmentLines(schedule.items)
  if (schedule.status === ScheduleStatus.Published) return { schedule: ref, changed: false, notifyTargets: [] }

  const fromTemplate = schedule.scheduleTemplateId != null
  const refusal = scheduleRefusal({ kind: ref.kind, items: lines, fromTemplate }, schedule.event.template)
  if (refusal === 'awaiting') {
    return { schedule: ref, error: EVENT_STATUS_ERRORS.releaseAwaitingProgramme, reason: 'awaiting' }
  }
  // No schedule is mandatory on a meeting: one with nothing in it stays a draft, never published empty.
  if (refusal === 'empty') {
    logger.info('publishing refused: empty schedule', { scheduleId, kind: ref.kind, congregationId, actorId })
    return { schedule: ref, error: EVENT_STATUS_ERRORS.publishEmpty, reason: 'empty' }
  }
  if (refusal === 'conflicts') {
    const conflicting = lines.filter(item => item.hasConflict).length
    logger.warn('publishing blocked by conflicts', { scheduleId, kind: ref.kind, congregationId, actorId, conflicting })
    return { schedule: ref, error: EVENT_STATUS_ERRORS.releaseBlockedByConflicts, reason: 'conflicts' }
  }

  await db.schedule.update({
    where: { id_congregationId: { id: scheduleId, congregationId } },
    data: { status: ScheduleStatus.Published },
  })
  await settleEventStatus(db, [ref.eventId], congregationId)
  await auditInTransaction(db, {
    action: AuditAction.SchedulePublished,
    congregationId,
    actorId,
    entityType: 'Schedule',
    entityId: scheduleId,
    metadata: { eventId: ref.eventId, kind: ref.kind },
  })
  logger.info('schedule published', {
    scheduleId,
    eventId: ref.eventId,
    kind: ref.kind,
    congregationId,
    actorId,
    itemCount: schedule.items.length,
  })
  // Programme items have a second slot (the reader); duties have none, as releaseEvent reads them.
  const isProgramme = ref.kind === ScheduleKind.Programme
  const parts = isProgramme ? lines : []
  const services = isProgramme ? [] : lines.map(({ assistantId: _assistant, ...service }) => service)
  return { schedule: ref, changed: true, notifyTargets: computeNotifyTargets(parts, services) }
}

/**
 * Withdraws one schedule and cancels the assignment notices still pending for its items. Withdrawing a draft writes
 * nothing.
 */
export async function unpublishSchedule(
  db: TransactionClient,
  scheduleId: number,
  congregationId: number,
  actorId: number,
): Promise<UnpublishScheduleResult | null> {
  if (!(await lockScheduleEvent(db, scheduleId, congregationId))) return null
  const schedule = await db.schedule.findFirstOrThrow({
    where: { id: scheduleId, congregationId },
    select: { id: true, eventId: true, kind: true, status: true, items: { select: { id: true } } },
  })
  const ref: ScheduleRef = { id: schedule.id, eventId: schedule.eventId, kind: schedule.kind as ScheduleKind }
  if (schedule.status === ScheduleStatus.Draft) return { schedule: ref, changed: false }

  await db.schedule.update({
    where: { id_congregationId: { id: scheduleId, congregationId } },
    data: { status: ScheduleStatus.Draft },
  })
  await settleEventStatus(db, [ref.eventId], congregationId)
  const itemIds = schedule.items.map(item => item.id)
  const cancelledCount = await cancelPendingAssignmentNotices(db, congregationId, itemIds)
  await auditInTransaction(db, {
    action: AuditAction.ScheduleUnpublished,
    congregationId,
    actorId,
    entityType: 'Schedule',
    entityId: scheduleId,
    metadata: { eventId: ref.eventId, kind: ref.kind },
  })
  logger.info('schedule unpublished', {
    scheduleId,
    eventId: ref.eventId,
    kind: ref.kind,
    congregationId,
    actorId,
    itemCount: itemIds.length,
    cancelledCount,
  })
  return { schedule: ref, changed: true }
}
