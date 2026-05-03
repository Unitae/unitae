import type {
  Event,
  ProgrammePartAssignment,
  ProgrammeServiceRoleAssignment,
} from '~/database/generated/client'
import { EventKind } from '~/features/events/model/event-kind.type'
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

type PartWithEvent = ProgrammePartAssignment & { event: Event }
type ServiceRoleWithEvent = ProgrammeServiceRoleAssignment & { event: Event }

export async function getPersonalAssignments(
  db: TransactionClient,
  userId: number,
  since: Date,
): Promise<PersonalCalendarItem[]> {
  const [partAssignments, serviceRoleAssignments, daysOff] = await Promise.all([
    db.programmePartAssignment.findMany({
      where: {
        OR: [{ assigneeId: userId }, { assistantId: userId }],
        event: { startDate: { gte: since } },
      },
      include: { event: true },
    }),
    db.programmeServiceRoleAssignment.findMany({
      where: {
        assigneeId: userId,
        event: { startDate: { gte: since } },
      },
      include: { event: true },
    }),
    db.event.findMany({
      where: {
        createdById: userId,
        kind: { key: EventKind.Off },
        startDate: { gte: since },
      },
    }),
  ])

  return [
    ...partAssignments.map(p => partAssignmentToItem(p, userId)),
    ...serviceRoleAssignments.map(serviceRoleAssignmentToItem),
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
