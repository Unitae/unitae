import { EventStatus } from '~/features/events/model/event-status.type'
import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import { planRecurringEvents } from '~/features/events/model/recurring-events'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'
import { combineLocalDateTime } from '~/shared/utils/event-time'

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
    audit({
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
  })
  const today = dayOf(now, timeZone)
  let created = 0
  for (const template of templates) {
    if (template.weekDay == null) continue
    created += await extendTemplate(db, { ...template, weekDay: template.weekDay }, { congregationId, timeZone, today })
  }
  return created
}
