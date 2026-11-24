import { EventOrigin } from '~/features/events/model/event-origin.type'
import { type KindChangeOption, SCHEDULE_ORDER, ScheduleKind } from '~/features/events/model/schedule.type'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { listApplicableTemplates } from './events-auth.server'
import type { NotifyTarget } from './release-notifications.server'
import { addSchedule, canAddSchedule } from './schedule-add.server'
import { canChangeSchedule, deleteSchedule } from './schedule-changes.server'
import { canChangeEvent, canChangeEventsOfKind } from './schedule-rights.server'

// « Changer le type » (D40, plan T5): the meeting moves to another kind and takes its name. The schedules it keeps stay
// as they are, with their responsible; the ones removed go with their items, their published assignees told
// « Attribution annulée » after commit, about the meeting as they knew it; the new kind's suggestions chosen are added,
// as « Ajouter un planning » does. One schedule of each kind at most, so a second programme only once the old one goes.

const logger = createLogger('event-kind-change')

/**
 * What the dialog sends: the new kind, the event's schedules it keeps and those it removes — every schedule it listed,
 * so one it never showed is never removed — and the new kind's schedule templates to add.
 */
export interface KindChange {
  kindId: number
  keep: number[]
  remove: number[]
  add: number[]
}

/**
 * Why a change is refused though the caller may make it: two schedules of one kind, a template the kind does not
 * suggest (or that brings nothing of its kind), or a meeting that changed since the dialog listed its schedules.
 */
export type KindChangeRefusal = 'kind-held' | 'not-suggested' | 'stale'

const TEMPLATE_COUNTS = { parts: true, serviceParts: true } as const

/** Whether a schedule template brings items of its kind: one with nothing of it is never offered nor added. */
const bringsItems = (template: { kind: string; _count: { parts: number; serviceParts: number } }) =>
  (template.kind === ScheduleKind.Programme ? template._count.parts : template._count.serviceParts) > 0

/** The kinds the caller may move the event to: listApplicableTemplates, never its own nor the free-form one. */
async function offeredKinds(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  event: { templateId: number | null },
  congregationId: number,
) {
  const kinds = await listApplicableTemplates(db, can, userId, congregationId)
  return kinds.filter(kind => kind.id !== event.templateId)
}

/**
 * The kinds the caller may move the event to, each with the schedule templates it suggests that they may add and that
 * bring items, in its order. None for whoever may not change the event (canChangeEvent).
 */
export async function kindChangeOptions(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  congregationId: number,
): Promise<KindChangeOption[]> {
  const event = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { templateId: true } })
  if (event == null || !(await canChangeEvent(db, can, userId, event, congregationId))) return []
  const kinds = await offeredKinds(db, can, userId, event, congregationId)
  if (kinds.length === 0) return []
  const links = await db.eventKindScheduleTemplate.findMany({
    where: { congregationId, eventKindId: { in: kinds.map(kind => kind.id) } },
    select: {
      eventKindId: true,
      scheduleTemplate: { select: { id: true, name: true, kind: true, _count: { select: TEMPLATE_COUNTS } } },
    },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  const addable = new Set<number>()
  for (const { scheduleTemplate } of links) {
    if (!bringsItems(scheduleTemplate)) continue
    if (await canAddSchedule(db, can, userId, { scheduleTemplateId: scheduleTemplate.id }, congregationId)) {
      addable.add(scheduleTemplate.id)
    }
  }
  return kinds.map(kind => ({
    ...kind,
    suggested: links
      .filter(link => link.eventKindId === kind.id && addable.has(link.scheduleTemplate.id))
      .map(({ scheduleTemplate: { id, name, kind } }) => ({ id, name, kind: kind as ScheduleKind })),
  }))
}

type ChangedKind =
  | { event: { id: number; name: string; startDate: Date; templateId: number | null }; notifyTargets: NotifyTarget[] }
  | { refused: true }
  | { reason: KindChangeRefusal }
  | null

/**
 * Moves the event to another kind (D40). Null when the event or the kind is not the congregation's. `refused` for a
 * kind it would not offer, or for whoever may not change events of both kinds, delete each schedule removed
 * (canChangeSchedule) and add each one chosen (canAddSchedule); then a reason when the result would hold two schedules
 * of one kind, a template the kind does not suggest or that brings nothing, or when the meeting holds a schedule the
 * dialog never listed. Nothing is written before every check passes. Both kinds' rows are locked, then the event's,
 * and the event is read after. The event returned is the meeting as it was: the notices name what their reader knew.
 */
export async function changeEventKind(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  change: KindChange,
  congregationId: number,
): Promise<ChangedKind> {
  const locked = await lockForChange(db, eventId, change.kindId, congregationId)
  if (locked == null) return null
  const { event, kind } = locked

  const removed = event.schedules.filter(schedule => change.remove.includes(schedule.id))
  const kept = event.schedules.filter(schedule => change.keep.includes(schedule.id))
  const added = await db.scheduleTemplate.findMany({
    where: { id: { in: change.add }, congregationId, eventKinds: { some: { eventKindId: kind.id } } },
    select: { id: true, kind: true, _count: { select: TEMPLATE_COUNTS } },
  })

  const offered = (await offeredKinds(db, can, userId, event, congregationId)).some(option => option.id === kind.id)
  const allowed =
    offered &&
    (await canChangeEvent(db, can, userId, event, congregationId)) &&
    (await canChangeEventsOfKind(db, can, userId, kind.id, congregationId)) &&
    (await everyOf(removed, schedule => canChangeSchedule(db, can, userId, schedule.id, congregationId))) &&
    (await everyOf(added, template =>
      canAddSchedule(db, can, userId, { scheduleTemplateId: template.id }, congregationId),
    ))
  if (!allowed) {
    logger.warn('kind change refused', { eventId, kindId: kind.id, offered, userId, congregationId })
    return { refused: true }
  }
  const reason = refusalOf(event.schedules, kept, removed, added, change.add)
  if (reason != null) {
    logger.info('kind change refused', { reason, eventId, kindId: kind.id, userId, congregationId })
    return { reason }
  }

  const notifyTargets: NotifyTarget[] = []
  for (const schedule of removed) {
    const deleted = await deleteSchedule(db, schedule.id, congregationId, userId)
    if (deleted == null) throw new ConflictError(`Schedule ${schedule.id} could not be removed from event ${eventId}`)
    notifyTargets.push(...deleted.notifyTargets)
  }
  await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId } },
    data: {
      templateId: kind.id,
      name: kind.name,
      // A meeting created ahead that someone changes is theirs from then on, as editing it does.
      ...(event.origin === EventOrigin.Job && { origin: EventOrigin.Manual, createdById: userId }),
    },
  })
  // The programme first, the order a kind suggests them in.
  for (const template of [...added].sort(
    (a, b) => SCHEDULE_ORDER[a.kind as ScheduleKind] - SCHEDULE_ORDER[b.kind as ScheduleKind],
  )) {
    const outcome = await addSchedule(db, eventId, { scheduleTemplateId: template.id }, congregationId, userId)
    // Checked above; a refusal now rolls the whole change back rather than leave it half done.
    if (outcome == null || !('schedule' in outcome)) {
      throw new ConflictError(`Schedule template ${template.id} could not be added to event ${eventId}`)
    }
  }
  await auditInTransaction(db, {
    action: AuditAction.EventKindChanged,
    congregationId,
    actorId: userId,
    entityType: 'Event',
    entityId: eventId,
    metadata: {
      from: event.templateId,
      to: kind.id,
      removed: removed.map(schedule => schedule.id),
      added: added.map(template => template.id),
    },
  })
  const { id, name, startDate, templateId } = event
  return { event: { id, name, startDate, templateId }, notifyTargets }
}

/**
 * Locks both kinds' rows in id order, then the event's — the order « Créer le programme » takes them in — and reads
 * the event after, so a schedule added while it waited is seen. Null when either is not the congregation's.
 */
async function lockForChange(db: TransactionClient, eventId: number, kindId: number, congregationId: number) {
  const [current, kind] = await Promise.all([
    db.event.findFirst({ where: { id: eventId, congregationId }, select: { templateId: true } }),
    db.eventTemplate.findFirst({ where: { id: kindId, congregationId }, select: { id: true, name: true } }),
  ])
  if (current == null || kind == null) return null
  const kindIds = [...new Set([current.templateId, kind.id].filter((id): id is number => id != null))].sort(
    (a, b) => a - b,
  )
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ANY(${kindIds}) AND "congregationId" = ${congregationId} ORDER BY "id" FOR UPDATE`
  await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} AND "congregationId" = ${congregationId} FOR UPDATE`
  const event = await db.event.findFirstOrThrow({
    where: { id: eventId, congregationId },
    select: {
      id: true,
      name: true,
      startDate: true,
      templateId: true,
      origin: true,
      schedules: { select: { id: true, kind: true } },
    },
  })
  return { event, kind }
}

/** Why the change cannot be made as sent, once the caller may make it; null when it can. */
function refusalOf(
  schedules: { id: number }[],
  kept: { kind: string }[],
  removed: { id: number }[],
  added: { kind: string; _count: { parts: number; serviceParts: number } }[],
  asked: number[],
): KindChangeRefusal | null {
  if (kept.length + removed.length !== schedules.length) return 'stale'
  if (added.length !== new Set(asked).size || !added.every(bringsItems)) return 'not-suggested'
  const kinds = [...kept, ...added].map(schedule => schedule.kind)
  return new Set(kinds).size === kinds.length ? null : 'kind-held'
}

async function everyOf<T>(items: T[], check: (item: T) => Promise<boolean>): Promise<boolean> {
  for (const item of items) if (!(await check(item))) return false
  return true
}
