import { EventOrigin } from '~/features/events/model/event-origin.type'
import { type KindChangeOption, SCHEDULE_ORDER, type ScheduleKind } from '~/features/events/model/schedule.type'
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
// as they are, with their responsible; the ones left out go with their items, their published assignees told
// « Attribution annulée » after commit; the new kind's suggestions chosen are added, as « Ajouter un planning » does.
// One schedule of each kind at most, so a second programme only once the old one goes.

const logger = createLogger('event-kind-change')

/** What the dialog sends: the new kind, the event's schedules to keep, the new kind's schedule templates to add. */
export interface KindChange {
  kindId: number
  keep: number[]
  add: number[]
}

/** Why a change is refused though the caller may make it: two schedules of one kind, or a template the kind lacks. */
export type KindChangeRefusal = 'kind-held' | 'not-suggested'

/**
 * The kinds the caller may move the event to (listApplicableTemplates, never its own), each with the schedule
 * templates it suggests, in its order. None for whoever may not change the event (canChangeEvent).
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
  const kinds = (await listApplicableTemplates(db, can, userId, congregationId)).filter(
    kind => kind.id !== event.templateId,
  )
  if (kinds.length === 0) return []
  const links = await db.eventKindScheduleTemplate.findMany({
    where: { congregationId, eventKindId: { in: kinds.map(kind => kind.id) } },
    select: { eventKindId: true, scheduleTemplate: { select: { id: true, name: true, kind: true } } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  return kinds.map(kind => ({
    ...kind,
    suggested: links
      .filter(link => link.eventKindId === kind.id)
      .map(({ scheduleTemplate }) => ({ ...scheduleTemplate, kind: scheduleTemplate.kind as ScheduleKind })),
  }))
}

/**
 * Moves the event to another kind (D40). Null when the event or the kind is not the congregation's; `refused` for
 * whoever may not change events of both kinds, delete each schedule left out (canChangeSchedule) and add each one
 * chosen (canAddSchedule); a reason when the result would hold two schedules of one kind, or a template the kind does
 * not suggest. Nothing is written before every check passes. The templates' rows are locked, then the event's.
 */
export async function changeEventKind(
  db: TransactionClient,
  can: (permission: Permission) => boolean,
  userId: number,
  eventId: number,
  change: KindChange,
  congregationId: number,
): Promise<
  | { event: { id: number; name: string; startDate: Date; templateId: number | null }; notifyTargets: NotifyTarget[] }
  | { refused: true }
  | { reason: KindChangeRefusal }
  | null
> {
  const [event, kind] = await Promise.all([
    db.event.findFirst({
      where: { id: eventId, congregationId },
      select: { templateId: true, origin: true, schedules: { select: { id: true, kind: true } } },
    }),
    db.eventTemplate.findFirst({ where: { id: change.kindId, congregationId }, select: { id: true, name: true } }),
  ])
  if (event == null || kind == null) return null
  const kindIds = [...new Set([event.templateId, kind.id].filter((id): id is number => id != null))].sort(
    (a, b) => a - b,
  )
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ANY(${kindIds}) AND "congregationId" = ${congregationId} ORDER BY "id" FOR UPDATE`
  await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} AND "congregationId" = ${congregationId} FOR UPDATE`

  const removed = event.schedules.filter(schedule => !change.keep.includes(schedule.id))
  const kept = event.schedules.filter(schedule => change.keep.includes(schedule.id))
  const added = await db.scheduleTemplate.findMany({
    where: { id: { in: change.add }, congregationId, eventKinds: { some: { eventKindId: kind.id } } },
    select: { id: true, kind: true },
  })
  if (added.length !== new Set(change.add).size) return { reason: 'not-suggested' }
  const kinds = [...kept, ...added].map(schedule => schedule.kind)
  if (new Set(kinds).size !== kinds.length) return { reason: 'kind-held' }

  const allowed =
    (await canChangeEvent(db, can, userId, event, congregationId)) &&
    (await canChangeEventsOfKind(db, can, userId, kind.id, congregationId)) &&
    (await everyOf(removed, schedule => canChangeSchedule(db, can, userId, schedule.id, congregationId))) &&
    (await everyOf(added, template =>
      canAddSchedule(db, can, userId, { scheduleTemplateId: template.id }, congregationId),
    ))
  if (!allowed) {
    logger.warn('kind change refused', { eventId, kindId: kind.id, userId, congregationId })
    return { refused: true }
  }

  const notifyTargets: NotifyTarget[] = []
  for (const schedule of removed) {
    notifyTargets.push(...((await deleteSchedule(db, schedule.id, congregationId, userId))?.notifyTargets ?? []))
  }
  const moved = await db.event.update({
    where: { id_congregationId: { id: eventId, congregationId } },
    data: {
      templateId: kind.id,
      name: kind.name,
      // A meeting created ahead that someone changes is theirs from then on, as editing it does.
      ...(event.origin === EventOrigin.Job && { origin: EventOrigin.Manual, createdById: userId }),
    },
    select: { id: true, name: true, startDate: true, templateId: true },
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
  return { event: moved, notifyTargets }
}

async function everyOf<T>(items: T[], check: (item: T) => Promise<boolean>): Promise<boolean> {
  for (const item of items) if (!(await check(item))) return false
  return true
}
