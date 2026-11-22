import { type ItemKind, SCHEDULE_KIND_OF } from '~/features/events/server/item-projection.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

// Who may fill a schedule (plan §10, D3, D7, D31, D47): the congregation-wide rights reach every one; otherwise the
// role its template names (ScheduleTemplate.responsibleRoleId, synced from the responsibles Réglages names).

const logger = createLogger('schedule-rights')

/**
 * Whether the caller may fill an event's schedule of one kind: its items and who holds them (plan §10, D3, D7, D47).
 * « Attribuer » and « Gérer » reach every schedule; otherwise the responsible of the schedule's template, through the
 * role it names. Every writer makes one schedule of a kind today; should an event hold several, the caller must answer
 * for each, since the routes name a kind and not a schedule. An event without a schedule of that kind yet takes the
 * template its first schedule would get (the writer's: its kind's first suggested one), since filling it starts it. A
 * schedule without a template, and an event without a kind, have no responsible.
 */
export async function canFillSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  kind: ItemKind,
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanAssignProgramParts) || can(Permission.CanManagePrograms)) return true
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return false
  const scheduleKind = SCHEDULE_KIND_OF[kind]
  const holds = (role: number | null | undefined) => role != null && roleIds.includes(role)
  const schedules = await db.schedule.findMany({
    where: { eventId: event.id, congregationId, kind: scheduleKind },
    select: { scheduleTemplate: { select: { responsibleRoleId: true } } },
  })
  let allowed: boolean
  if (schedules.length > 0) {
    allowed = schedules.every(schedule => holds(schedule.scheduleTemplate?.responsibleRoleId))
  } else if (event.templateId == null) {
    allowed = false
  } else {
    const first = await db.eventKindScheduleTemplate.findFirst({
      where: { eventKindId: event.templateId, congregationId, scheduleTemplate: { kind: scheduleKind } },
      orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
      select: { scheduleTemplate: { select: { responsibleRoleId: true } } },
    })
    allowed = holds(first?.scheduleTemplate.responsibleRoleId)
  }
  if (!allowed) {
    logger.warn('canFillSchedule: refused a caller holding roles', {
      userId,
      eventId: event.id,
      kind,
      schedules: schedules.length,
      congregationId,
    })
  }
  return allowed
}

/**
 * Whether the caller may apply a template to an event (plan §10, D31): applying appends its parts and duties and moves
 * the event's schedules onto its schedule templates, so whoever applies it fills each schedule it brings. « Attribuer »
 * and « Gérer », or the responsible of every schedule template the template suggests; one that brings none asks nothing.
 */
export async function canFillTemplateSchedules(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  templateId: number,
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanAssignProgramParts) || can(Permission.CanManagePrograms)) return true
  const brought = await db.scheduleTemplate.findMany({
    where: { congregationId, eventKinds: { some: { eventKindId: templateId } } },
    select: { responsibleRoleId: true },
  })
  if (brought.length === 0) return true
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  return brought.every(template => template.responsibleRoleId != null && roleIds.includes(template.responsibleRoleId))
}
