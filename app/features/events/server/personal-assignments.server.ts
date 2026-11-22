import type { Absence, Event, EventPart, EventServicePart } from '~/database/generated/client'
import { VISIBLE_ITEM } from '~/features/events/model/visibility'
import { absencesOf } from '~/features/events/server/absences.queries'
import {
  asEventPart,
  asEventServicePart,
  ITEM_ORIGIN_INCLUDE,
  PART_ITEMS,
  SERVICE_ITEMS,
} from '~/features/events/server/item-projection.server'
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
type ServicePartWithEvent = EventServicePart & { event: Event }

/**
 * `userId` is a UserAccount id. Event parts and service roles are member-bound (assigneeId/assistantId), and so are
 * absences when the account has a record (by the account otherwise), so we resolve the linked member id internally.
 */
export async function getPersonalAssignments(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  since: Date,
): Promise<PersonalCalendarItem[]> {
  const account = await db.userAccount.findUnique({
    where: { id_congregationId: { id: userId, congregationId } },
    select: { memberId: true },
  })
  const memberId = account?.memberId ?? null

  const [parts, serviceParts, daysOff] = await Promise.all([
    memberId != null
      ? db.item.findMany({
          where: {
            ...PART_ITEMS,
            // Drafts stay off the publisher's calendar and ICS feed.
            ...VISIBLE_ITEM,
            OR: [{ assigneeId: memberId }, { assistantId: memberId }],
            event: { startDate: { gte: since } },
          },
          include: { ...ITEM_ORIGIN_INCLUDE, event: true },
        })
      : Promise.resolve([]),
    memberId != null
      ? db.item.findMany({
          where: {
            ...SERVICE_ITEMS,
            ...VISIBLE_ITEM,
            assigneeId: memberId,
            event: { startDate: { gte: since } },
          },
          include: { ...ITEM_ORIGIN_INCLUDE, event: true },
        })
      : Promise.resolve([]),
    db.absence.findMany({
      where: { congregationId, ...absencesOf({ accountId: userId, memberId }), startDate: { gte: since } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    }),
  ])

  return [
    ...parts.map(p => partAssignmentToItem(asEventPart(p), memberId ?? userId)),
    ...serviceParts.map(s => servicePartAssignmentToItem(asEventServicePart(s))),
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

function servicePartAssignmentToItem(assignment: ServicePartWithEvent): PersonalCalendarItem {
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

function dayOffToItem(absence: Absence): PersonalCalendarItem {
  return {
    // Prefixed so it stays unique among the feed's items. Not `day-off-`: that prefix carried a day-off event's id, and a
    // subscribed calendar may still hold such an entry (it is replaced once, on its next sync).
    uid: `absence-${absence.id}`,
    kind: 'day-off',
    summary: m.calendar_feed_day_off_summary(),
    description: '',
    start: absence.startDate,
    end: addOneDay(absence.endDate),
    allDay: true,
    // Absences are never edited, so their declaration is their last change.
    updatedAt: absence.createdAt,
  }
}

function addOneDay(date: Date): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next
}
