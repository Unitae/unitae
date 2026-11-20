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
// is the add_schedules migration's, for one event: keep the two in step. While it lasts, an event has at most one
// schedule of each kind, and its schedules follow its template and its status.

/** What a schedule copies from the schedule template it is made from: none, and the catalogue's key, without one. */
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
): Promise<number> {
  const existing = await db.schedule.findFirst({
    where: { eventId, kind, congregationId },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  if (existing) return existing.id

  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: { templateId: true, status: true },
  })
  if (!event) throw new NotFoundError('Event', eventId)
  const created = await db.schedule.create({
    data: {
      eventId,
      kind,
      order: SCHEDULE_ORDER[kind],
      status: scheduleStatusFor(event.status),
      ...(await scheduleTemplateFor(db, event.templateId, kind, congregationId)),
      congregationId,
    },
  })
  return created.id
}

/** Points the event's schedules at its template's schedule templates, by kind: after the event changed template. */
export async function alignEventSchedules(db: TransactionClient, eventId: number, congregationId: number) {
  const event = await db.event.findFirst({
    where: { id: eventId, congregationId },
    select: { templateId: true, schedules: { select: { id: true, kind: true } } },
  })
  if (!event) return
  for (const schedule of event.schedules) {
    await db.schedule.update({
      where: { id_congregationId: { id: schedule.id, congregationId } },
      data: await scheduleTemplateFor(db, event.templateId, schedule.kind as ScheduleKind, congregationId),
    })
  }
}

/** Every schedule of these events takes the status the events were given. */
export async function setEventSchedulesStatus(
  db: TransactionClient,
  eventIds: number[],
  eventStatus: string,
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
 * the events its event's status: for items written without one (a demo, a restored archive). Idempotent.
 */
export async function attachEventItems(db: TransactionClient, eventIds: number[], congregationId: number) {
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
      const scheduleId = await eventScheduleId(db, event.id, ScheduleKind.Programme, congregationId)
      await db.eventPart.updateMany({ where, data: { scheduleId } })
    }
    if (event._count.eventServiceParts > 0) {
      const scheduleId = await eventScheduleId(db, event.id, ScheduleKind.Duty, congregationId)
      await db.eventServicePart.updateMany({ where, data: { scheduleId } })
    }
  }
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
