import { EventStatus } from '~/features/events/model/event-status.type'
import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import { planRecurringEvents } from '~/features/events/model/recurring-events'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'
import { combineLocalDateTime } from '~/shared/utils/event-time'

const logger = createLogger('recurring-events')
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

interface TemplateRow {
  id: number
  name: string
  weekDay: number | null
  startTime: string
  endTime: string
}

/**
 * Keeps one recurring template's events created ahead (see planRecurringEvents). The template row is locked first, so
 * this and a series being created at the same moment cannot both create the same day: there is no unique key on
 * (template, day). Returns how many events it created.
 */
async function extendTemplate(
  db: TransactionClient,
  template: TemplateRow & { weekDay: number },
  { congregationId, timeZone, today }: { congregationId: number; timeZone: string; today: string },
): Promise<number> {
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ${template.id} AND "congregationId" = ${congregationId} FOR UPDATE`
  const mark = await db.eventTemplate.findFirst({
    where: { id: template.id, congregationId },
    select: { generatedUntil: true },
  })
  const generatedUntil = mark?.generatedUntil ?? null
  const lastEvent =
    generatedUntil == null
      ? await db.event.findFirst({
          where: { templateId: template.id, congregationId },
          orderBy: { startDate: 'desc' },
          select: { startDate: true },
        })
      : null
  const upcoming = await db.event.findMany({
    where: { templateId: template.id, congregationId, startDate: { gte: startOfDay(today, timeZone) } },
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
    await db.event.createMany({
      data: plan.days.map(day => ({
        name: template.name,
        templateId: template.id,
        startDate: combineLocalDateTime(day, template.startTime, timeZone),
        endDate: combineLocalDateTime(day, template.endTime, timeZone),
        // A meeting nobody has prepared yet: no programme, nothing to publish, no author.
        status: EventStatus.Draft,
        createdById: null,
        congregationId,
      })),
    })
    // In the transaction: the entry stands or falls with the events it counts.
    await auditInTransaction(db, {
      action: AuditAction.RecurringEventsCreated,
      congregationId,
      entityType: 'EventTemplate',
      entityId: template.id,
      metadata: { count: plan.days.length },
    })
  }
  if (plan.generatedUntil !== generatedUntil) {
    await db.eventTemplate.update({
      where: { id_congregationId: { id: template.id, congregationId } },
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
    select: { id: true, name: true, weekDay: true, startTime: true, endTime: true },
    // In id order, like series creation locks them, so the two never wait on each other in a cycle.
    orderBy: { id: 'asc' },
  })
  const today = dayOf(now, timeZone)
  let created = 0
  for (const template of templates) {
    if (template.weekDay == null) continue
    // A template whose hours cannot be read (an old row, a hand edit) would fail every night and take the
    // congregation's other templates with it: it is skipped, and named.
    if (!(TIME.test(template.startTime) && TIME.test(template.endTime))) {
      logger.error('Recurring template skipped: its hours are not HH:MM', {
        congregationId,
        templateId: template.id,
        startTime: template.startTime,
        endTime: template.endTime,
      })
      continue
    }
    created += await extendTemplate(db, { ...template, weekDay: template.weekDay }, { congregationId, timeZone, today })
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
      createdById: null,
      eventParts: { none: {} },
      eventServiceParts: { none: {} },
      attendance: { is: null },
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
