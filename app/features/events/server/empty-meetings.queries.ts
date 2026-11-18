import { planMeetingMoves } from '~/features/events/model/empty-meetings'
import { EventOrigin } from '~/features/events/model/event-origin.type'
import { EventStatus } from '~/features/events/model/event-status.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { addDays, dayOf, startOfDay } from '~/shared/utils/calendar-day'

/**
 * An empty meeting the recurring-events job created ahead: its origin, no part, no service, no attendance. Every
 * recurring template has some; they are the only events that move with it, or go with it. Not its author: deleting an
 * account clears the author of what it made, which must never turn into something a template may move or delete.
 */
export const EMPTY_MEETING = {
  origin: EventOrigin.Job,
  eventParts: { none: {} },
  eventServiceParts: { none: {} },
  attendance: { is: null },
}

interface PlacingContext {
  congregationId: number
  timeZone: string
  now: Date
}

/**
 * Where the template's empty meetings ahead should be (see planMeetingMoves), against the days its other events of
 * this week onwards already hold. Null for a template that is not there or has no day.
 */
export async function planTemplateMeetingMoves(
  db: TransactionClient,
  templateId: number,
  { congregationId, timeZone, now }: PlacingContext,
) {
  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: { weekDay: true, startTime: true, endTime: true },
  })
  if (template?.weekDay == null) return null
  const [meetings, others] = await Promise.all([
    db.event.findMany({
      where: { templateId, congregationId, status: EventStatus.Draft, startDate: { gte: now }, ...EMPTY_MEETING },
      select: { id: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    }),
    // From a week back: a week whose meeting already happened earlier in it is not given a second one.
    db.event.findMany({
      where: {
        templateId,
        congregationId,
        startDate: { gte: startOfDay(addDays(dayOf(now, timeZone), -6), timeZone) },
        NOT: EMPTY_MEETING,
      },
      select: { startDate: true },
    }),
  ])
  return planMeetingMoves({
    meetings,
    taken: others.map(event => dayOf(event.startDate, timeZone)),
    weekDay: template.weekDay,
    startTime: template.startTime,
    endTime: template.endTime,
    timeZone,
    now,
  })
}

/** How many empty meetings ahead « Déplacer les N réunions à venir » would move or delete: 0 when all are in place. */
export async function countMeetingsToMove(db: TransactionClient, templateId: number, ctx: PlacingContext) {
  const plan = await planTemplateMeetingMoves(db, templateId, ctx)
  return plan ? plan.move.length + plan.remove.length : 0
}
