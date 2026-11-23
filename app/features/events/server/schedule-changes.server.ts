import { ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { cancelPendingAssignmentNotices } from './notify-assignment.server'
import { computeNotifyTargets, type NotifyTarget } from './release-notifications.server'
import { lockScheduleEvent, type ScheduleRef, settleEventStatus } from './schedule-status.server'

// Changing one schedule of an event (plan §10, design round A): renaming it for this event only (D44), deleting it
// (D41). The event stays, with its other schedules and its counts.

const logger = createLogger('schedule-changes')

/**
 * Whether the caller may rename or delete a schedule (design round A): « Gérer » reaches every one; otherwise the
 * responsible of its template, through the role it names. A schedule without a template is the managers' (D47). A
 * schedule outside the congregation is refused whatever the rights: it is looked up first.
 */
export async function canChangeSchedule(
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
  if (can(Permission.CanManagePrograms)) return true
  const role = schedule.scheduleTemplate?.responsibleRoleId
  return role != null && (await resolveEffectiveRoleIds(db, userId, congregationId)).includes(role)
}

const refOf = (schedule: { id: number; eventId: number; kind: string }): ScheduleRef => ({
  id: schedule.id,
  eventId: schedule.eventId,
  kind: schedule.kind as ScheduleKind,
})

/** Renames the schedule on this event only: its template keeps its name (D44). The name comes checked from the form. */
export async function renameSchedule(
  db: TransactionClient,
  scheduleId: number,
  name: string,
  congregationId: number,
  actorId: number,
): Promise<{ schedule: ScheduleRef } | null> {
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, congregationId },
    select: { id: true, eventId: true, kind: true, name: true },
  })
  if (schedule == null) return null
  await db.schedule.update({ where: { id_congregationId: { id: scheduleId, congregationId } }, data: { name } })
  await auditInTransaction(db, {
    action: AuditAction.ScheduleRenamed,
    congregationId,
    actorId,
    entityType: 'Schedule',
    entityId: scheduleId,
    metadata: { eventId: schedule.eventId, from: schedule.name, to: name },
  })
  return { schedule: refOf(schedule) }
}

/**
 * Deletes one schedule of an event and its items (D6: never the event). Pending notices of its items are cancelled;
 * the assignees of a published schedule are returned, for the caller to tell them « Attribution annulée » after
 * commit (D41). The event's status follows what is left (D51). The event's row is locked, as publishing does.
 */
export async function deleteSchedule(
  db: TransactionClient,
  scheduleId: number,
  congregationId: number,
  actorId: number,
): Promise<{ schedule: ScheduleRef; notifyTargets: NotifyTarget[] } | null> {
  if (!(await lockScheduleEvent(db, scheduleId, congregationId))) return null
  const schedule = await db.schedule.findFirstOrThrow({
    where: { id: scheduleId, congregationId },
    select: {
      id: true,
      eventId: true,
      kind: true,
      status: true,
      items: { select: { id: true, name: true, hasConflict: true, assigneeId: true, assistantId: true } },
    },
  })
  const ref = refOf(schedule)
  const isProgramme = ref.kind === ScheduleKind.Programme
  // Only the assignees of a published schedule were told; a draft's never heard of their assignment.
  const notifyTargets =
    schedule.status === ScheduleStatus.Published
      ? computeNotifyTargets(
          isProgramme ? schedule.items : [],
          isProgramme ? [] : schedule.items.map(({ assistantId: _assistant, ...service }) => service),
        )
      : []
  const itemIds = schedule.items.map(item => item.id)
  const cancelledCount = await cancelPendingAssignmentNotices(db, congregationId, itemIds)
  // Its items go with it (Cascade).
  await db.schedule.delete({ where: { id_congregationId: { id: scheduleId, congregationId } } })
  await settleEventStatus(db, [ref.eventId], congregationId)
  await auditInTransaction(db, {
    action: AuditAction.ScheduleDeleted,
    congregationId,
    actorId,
    entityType: 'Schedule',
    entityId: scheduleId,
    metadata: { eventId: ref.eventId, kind: ref.kind, status: schedule.status, itemCount: itemIds.length },
  })
  logger.info('schedule deleted', {
    scheduleId,
    eventId: ref.eventId,
    kind: ref.kind,
    congregationId,
    actorId,
    itemCount: itemIds.length,
    cancelledCount,
    notified: notifyTargets.length,
  })
  return { schedule: ref, notifyTargets }
}

/** The event a schedule of it belongs to, or null when the schedule is not this event's in the congregation. */
async function eventOfSchedule(db: TransactionClient, eventId: number, scheduleId: number, congregationId: number) {
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, eventId, congregationId },
    select: { event: { select: { id: true, name: true, startDate: true, templateId: true } } },
  })
  return schedule?.event ?? null
}

/** Renames one schedule of an event, for whoever may (canChangeSchedule). */
export async function renameEventSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  scheduleId: number,
  name: string,
  congregationId: number,
) {
  if ((await eventOfSchedule(db, eventId, scheduleId, congregationId)) == null) return null
  if (!(await canChangeSchedule(db, can, userId, scheduleId, congregationId))) return { refused: true as const }
  const result = await renameSchedule(db, scheduleId, name, congregationId, userId)
  return result == null ? null : { result }
}

/** Deletes one schedule of an event, for whoever may (canChangeSchedule); notices fire after commit. */
export async function deleteEventSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  scheduleId: number,
  congregationId: number,
) {
  const event = await eventOfSchedule(db, eventId, scheduleId, congregationId)
  if (event == null) return null
  if (!(await canChangeSchedule(db, can, userId, scheduleId, congregationId))) return { refused: true as const }
  const result = await deleteSchedule(db, scheduleId, congregationId, userId)
  return result == null ? null : { event, result }
}
