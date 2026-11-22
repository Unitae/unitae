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

/**
 * The kinds (event templates) suggesting a schedule template the caller is responsible for: those whose events they
 * may create, change and move an event to (D28, D49). Sorted.
 */
export async function responsibleKindIds(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<number[]> {
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return []
  const links = await db.eventKindScheduleTemplate.findMany({
    where: { congregationId, scheduleTemplate: { responsibleRoleId: { in: roleIds } } },
    select: { eventKindId: true },
  })
  return [...new Set(links.map(link => link.eventKindId))].sort((a, b) => a - b)
}

/** Whether the caller may change an event — its date, hours, fields, kind — and open its editor (D28). */
export async function canChangeEvent(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanManagePrograms)) return true
  if (event.templateId == null) return false
  return (await responsibleKindIds(db, userId, congregationId)).includes(event.templateId)
}

/** The responsible role of each schedule the event holds; none for a schedule without a template (D47). */
async function scheduleResponsibles(db: TransactionClient, eventId: number, congregationId: number) {
  const schedules = await db.schedule.findMany({
    where: { eventId, congregationId },
    select: { scheduleTemplate: { select: { responsibleRoleId: true } } },
  })
  return schedules.map(schedule => schedule.scheduleTemplate?.responsibleRoleId ?? null)
}

const answersForAll = (responsibles: (number | null)[], roleIds: number[]) =>
  responsibles.every(role => role != null && roleIds.includes(role))

/**
 * Whether the caller may delete an event (D28, D50): « Gérer », or a responsible of a schedule template its kind
 * suggests when the event holds schedules and every one is theirs. An event holding none (an empty meeting the job
 * made) is no one's: the managers' alone.
 */
export async function canDeleteEvent(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanManagePrograms)) return true
  if (!(await canChangeEvent(db, can, userId, event, congregationId))) return false
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  const responsibles = await scheduleResponsibles(db, event.id, congregationId)
  return responsibles.length > 0 && answersForAll(responsibles, roleIds)
}

/**
 * Whether the caller may publish or unpublish a whole event, until schedules publish one by one (D49): « Publier »,
 * or the responsible of every schedule it holds — of every schedule template its kind suggests while it holds none.
 */
export async function canPublishEvent(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanPublishPrograms)) return true
  if (event.templateId == null) return false
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return false
  let responsibles = await scheduleResponsibles(db, event.id, congregationId)
  if (responsibles.length === 0) {
    const suggested = await db.scheduleTemplate.findMany({
      where: { congregationId, eventKinds: { some: { eventKindId: event.templateId } } },
      select: { responsibleRoleId: true },
    })
    responsibles = suggested.map(template => template.responsibleRoleId)
  }
  return responsibles.length > 0 && answersForAll(responsibles, roleIds)
}

/**
 * The selected events the caller may publish (or unpublish) or delete, each by the rule above; ids of no event of the
 * congregation drop out. Shared by the bulk routes.
 */
export async function filterEventsByRight(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  eventIds: number[],
  userId: number,
  congregationId: number,
  right: 'publish' | 'delete',
): Promise<number[]> {
  if (eventIds.length === 0) return []
  const events = await db.event.findMany({
    where: { id: { in: eventIds }, congregationId },
    select: { id: true, templateId: true },
  })
  const check = right === 'publish' ? canPublishEvent : canDeleteEvent
  const allowed: number[] = []
  for (const event of events) {
    if (await check(db, can, userId, event, congregationId)) allowed.push(event.id)
  }
  return allowed
}
