import type { Event, EventPart, EventServiceRole } from '~/database/generated/client'
import { EventStatus } from '~/features/events/model/event-status.type'
import { EventTemplateKey } from '~/features/events/model/programme-template.type'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'

export type PersonalCalendarItem = {
  uid: string
  kind: 'programme-part' | 'programme-part-assistant' | 'programme-service-role' | 'day-off'
  summary: string
  description: string
  start: Date
  end: Date
  allDay: boolean
  updatedAt: Date
}

type PartWithEvent = EventPart & { event: Event }
type ServiceRoleWithEvent = EventServiceRole & { event: Event }

/**
 * `userId` is a UserAccount id. Days-off events are account-bound (createdById),
 * while programme assignments are member-bound (assigneeId/assistantId), so we
 * resolve the linked member id internally.
 */
export async function getPersonalAssignments(
  db: TransactionClient,
  userId: number,
  since: Date,
): Promise<PersonalCalendarItem[]> {
  const account = await db.userAccount.findUnique({
    where: { id: userId },
    select: { memberId: true },
  })
  const memberId = account?.memberId ?? null

  const [parts, serviceRoles, daysOff] = await Promise.all([
    memberId != null
      ? db.eventPart.findMany({
          where: {
            OR: [{ assigneeId: memberId }, { assistantId: memberId }],
            // Drafts stay off the publisher's calendar and ICS feed.
            event: { startDate: { gte: since }, status: EventStatus.Released },
          },
          include: { event: true },
        })
      : Promise.resolve([]),
    memberId != null
      ? db.eventServiceRole.findMany({
          where: {
            assigneeId: memberId,
            event: { startDate: { gte: since }, status: EventStatus.Released },
          },
          include: { event: true },
        })
      : Promise.resolve([]),
    db.event.findMany({
      where: {
        createdById: userId,
        template: { key: EventTemplateKey.DayOff },
        startDate: { gte: since },
      },
    }),
  ])

  return [
    ...parts.map(p => partAssignmentToItem(p, memberId ?? userId)),
    ...serviceRoles.map(serviceRoleAssignmentToItem),
    ...daysOff.map(dayOffToItem),
  ]
}

function partAssignmentToItem(assignment: PartWithEvent, userId: number): PersonalCalendarItem {
  const isAssistant = assignment.assistantId === userId
  const role = isAssistant ? m.calendar_feed_role_reader() : m.calendar_feed_role_speaker()
  const summaryParts = [assignment.event.name, assignment.name].filter(Boolean)

  const descriptionLines = [m.calendar_feed_part_description({ role, section: assignment.section || '—' })]
  if (assignment.topic) descriptionLines.push(m.calendar_feed_part_topic({ topic: assignment.topic }))
  if (assignment.note) descriptionLines.push(m.calendar_feed_part_note({ note: assignment.note }))

  return {
    uid: `programme-part-${isAssistant ? 'assistant' : 'assignee'}-${assignment.id}`,
    kind: isAssistant ? 'programme-part-assistant' : 'programme-part',
    summary: `${role} — ${summaryParts.join(' · ')}`,
    description: descriptionLines.join('\n'),
    start: assignment.event.startDate,
    end: assignment.event.endDate,
    allDay: false,
    updatedAt: assignment.updatedAt,
  }
}

function serviceRoleAssignmentToItem(assignment: ServiceRoleWithEvent): PersonalCalendarItem {
  const role = m.calendar_feed_role_service()
  const summaryParts = [assignment.event.name, assignment.name].filter(Boolean)

  const descriptionLines = [m.calendar_feed_part_description({ role, section: assignment.name || '—' })]
  if (assignment.note) descriptionLines.push(m.calendar_feed_part_note({ note: assignment.note }))

  return {
    uid: `programme-service-role-${assignment.id}`,
    kind: 'programme-service-role',
    summary: `${role} — ${summaryParts.join(' · ')}`,
    description: descriptionLines.join('\n'),
    start: assignment.event.startDate,
    end: assignment.event.endDate,
    allDay: false,
    updatedAt: assignment.updatedAt,
  }
}

function dayOffToItem(event: Event): PersonalCalendarItem {
  return {
    uid: `day-off-${event.id}`,
    kind: 'day-off',
    summary: m.calendar_feed_day_off_summary(),
    description: '',
    start: event.startDate,
    end: addOneDay(event.endDate),
    allDay: true,
    updatedAt: event.updatedAt,
  }
}

function addOneDay(date: Date): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next
}
