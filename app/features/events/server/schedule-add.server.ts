import type { Prisma } from '~/database/generated/client'
import { SCHEDULE_ORDER, ScheduleKind, ScheduleStatus, scheduleStatusFor } from '~/features/events/model/schedule.type'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { writeTemplateItems } from './give-programme.server'
import { type ScheduleRef, settleEventStatus } from './schedule-status.server'

// Adding one schedule to an event (D39): from a schedule template, with its parts or duties and who
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

/** A schedule template « Ajouter un planning » offers. */
export interface ScheduleAddOption {
  id: number
  name: string | null
  key: string | null
  kind: ScheduleKind
  /** The event kinds it belongs to: what tells two unnamed templates apart. */
  usedBy: string[]
}

/**
 * What « Ajouter un planning » offers the caller on an event (D39): the schedule templates of a kind
 * the event lacks that they may add — those its kind suggests first, in its order, then the others by name — and the
 * kinds of an empty schedule, for « Gérer » only. Nothing of a kind the event holds, while it holds one of each.
 */
export async function scheduleAddOptions(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  congregationId: number,
): Promise<{ suggested: ScheduleAddOption[]; others: ScheduleAddOption[]; emptyKinds: ScheduleKind[] }> {
  const none = { suggested: [], others: [], emptyKinds: [] }
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: { templateId: true, schedules: { select: { kind: true } } },
  })
  if (event == null) return none
  const missing = [ScheduleKind.Programme, ScheduleKind.Duty].filter(
    kind => !event.schedules.some(schedule => schedule.kind === kind),
  )
  if (missing.length === 0) return none
  const manages = can(Permission.CanManagePrograms)
  const roleIds = manages ? [] : await resolveEffectiveRoleIds(db, userId, congregationId)
  if (!manages && roleIds.length === 0) return none
  const templates = await db.scheduleTemplate.findMany({
    where: {
      congregationId,
      kind: { in: missing },
      ...(manages ? {} : { responsibleRoleId: { in: roleIds } }),
    },
    select: {
      id: true,
      name: true,
      key: true,
      kind: true,
      eventKinds: { select: { eventKindId: true, order: true, eventKind: { select: { name: true } } } },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
  const option = ({ id, name, key, kind, eventKinds }: (typeof templates)[number]): ScheduleAddOption => ({
    id,
    name,
    key,
    kind: kind as ScheduleKind,
    usedBy: eventKinds.map(link => link.eventKind.name),
  })
  const linkOf = (template: (typeof templates)[number]) =>
    template.eventKinds.find(link => link.eventKindId === event.templateId)
  const suggested = templates
    .filter(template => linkOf(template) != null)
    .sort((a, b) => (linkOf(a)?.order ?? 0) - (linkOf(b)?.order ?? 0))
  return {
    suggested: suggested.map(option),
    others: templates.filter(template => linkOf(template) == null).map(option),
    emptyKinds: manages ? missing : [],
  }
}

/** Adds a schedule to an event for whoever may (canAddSchedule): what the route asks. */
export async function addEventSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  source: ScheduleSource,
  congregationId: number,
): Promise<{ schedule: ScheduleRef } | { refused: 'kind-held' | 'right' } | null> {
  const event = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { id: true } })
  if (event == null) return null
  if (!(await canAddSchedule(db, can, userId, source, congregationId))) return { refused: 'right' }
  return addSchedule(db, eventId, source, congregationId, userId)
}
