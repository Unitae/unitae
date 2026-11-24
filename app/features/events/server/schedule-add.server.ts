import type { Prisma } from '~/database/generated/client'
import { isAwaitingProgramme, programmeTemplate } from '~/features/events/model/empty-meetings'
import { EventOrigin } from '~/features/events/model/event-origin.type'
import {
  SCHEDULE_KINDS,
  SCHEDULE_ORDER,
  type ScheduleAddOption,
  type ScheduleAddOptions,
  ScheduleKind,
  ScheduleStatus,
  scheduleStatusFor,
} from '~/features/events/model/schedule.type'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { writeTemplateItems } from './give-programme.server'
import { type ScheduleRef, settleEventStatus } from './schedule-status.server'

// Adding one schedule to an event (D39): from a schedule template, with its parts or duties and who may take them, or
// empty, with a name of its own. An event holds one schedule of each kind until a second duty schedule is allowed:
// only a kind it lacks can be added. A schedule beside another starts as a draft; the first of an event published as
// it is takes its status (D52).

const logger = createLogger('schedule-add')

/** What a schedule is made from: a template of the congregation, or nothing but a name and a kind. */
export type ScheduleSource =
  | { scheduleTemplateId: number; name?: never; kind?: never }
  | { scheduleTemplateId?: never; name: string; kind: ScheduleKind }

const fromTemplate = (source: ScheduleSource): source is { scheduleTemplateId: number } =>
  source.scheduleTemplateId != null

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
  if (!fromTemplate(source)) return can(Permission.CanManagePrograms)
  const template = await db.scheduleTemplate.findFirst({
    where: { id: source.scheduleTemplateId, congregationId },
    select: { responsibleRoleId: true },
  })
  if (template == null) return false
  if (can(Permission.CanManagePrograms)) return true
  const role = template.responsibleRoleId
  const may = role != null && (await resolveEffectiveRoleIds(db, userId, congregationId)).includes(role)
  if (!may)
    logger.warn('schedule add refused', { scheduleTemplateId: source.scheduleTemplateId, userId, congregationId })
  return may
}

const TEMPLATE_ITEMS = {
  parts: { orderBy: { order: 'asc' }, include: { allowedRoles: true } },
  serviceParts: { orderBy: [{ order: 'asc' }, { id: 'asc' }], include: { allowedRoles: true } },
} satisfies Prisma.ScheduleTemplateInclude

/** Why a schedule could not be added, though the caller may: the kind is held, or the meeting awaits its programme. */
export type ScheduleAddRefusal = 'kind-held' | 'awaiting-programme'

/** Whether a source brings no item of its kind: empty (no template), or a template with nothing of that kind. */
function bringsNothing(kind: string, counts: { parts: number; serviceParts: number } | null): boolean {
  return counts == null || (kind === ScheduleKind.Programme ? counts.parts : counts.serviceParts) === 0
}

/**
 * Locks the event's template row, then the event's — the order « Créer le programme » takes them in, reading the items
 * under the template's lock: it must never fill a schedule added in between — and reads what adding decides on.
 */
async function lockEventForAdd(db: TransactionClient, eventId: number, congregationId: number) {
  const kindOf = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { templateId: true } })
  if (kindOf == null) return null
  if (kindOf.templateId != null) {
    await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ${kindOf.templateId} AND "congregationId" = ${congregationId} FOR UPDATE`
  }
  await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} AND "congregationId" = ${congregationId} FOR UPDATE`
  return db.event.findFirst({
    where: { id: eventId, congregationId },
    select: {
      status: true,
      origin: true,
      schedules: { select: { kind: true } },
      _count: { select: { items: true } },
      template: { select: { key: true, _count: { select: { parts: true, serviceParts: true } } } },
    },
  })
}

/** Writes the template's parts into a programme, or its duties into a duty schedule, each with who may take it. */
function fillFromTemplate(
  db: TransactionClient,
  schedule: ScheduleRef,
  template: Prisma.ScheduleTemplateGetPayload<{ include: typeof TEMPLATE_ITEMS }>,
  congregationId: number,
) {
  const isProgramme = schedule.kind === ScheduleKind.Programme
  return writeTemplateItems(
    db,
    {
      eventId: schedule.eventId,
      programmeId: isProgramme ? schedule.id : null,
      dutiesId: isProgramme ? null : schedule.id,
      parts: isProgramme ? template.parts : [],
      services: isProgramme ? [] : template.serviceParts,
    },
    congregationId,
  )
}

/** Why the event refuses a schedule of this kind bringing these items, or null when it takes it. */
function refusalOf(
  event: {
    schedules: { kind: string }[]
    _count: { items: number }
    template: { key: string | null; _count: { parts: number; serviceParts: number } } | null
  },
  kind: ScheduleKind,
  counts: { parts: number; serviceParts: number } | null,
): ScheduleAddRefusal | null {
  if (event.schedules.some(schedule => schedule.kind === kind)) return 'kind-held'
  const awaits = isAwaitingProgramme({
    parts: event._count.items,
    services: 0,
    template: programmeTemplate(event.template),
  })
  return awaits && bringsNothing(kind, counts) ? 'awaiting-programme' : null
}

/**
 * Adds a schedule to an event. Null when the event or the template is not the congregation's. Refused when the event
 * already holds one of its kind, or, for one that brings no item of its kind (empty, or a template with nothing of
 * it), while the meeting awaits its programme: « Créer le programme » would fill it with the template's items. A
 * meeting the job created ahead becomes its author's, as editing it does. The event's template row is locked, then
 * the event's, the order « Créer le programme » takes them in.
 */
export async function addSchedule(
  db: TransactionClient,
  eventId: number,
  source: ScheduleSource,
  congregationId: number,
  actorId: number,
): Promise<{ schedule: ScheduleRef } | { reason: ScheduleAddRefusal } | null> {
  const template = fromTemplate(source)
    ? await db.scheduleTemplate.findFirst({
        where: { id: source.scheduleTemplateId, congregationId },
        include: TEMPLATE_ITEMS,
      })
    : null
  if (fromTemplate(source) && template == null) return null
  const kind = template != null ? (template.kind as ScheduleKind) : (source.kind as ScheduleKind)

  const event = await lockEventForAdd(db, eventId, congregationId)
  if (event == null) return null
  const counts = template && { parts: template.parts.length, serviceParts: template.serviceParts.length }
  const reason = refusalOf(event, kind, counts)
  if (reason != null) {
    logger.info('schedule add refused', { reason, eventId, kind, congregationId, actorId })
    return { reason }
  }

  const name = template != null ? template.name : (source.name ?? null)
  const created = await db.schedule.create({
    data: {
      eventId,
      kind,
      order: SCHEDULE_ORDER[kind],
      // D52: beside another, a draft; the first of an event published as it is, its status.
      status: event.schedules.length === 0 ? scheduleStatusFor(event.status) : ScheduleStatus.Draft,
      scheduleTemplateId: template?.id ?? null,
      name,
      key: template?.key ?? null,
      congregationId,
    },
  })
  if (template != null) await fillFromTemplate(db, { id: created.id, eventId, kind }, template, congregationId)
  if (event.origin === EventOrigin.Job) {
    await db.event.updateMany({
      where: { id: eventId, congregationId, origin: EventOrigin.Job },
      data: { origin: EventOrigin.Manual, createdById: actorId },
    })
  }
  await settleEventStatus(db, [eventId], congregationId)
  await auditInTransaction(db, {
    action: AuditAction.ScheduleAdded,
    congregationId,
    actorId,
    entityType: 'Schedule',
    entityId: created.id,
    metadata: { eventId, kind, name, scheduleTemplateId: template?.id ?? null },
  })
  return { schedule: { id: created.id, eventId, kind } }
}

/**
 * What « Ajouter un planning » offers the caller on an event (D39): the schedule templates of a kind the event lacks
 * that they may add — those its kind suggests first, in its order, then the others by name, unnamed ones last — and
 * the kinds of an empty schedule, for « Gérer » only. While the meeting awaits its programme, only templates that bring
 * items of their kind, and no empty one. The kind's suggestions of a kind the event holds are listed too, greyed with
 * why (design round A); the other templates only of a kind it lacks.
 */
export async function scheduleAddOptions(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  congregationId: number,
): Promise<ScheduleAddOptions> {
  const none: ScheduleAddOptions = { suggested: [], others: [], emptyKinds: [] }
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: {
      templateId: true,
      schedules: { select: { kind: true, scheduleTemplateId: true } },
      _count: { select: { items: true } },
      template: { select: { key: true, _count: { select: { parts: true, serviceParts: true } } } },
    },
  })
  if (event == null) return none
  const missing = SCHEDULE_KINDS.filter(kind => !event.schedules.some(schedule => schedule.kind === kind))
  if (missing.length === 0) return none
  const manages = can(Permission.CanManagePrograms)
  const roleIds = manages ? [] : await resolveEffectiveRoleIds(db, userId, congregationId)
  if (!manages && roleIds.length === 0) return none
  const templates = await db.scheduleTemplate.findMany({
    where: {
      congregationId,
      // A kind it lacks; or the meeting kind's own suggestions, greyed when their kind is held.
      OR: [{ kind: { in: [...missing] } }, { eventKinds: { some: { eventKindId: event.templateId ?? -1 } } }],
      ...(manages ? {} : { responsibleRoleId: { in: roleIds } }),
    },
    select: {
      id: true,
      name: true,
      kind: true,
      responsibleRole: { select: { key: true, name: true } },
      _count: { select: { parts: true, serviceParts: true } },
      eventKinds: { select: { eventKindId: true, order: true, eventKind: { select: { name: true } } } },
    },
    orderBy: [{ name: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  })
  const unavailable = (template: (typeof templates)[number]) => {
    const held = event.schedules.find(schedule => schedule.kind === template.kind)
    if (held == null) return {}
    return { unavailable: held.scheduleTemplateId === template.id ? ('present' as const) : ('kind-held' as const) }
  }
  const option = (template: (typeof templates)[number]): ScheduleAddOption => ({
    id: template.id,
    name: template.name,
    kind: template.kind as ScheduleKind,
    usedBy: template.eventKinds.map(link => link.eventKind.name),
    responsible: template.responsibleRole,
    ...unavailable(template),
  })
  const linkOf = (template: (typeof templates)[number]) =>
    template.eventKinds.find(link => link.eventKindId === event.templateId)
  const awaits = isAwaitingProgramme({
    parts: event._count.items,
    services: 0,
    template: programmeTemplate(event.template),
  })
  // While the meeting awaits its programme, only what brings items: « Créer le programme » would fill anything else.
  const offered = awaits ? templates.filter(template => !bringsNothing(template.kind, template._count)) : templates
  const suggested = offered
    .filter(template => linkOf(template) != null)
    .sort((a, b) => (linkOf(a)?.order ?? 0) - (linkOf(b)?.order ?? 0))
  return {
    suggested: suggested.map(option),
    others: offered
      .filter(template => linkOf(template) == null && missing.includes(template.kind as ScheduleKind))
      .map(option),
    emptyKinds: manages && !awaits ? [...missing] : [],
    ...(manages ? {} : { asResponsible: true }),
  }
}

/**
 * Adds a schedule to an event for whoever may (canAddSchedule): what the route asks. Null when the event or the
 * template is not there; `{ refused: true }` for whoever may not.
 */
export async function addEventSchedule(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  source: ScheduleSource,
  congregationId: number,
): Promise<{ schedule: ScheduleRef } | { reason: ScheduleAddRefusal } | { refused: true } | null> {
  const event = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { id: true } })
  if (event == null) return null
  if (fromTemplate(source)) {
    const exists = await db.scheduleTemplate.count({ where: { id: source.scheduleTemplateId, congregationId } })
    if (exists === 0) return null
  }
  if (!(await canAddSchedule(db, can, userId, source, congregationId))) return { refused: true }
  return addSchedule(db, eventId, source, congregationId, userId)
}
