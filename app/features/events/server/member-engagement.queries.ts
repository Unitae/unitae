import { EventStatus } from '~/features/events/model/event-status.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface MemberAssignment {
  key: string
  partName: string
  eventId: number
  eventName: string
  eventStartDate: Date
}

export interface MemberAbsence {
  id: number
  startDate: Date | null
  endDate: Date | null
}

const MAX_ASSIGNMENTS = 5

/**
 * Upcoming released parts and service parts a member holds (as assignee or
 * assistant), for the publisher record page. Read-only companion to the
 * dashboard's getUpcomingAssignments, keyed by an arbitrary member instead of
 * the signed-in one.
 */
export async function findUpcomingAssignmentsForMember(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  now: Date = new Date(),
): Promise<MemberAssignment[]> {
  const eventFilter = {
    congregationId,
    status: EventStatus.Released,
    startDate: { gte: now },
    NOT: { template: { key: EventTemplateKey.DayOff } },
  }
  const select = {
    id: true,
    name: true,
    event: { select: { id: true, name: true, startDate: true } },
  }

  const [parts, serviceParts] = await Promise.all([
    db.eventPart.findMany({
      where: { OR: [{ assigneeId: memberId }, { assistantId: memberId }], event: eventFilter },
      select,
      orderBy: { event: { startDate: 'asc' } },
      take: MAX_ASSIGNMENTS,
    }),
    db.eventServicePart.findMany({
      where: { assigneeId: memberId, event: eventFilter },
      select,
      orderBy: { event: { startDate: 'asc' } },
      take: MAX_ASSIGNMENTS,
    }),
  ])

  return [
    ...parts.map(part => ({ key: `part-${part.id}`, ...toAssignment(part) })),
    ...serviceParts.map(part => ({ key: `service-${part.id}`, ...toAssignment(part) })),
  ]
    .sort((a, b) => a.eventStartDate.getTime() - b.eventStartDate.getTime())
    .slice(0, MAX_ASSIGNMENTS)
}

function toAssignment(part: { name: string; event: { id: number; name: string; startDate: Date } }) {
  return {
    partName: part.name,
    eventId: part.event.id,
    eventName: part.event.name,
    eventStartDate: part.event.startDate,
  }
}

/**
 * Upcoming day-off periods of a member, resolved through their linked login
 * account (day-off events are account-created). Members without an account
 * simply have none.
 */
export function findUpcomingAbsencesForMember(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  now: Date = new Date(),
): Promise<MemberAbsence[]> {
  return db.event.findMany({
    where: {
      congregationId,
      template: { key: EventTemplateKey.DayOff },
      createdBy: { member: { id: memberId } },
      endDate: { gte: now },
    },
    select: { id: true, startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  })
}
