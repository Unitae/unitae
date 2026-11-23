import type { Prisma } from '~/database/generated/client'
import { SCHEDULE_ORDER, ScheduleKind, ScheduleStatus, scheduleStatusFor } from '~/features/events/model/schedule.type'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { writeTemplateItems } from './give-programme.server'
import { type ScheduleRef, settleEventStatus } from './schedule-status.server'

// Adding one schedule to an event (D39, design round A): from a schedule template, with its parts or duties and who
// may take them, or empty, with a name of its own. An event holds one schedule of each kind until PR 6/7: only a kind
// it lacks can be added. A schedule beside another starts as a draft; the first of an event published as it is takes
// its status (D52).

/** What a schedule is made from: a template of the congregation, or nothing but a name and a kind. */
export type ScheduleSource = { scheduleTemplateId: number } | { name: string; kind: ScheduleKind }

/**
 * Whether the caller may add a schedule from this source (D39): « Gérer » adds any; the responsible of a schedule
 * template adds its schedules; an empty one has no responsible and is the managers' (D47). A template outside the
 * congregation is refused whatever the rights.
 */
export async function canAddSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  source: ScheduleSource,
  congregationId: number,
): Promise<boolean> {
  if (!('scheduleTemplateId' in source)) return can(Permission.CanManagePrograms)
  const template = await db.scheduleTemplate.findFirst({
    where: { id: source.scheduleTemplateId, congregationId },
    select: { responsibleRoleId: true },
  })
  if (template == null) return false
  if (can(Permission.CanManagePrograms)) return true
  const role = template.responsibleRoleId
  return role != null && (await resolveEffectiveRoleIds(db, userId, congregationId)).includes(role)
}

const TEMPLATE_ITEMS = {
  parts: { orderBy: { order: 'asc' }, include: { allowedRoles: true } },
  serviceParts: { orderBy: [{ order: 'asc' }, { id: 'asc' }], include: { allowedRoles: true } },
} satisfies Prisma.ScheduleTemplateInclude

/**
 * Adds a schedule to an event. Refused when the event already holds one of its kind (`kind-held`); null when the
 * event or the template is not the congregation's. The event's row is locked, as publishing does.
 */
export async function addSchedule(
  db: TransactionClient,
  eventId: number,
  source: ScheduleSource,
  congregationId: number,
  actorId: number,
): Promise<{ schedule: ScheduleRef } | { refused: 'kind-held' } | null> {
  const event = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { id: true } })
  if (event == null) return null
  const template =
    'scheduleTemplateId' in source
      ? await db.scheduleTemplate.findFirst({
          where: { id: source.scheduleTemplateId, congregationId },
          include: TEMPLATE_ITEMS,
        })
      : null
  if ('scheduleTemplateId' in source && template == null) return null
  const kind = (template?.kind ?? ('kind' in source ? source.kind : ScheduleKind.Duty)) as ScheduleKind

  await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} AND "congregationId" = ${congregationId} FOR UPDATE`
  const held = await db.event.findFirstOrThrow({
    where: { id: eventId, congregationId },
    select: { status: true, schedules: { select: { kind: true } } },
  })
  if (held.schedules.some(schedule => schedule.kind === kind)) return { refused: 'kind-held' }

  const created = await db.schedule.create({
    data: {
      eventId,
      kind,
      order: SCHEDULE_ORDER[kind],
      // D52: beside another, a draft; the first of an event published as it is, its status.
      status: held.schedules.length === 0 ? scheduleStatusFor(held.status) : ScheduleStatus.Draft,
      scheduleTemplateId: template?.id ?? null,
      name: template ? template.name : 'name' in source ? source.name : null,
      key: template?.key ?? null,
      congregationId,
    },
  })
  if (template != null) {
    const isProgramme = kind === ScheduleKind.Programme
    await writeTemplateItems(
      db,
      {
        eventId,
        programmeId: isProgramme ? created.id : null,
        dutiesId: isProgramme ? null : created.id,
        parts: isProgramme ? template.parts : [],
        services: isProgramme ? [] : template.serviceParts,
      },
      congregationId,
    )
  }
  await settleEventStatus(db, [eventId], congregationId)
  await auditInTransaction(db, {
    action: AuditAction.ScheduleAdded,
    congregationId,
    actorId,
    entityType: 'Schedule',
    entityId: created.id,
    metadata: { eventId, kind, scheduleTemplateId: template?.id ?? null },
  })
  return { schedule: { id: created.id, eventId, kind } }
}
