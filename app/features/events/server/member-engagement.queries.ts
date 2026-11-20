import type { Prisma } from '~/database/generated/client'
import { EventStatus } from '~/features/events/model/event-status.type'
import type { MemberAbsence, MemberAssignment } from '~/features/events/model/member-engagement.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { CongregationId, MemberId } from '~/shared/types/branded'

const MAX_ASSIGNMENTS = 5

/**
 * One meeting's assignments in the programme's order, so a record reads the same every time. Coming ones: the date sort
 * is stable, so parts then services, each in theirs. Last done: `keep` only replaces on a later date, so the meeting's
 * first assignment wins.
 */
const PROGRAMME_ORDER = [{ event: { startDate: 'asc' } }, { order: 'asc' }, { id: 'asc' }] as const satisfies (
  | Prisma.EventPartOrderByWithRelationInput
  | Prisma.EventServicePartOrderByWithRelationInput
)[]

/**
 * Upcoming released parts and service parts a member holds (as assignee or
 * assistant), for the publisher record page. Read-only companion to the
 * dashboard's getUpcomingAssignments, keyed by an arbitrary member instead of
 * the signed-in one.
 */
export async function findUpcomingAssignmentsForMember(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: CongregationId,
  now: Date = new Date(),
): Promise<MemberAssignment[]> {
  const eventFilter = {
    congregationId,
    status: EventStatus.Released,
    startDate: { gte: now },
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
      orderBy: PROGRAMME_ORDER,
      take: MAX_ASSIGNMENTS,
    }),
    db.eventServicePart.findMany({
      where: { assigneeId: memberId, event: eventFilter },
      select,
      orderBy: PROGRAMME_ORDER,
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

/** The absences of a member still to come or under way, soonest first. */
export function findUpcomingAbsencesForMember(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: CongregationId,
  now: Date = new Date(),
): Promise<MemberAbsence[]> {
  return db.absence.findMany({
    where: { congregationId, memberId, endDate: { gte: now } },
    select: { id: true, startDate: true, endDate: true },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
}

/** How far back the publisher list looks for someone's last part. */
const LAST_ASSIGNMENT_WINDOW_MONTHS = 12

export interface LastAssignment {
  partName: string
  date: Date
}

/**
 * Each member's latest released part before now (as assignee or assistant, or on a service part),
 * within the last twelve months, for the publisher list. Members with none are absent from the map.
 */
export async function findLastAssignmentsForMembers(
  db: TransactionClient,
  memberIds: MemberId[],
  congregationId: CongregationId,
  now: Date = new Date(),
): Promise<Map<MemberId, LastAssignment>> {
  const last = new Map<MemberId, LastAssignment>()
  if (memberIds.length === 0) return last

  const since = new Date(now)
  since.setMonth(since.getMonth() - LAST_ASSIGNMENT_WINDOW_MONTHS)
  const event = {
    congregationId,
    status: EventStatus.Released,
    startDate: { gte: since, lt: now },
  }
  const [parts, serviceParts] = await Promise.all([
    db.eventPart.findMany({
      where: { OR: [{ assigneeId: { in: memberIds } }, { assistantId: { in: memberIds } }], event },
      select: { name: true, assigneeId: true, assistantId: true, event: { select: { startDate: true } } },
      orderBy: PROGRAMME_ORDER,
    }),
    db.eventServicePart.findMany({
      where: { assigneeId: { in: memberIds }, event },
      select: { name: true, assigneeId: true, event: { select: { startDate: true } } },
      orderBy: PROGRAMME_ORDER,
    }),
  ])

  const wanted = new Set<number>(memberIds)
  const keep = (memberId: number | null, partName: string, date: Date) => {
    if (memberId == null || !wanted.has(memberId)) return
    const current = last.get(memberId as MemberId)
    if (current == null || current.date < date) last.set(memberId as MemberId, { partName, date })
  }
  for (const part of parts) {
    keep(part.assigneeId, part.name, part.event.startDate)
    keep(part.assistantId, part.name, part.event.startDate)
  }
  for (const part of serviceParts) keep(part.assigneeId, part.name, part.event.startDate)
  return last
}

export interface NextAbsence {
  startDate: Date | null
  endDate: Date | null
}

/** Each member's earliest absence still to come or under way, for the publisher list. */
export async function findNextAbsencesForMembers(
  db: TransactionClient,
  memberIds: MemberId[],
  congregationId: CongregationId,
  now: Date = new Date(),
): Promise<Map<MemberId, NextAbsence>> {
  const next = new Map<MemberId, NextAbsence>()
  if (memberIds.length === 0) return next

  const absences = await db.absence.findMany({
    where: { congregationId, memberId: { in: memberIds }, endDate: { gte: now } },
    select: { startDate: true, endDate: true, memberId: true },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
  for (const absence of absences) {
    const memberId = absence.memberId
    if (memberId == null || next.has(memberId as MemberId)) continue
    next.set(memberId as MemberId, { startDate: absence.startDate, endDate: absence.endDate })
  }
  return next
}
