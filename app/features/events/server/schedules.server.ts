import { EventStatus } from '~/features/events/model/event-status.type'
import {
  isScheduleKind,
  SCHEDULE_ORDER,
  ScheduleKind,
  ScheduleStatus,
  scheduleStatusFor,
  UNNAMED_SCHEDULE_KEY,
} from '~/features/events/model/schedule.type'
import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// An event's schedules, written beside its items' `eventId` and its own `status` until the readers move over. The rule
// is the add_schedules migration's, for one event: keep the two in step. While it lasts, an event has one programme at
// most (a unique index, D9) and, because every writer goes through eventScheduleId, one duty schedule at most; its
// schedules follow its template and its status.
//
// Locks: a template's row before an event's, the order of every path that creates or moves events of a template.

/**
 * The schedule template, name and key a schedule of this kind takes from the event's template: none and the
 * catalogue's key when there is none. Syncs the template's schedule templates first, so it may create them, and locks
 * the template's row.
 */
async function scheduleTemplateFor(
  db: TransactionClient,
  templateId: number | null,
  kind: ScheduleKind,
  congregationId: number,
): Promise<{ scheduleTemplateId: number | null; name: string | null; key: string | null }> {
  if (templateId != null) {
    // A template the previous image created or filled has none yet: it gets them first.
    await syncTemplateScheduleTemplates(db, templateId, congregationId)
    const link = await db.eventKindScheduleTemplate.findFirst({
      where: { eventKindId: templateId, congregationId, scheduleTemplate: { kind } },
      orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
      select: { scheduleTemplate: { select: { id: true, name: true, key: true } } },
    })
    if (link) {
      const { id, name, key } = link.scheduleTemplate
      return { scheduleTemplateId: id, name, key }
    }
  }
  return { scheduleTemplateId: null, name: null, key: UNNAMED_SCHEDULE_KEY[kind] }
}

/**
 * The event's schedule of that kind, made on the spot when it has none: from its template's schedule template of that
 * kind when there is one, with the event's status. Every item an event is given goes into it.
 */
export async function eventScheduleId(
  db: TransactionClient,
  eventId: number,
  kind: ScheduleKind,
  congregationId: number,
  /** Restoring data written before schedules published apart: the schedule takes its event's status, as it then meant. */
  { asTheEvent = false }: { asTheEvent?: boolean } = {},
): Promise<number> {
  const existing = await findEventSchedule(db, eventId, kind, congregationId)
  if (existing) return existing

  const before = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { templateId: true } })
  if (!before) throw new NotFoundError('Event', eventId)
  // The template first (its row is locked), then the event's.
  let madeFrom = await scheduleTemplateFor(db, before.templateId, kind, congregationId)

  // Two writers giving the event its first item of a kind at the same moment would each make a schedule: inside the
  // caller's transaction, the event's row is locked, then looked at again, so the second one takes the first one's.
  await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} AND "congregationId" = ${congregationId} FOR UPDATE`
  const madeMeanwhile = await findEventSchedule(db, eventId, kind, congregationId)
  if (madeMeanwhile) return madeMeanwhile

  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: { templateId: true, status: true, _count: { select: { schedules: true } } },
  })
  if (!event) throw new NotFoundError('Event', eventId)
  // A schedule added beside others starts as a draft, to be published on its own; an event holding none, published as
  // it is, keeps its first one published, so adding a part never hides it from members (D52).
  const status = asTheEvent || event._count.schedules === 0 ? scheduleStatusFor(event.status) : ScheduleStatus.Draft
  // Applied to another template meanwhile: made from that one's.
  if (event.templateId !== before.templateId) {
    madeFrom = await scheduleTemplateFor(db, event.templateId, kind, congregationId)
  }
  const created = await db.schedule.create({
    data: {
      eventId,
      kind,
      order: SCHEDULE_ORDER[kind],
      status,
      ...madeFrom,
      congregationId,
    },
  })
  return created.id
}

async function findEventSchedule(
  db: TransactionClient,
  eventId: number,
  kind: ScheduleKind,
  congregationId: number,
): Promise<number | null> {
  const schedule = await db.schedule.findFirst({
    where: { eventId, kind, congregationId },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  return schedule?.id ?? null
}

/**
 * The event's schedules of these kinds, made where missing, for one action that brings several (giving a programme,
 * applying a template): on an event holding none, published as it is, they all start published alike; beside a
 * schedule it holds, the ones made start as drafts (D52).
 */
export async function eventSchedulesOf(
  db: TransactionClient,
  eventId: number,
  kinds: readonly ScheduleKind[],
  congregationId: number,
): Promise<Partial<Record<ScheduleKind, number>>> {
  const asTheEvent = (await db.schedule.count({ where: { eventId, congregationId } })) === 0
  const ids: Partial<Record<ScheduleKind, number>> = {}
  for (const kind of kinds) ids[kind] = await eventScheduleId(db, eventId, kind, congregationId, { asTheEvent })
  return ids
}

/** Points the event's schedules at its template's schedule templates, by kind: after the event changed template. */
export async function alignEventSchedules(db: TransactionClient, eventId: number, congregationId: number) {
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: { templateId: true, schedules: { select: { id: true, kind: true } } },
  })
  if (!event) throw new NotFoundError('Event', eventId)
  for (const schedule of event.schedules) {
    // Pinned by Schedule_kind_check: a schedule of another kind cannot exist.
    if (!isScheduleKind(schedule.kind)) continue
    await db.schedule.update({
      where: { id_congregationId: { id: schedule.id, congregationId } },
      data: await scheduleTemplateFor(db, event.templateId, schedule.kind, congregationId),
    })
  }
}

/** Every schedule of these events takes the status the events were given. */
export async function setEventSchedulesStatus(
  db: TransactionClient,
  eventIds: number[],
  eventStatus: EventStatus,
  congregationId: number,
) {
  if (eventIds.length === 0) return
  await db.schedule.updateMany({
    where: { eventId: { in: eventIds }, congregationId },
    data: { status: scheduleStatusFor(eventStatus) },
  })
}

/**
 * Puts the events' items that have no schedule into their event's schedule of their kind, then gives every schedule of
 * the events its event's status: for items written without one (a demo, a restored archive). Idempotent. With
 * `keepStatuses`, the statuses the schedules have stay (a restored archive's own); a schedule made here still takes
 * its event's.
 */
export async function attachEventItems(
  db: TransactionClient,
  eventIds: number[],
  congregationId: number,
  { keepStatuses = false }: { keepStatuses?: boolean } = {},
) {
  if (eventIds.length === 0) return
  const unattached = { where: { scheduleId: null } }
  const events = await db.event.findMany({
    where: { id: { in: eventIds }, congregationId },
    select: {
      id: true,
      status: true,
      _count: { select: { eventParts: unattached, eventServiceParts: unattached } },
    },
  })
  for (const event of events) {
    const where = { eventId: event.id, congregationId, scheduleId: null }
    if (event._count.eventParts > 0) {
      const scheduleId = await eventScheduleId(db, event.id, ScheduleKind.Programme, congregationId, {
        asTheEvent: true,
      })
      await db.eventPart.updateMany({ where, data: { scheduleId } })
    }
    if (event._count.eventServiceParts > 0) {
      const scheduleId = await eventScheduleId(db, event.id, ScheduleKind.Duty, congregationId, { asTheEvent: true })
      await db.eventServicePart.updateMany({ where, data: { scheduleId } })
    }
  }
  if (keepStatuses) return
  // scheduleStatusFor's rule, in two writes rather than one per event.
  const released = events.filter(event => event.status === EventStatus.Released).map(event => event.id)
  await db.schedule.updateMany({
    where: { eventId: { in: released }, congregationId, status: { not: ScheduleStatus.Published } },
    data: { status: ScheduleStatus.Published },
  })
  await db.schedule.updateMany({
    where: { eventId: { in: eventIds, notIn: released }, congregationId, status: { not: ScheduleStatus.Draft } },
    data: { status: ScheduleStatus.Draft },
  })
}

/** Deletes the events' schedules, and with them the items inside (Cascade). The events stay. */
export async function deleteEventSchedules(db: TransactionClient, eventIds: number[], congregationId: number) {
  if (eventIds.length === 0) return
  await db.schedule.deleteMany({ where: { eventId: { in: eventIds }, congregationId } })
}
