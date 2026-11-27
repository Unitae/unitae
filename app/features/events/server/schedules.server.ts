import { EventStatus } from '~/features/events/model/event-status.type'
import {
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
// most (a unique index, D9) and one duty schedule at most: every writer goes through eventScheduleId, and adding one
// (addSchedule) only adds a kind the event lacks. A schedule keeps the template it was made from, even when the event
// moves to another kind (« Changer le type », D40); its status starts from D52 and is then its own, the event's
// settling from them (settleEventStatus, D51).
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
 * kind when there is one. Its status follows D52: an event holding no schedule gives it its own; beside any schedule
 * the event holds, an empty one included, it starts as a draft, to be published on its own. Every item an event is
 * given goes into it. An action bringing several kinds at once goes through eventSchedulesOf, never this in a loop.
 */
export async function eventScheduleId(
  db: TransactionClient,
  eventId: number,
  kind: ScheduleKind,
  congregationId: number,
  /**
   * Gives the schedule the event's status even beside another: for data written when a published event meant every
   * schedule was (a restore, attachEventItems), and for the schedules one action brings at once (eventSchedulesOf).
   */
  { takeEventStatus = false }: { takeEventStatus?: boolean } = {},
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
  // A schedule added beside others starts as a draft, to be published on its own; on an event holding none it takes the
  // event's status, so adding a part to an event published as it is never hides it from members (D52).
  const status =
    takeEventStatus || event._count.schedules === 0 ? scheduleStatusFor(event.status) : ScheduleStatus.Draft
  // Moved to another kind meanwhile: made from that kind's.
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

/**
 * The event's schedule made from this schedule template, made on the spot when it has none: for a kind using several
 * duties templates, a meeting gets one schedule per template (user, 2026-11-27). `adopt`: before making one, take a
 * schedule of its sort the event holds from none of these templates (one added by hand while its kind used none, or
 * from a template its kind no longer uses), as eventScheduleId took the event's schedule of the sort. Its status follows
 * D52 as eventScheduleId's; the event's row is locked before it is made, so two writers make it once.
 */
export async function eventScheduleOfTemplate(
  db: TransactionClient,
  eventId: number,
  scheduleTemplateId: number,
  congregationId: number,
  { takeEventStatus = false, adopt }: { takeEventStatus?: boolean; adopt?: readonly number[] } = {},
): Promise<number> {
  const find = async () =>
    (await db.schedule.findFirst({ where: { eventId, scheduleTemplateId, congregationId }, select: { id: true } })) ??
    (adopt == null
      ? null
      : await db.schedule.findFirst({
          where: {
            eventId,
            congregationId,
            kind: ScheduleKind.Duty,
            OR: [{ scheduleTemplateId: null }, { scheduleTemplateId: { notIn: [...adopt] } }],
          },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: { id: true },
        }))
  const existing = await find()
  if (existing) return existing.id
  const template = await db.scheduleTemplate.findFirst({
    where: { id: scheduleTemplateId, congregationId },
    select: { kind: true, name: true, key: true },
  })
  if (!template) throw new NotFoundError('ScheduleTemplate', scheduleTemplateId)
  await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} AND "congregationId" = ${congregationId} FOR UPDATE`
  const madeMeanwhile = await find()
  if (madeMeanwhile) return madeMeanwhile.id
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: { status: true, _count: { select: { schedules: true } } },
  })
  if (!event) throw new NotFoundError('Event', eventId)
  const status =
    takeEventStatus || event._count.schedules === 0 ? scheduleStatusFor(event.status) : ScheduleStatus.Draft
  const kind = template.kind as ScheduleKind
  const created = await db.schedule.create({
    data: {
      eventId,
      kind,
      order: SCHEDULE_ORDER[kind],
      status,
      scheduleTemplateId,
      name: template.name,
      key: template.key,
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
 * The event's schedules of these kinds, made where missing, for one action that brings several (giving a programme):
 * on an event holding none, they all take the event's status alike; beside a schedule it holds, the ones made start as
 * drafts (D52). The schedules it already holds come back as they are. Kinds not asked for are
 * null. The count is read before eventScheduleId locks the event (the template's row comes first): a writer making a
 * schedule meanwhile can only leave this action's schedules with the event's status, as before D52.
 */
export async function eventSchedulesOf(
  db: TransactionClient,
  eventId: number,
  kinds: readonly ScheduleKind[],
  congregationId: number,
): Promise<Record<ScheduleKind, number | null>> {
  const takeEventStatus = (await db.schedule.count({ where: { eventId, congregationId } })) === 0
  const ids: Record<ScheduleKind, number | null> = { programme: null, duty: null }
  for (const kind of kinds) ids[kind] = await eventScheduleId(db, eventId, kind, congregationId, { takeEventStatus })
  return ids
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
        takeEventStatus: true,
      })
      await db.eventPart.updateMany({ where, data: { scheduleId } })
    }
    if (event._count.eventServiceParts > 0) {
      const scheduleId = await eventScheduleId(db, event.id, ScheduleKind.Duty, congregationId, {
        takeEventStatus: true,
      })
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
