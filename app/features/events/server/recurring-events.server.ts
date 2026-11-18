import { EventOrigin } from '~/features/events/model/event-origin.type'
import { EventStatus } from '~/features/events/model/event-status.type'
import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import { planRecurringEvents } from '~/features/events/model/recurring-events'
import { EMPTY_MEETING } from '~/features/events/server/empty-meetings.queries'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'
import { combineLocalDateTime } from '~/shared/utils/event-time'

const logger = createLogger('recurring-events')
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

interface MeetingTemplate {
  id: number
  name: string
  startTime: string
  endTime: string
}

/**
 * Creates empty meetings of a template on the given local days: its name and hours in the congregation's zone, draft,
 * no author — a meeting nobody has prepared yet. Shared by the job and by a series that starts beyond the horizon.
 */
export async function createEmptyMeetings(
  db: TransactionClient,
  template: MeetingTemplate,
  days: string[],
  { congregationId, timeZone }: { congregationId: number; timeZone: string },
): Promise<void> {
  if (days.length === 0) return
  await db.event.createMany({
    data: days.map(day => ({
      name: template.name,
      templateId: template.id,
      startDate: combineLocalDateTime(day, template.startTime, timeZone),
      endDate: combineLocalDateTime(day, template.endTime, timeZone),
      status: EventStatus.Draft,
      createdById: null,
      origin: EventOrigin.Job,
      congregationId,
    })),
  })
}

/**
 * Keeps one recurring template's events created ahead (see planRecurringEvents). The template row is locked first and
 * read again after the lock, so this and a series or an edit at the same moment cannot both create the same day, nor
 * create it on a weekday that just changed: there is no unique key on (template, day). Returns how many it created.
 */
async function extendTemplate(
  db: TransactionClient,
  templateId: number,
  { congregationId, timeZone, today }: { congregationId: number; timeZone: string; today: string },
): Promise<number> {
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ${templateId} AND "congregationId" = ${congregationId} FOR UPDATE`
  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: { id: true, name: true, weekDay: true, startTime: true, endTime: true, generatedUntil: true },
  })
  if (template?.weekDay == null) return 0
  // A template whose hours cannot be read (an old row, a hand edit) would fail every night and take the congregation's
  // other templates with it: it is skipped, and named.
  if (!(TIME.test(template.startTime) && TIME.test(template.endTime))) {
    logger.error('Recurring template skipped: its hours are not HH:MM', {
      congregationId,
      templateId,
      startTime: template.startTime,
      endTime: template.endTime,
    })
    return 0
  }

  const { generatedUntil } = template
  const lastEvent =
    generatedUntil == null
      ? await db.event.findFirst({
          where: { templateId, congregationId },
          orderBy: { startDate: 'desc' },
          select: { startDate: true },
        })
      : null
  const upcoming = await db.event.findMany({
    where: { templateId, congregationId, startDate: { gte: startOfDay(today, timeZone) } },
    select: { startDate: true },
  })
  const plan = planRecurringEvents({
    weekDay: template.weekDay,
    generatedUntil,
    lastEventDay: lastEvent ? dayOf(lastEvent.startDate, timeZone) : null,
    today,
    existingDays: new Set(upcoming.map(event => dayOf(event.startDate, timeZone))),
  })

  if (plan.days.length > 0) {
    await createEmptyMeetings(db, template, plan.days, { congregationId, timeZone })
    // In the transaction: the entry stands or falls with the events it counts.
    await auditInTransaction(db, {
      action: AuditAction.RecurringEventsCreated,
      congregationId,
      entityType: 'EventTemplate',
      entityId: templateId,
      metadata: { count: plan.days.length },
    })
  }
  if (plan.generatedUntil !== generatedUntil) {
    await db.eventTemplate.update({
      where: { id_congregationId: { id: templateId, congregationId } },
      data: { generatedUntil: plan.generatedUntil },
    })
  }
  return plan.days.length
}

/**
 * Creates the events every recurring template of a congregation still needs, two months ahead: bare draft events with
 * no author, which the people who prepare programmes fill in later. A template is recurring when it has a weekday;
 * the system templates never are. Run daily by the recurring-events job and once when a congregation is created.
 */
export async function extendRecurringEvents(
  db: TransactionClient,
  { congregationId, timeZone, now }: { congregationId: number; timeZone: string; now: Date },
): Promise<number> {
  const templates = await db.eventTemplate.findMany({
    where: { congregationId, weekDay: { not: null }, key: { notIn: [...SYSTEM_TEMPLATE_KEYS] } },
    select: { id: true },
    // In id order, like series creation locks them, so the two never wait on each other in a cycle.
    orderBy: { id: 'asc' },
  })
  const today = dayOf(now, timeZone)
  let created = 0
  for (const template of templates) {
    created += await extendTemplate(db, template.id, { congregationId, timeZone, today })
  }
  return created
}

/**
 * When the congregation's time zone changes, the empty meetings created ahead keep their local day but take their
 * template's hours in the new zone — they were created in the old one. Prepared programmes, and meetings with counts,
 * are left as they are.
 */
export async function reanchorEmptyMeetings(
  db: TransactionClient,
  input: { congregationId: number; previousTimeZone: string; timeZone: string; now: Date },
): Promise<void> {
  const { congregationId } = input
  const meetings = await db.event.findMany({
    where: {
      congregationId,
      ...EMPTY_MEETING,
      templateId: { not: null },
      startDate: { gte: input.now },
    },
    select: { id: true, startDate: true, template: { select: { startTime: true, endTime: true } } },
  })
  for (const meeting of meetings) {
    if (!meeting.template) continue
    const day = dayOf(meeting.startDate, input.previousTimeZone)
    await db.event.update({
      where: { id_congregationId: { id: meeting.id, congregationId } },
      data: {
        startDate: combineLocalDateTime(day, meeting.template.startTime, input.timeZone),
        endDate: combineLocalDateTime(day, meeting.template.endTime, input.timeZone),
      },
    })
  }
}
