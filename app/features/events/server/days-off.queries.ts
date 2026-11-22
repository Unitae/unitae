import type { AssignKind } from '~/features/events/model/reassign'
import { ScheduleStatus } from '~/features/events/model/schedule.type'
import { absencesOf } from '~/features/events/server/absences.queries'
import {
  PART_ITEMS,
  PART_ITEMS_BY_DATE,
  publicItemId,
  SERVICE_ITEMS,
  SERVICE_ITEMS_BY_DATE,
} from '~/features/events/server/item-projection.server'
import {
  listUserConflictsInRange,
  type UserConflictInRange,
} from '~/features/events/server/list-user-conflicts-in-range.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface MyAbsence {
  /** The Absence row's id: the delete goes by it. */
  id: number
  startDate: Date
  endDate: Date
  /** The programme assignments falling during it, with whom to warn. */
  conflicts: UserConflictInRange[]
}

/**
 * The caller's absences still to come or under way, soonest first, each with the assignments that
 * fall during it: the list keeps showing whom to warn after the confirmation has gone.
 */
export async function listMyAbsences(
  db: TransactionClient,
  {
    accountId,
    memberId,
    congregationId,
    now,
  }: { accountId: number; memberId: number | null; congregationId: number; now: Date },
): Promise<MyAbsence[]> {
  const absences = await db.absence.findMany({
    where: { congregationId, ...absencesOf({ accountId, memberId }), endDate: { gte: now } },
    select: { id: true, startDate: true, endDate: true },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
  // Assignments belong to a member: an account without one has none to be absent from.
  if (absences.length === 0 || memberId == null) return absences.map(absence => ({ ...absence, conflicts: [] }))

  const spanEnd = new Date(Math.max(...absences.map(absence => absence.endDate.getTime())))
  const conflicts = await listUserConflictsInRange(db, memberId, absences[0].startDate, spanEnd)
  return absences.map(absence => ({
    ...absence,
    conflicts: conflicts.filter(c => c.eventDate >= absence.startDate && c.eventDate <= absence.endDate),
  }))
}

/** An assignment flagged as falling during its holder's absence, with what the reader needs to reach it. */
export interface AbsenceAssignment {
  kind: AssignKind
  /** The id publicItemId hands out (today the old part's or service's), with its kind beside it. */
  id: number
  name: string
  eventId: number
  eventDate: Date
  /** Who may reassign it follows the event's template. */
  templateId: number | null
  /** Its schedule is published: people already rely on it. */
  published: boolean
}

export interface CongregationAbsence {
  /** The Absence row's id: the delete goes by it. */
  id: number
  startDate: Date
  endDate: Date
  declaredAt: Date
  /** The member who is away; null for an account without one, which holds no assignment. */
  memberId: number | null
  firstname: string | null
  lastname: string | null
  conflicts: AbsenceAssignment[]
}

const overlaps = (event: { startDate: Date; endDate: Date }, absence: { startDate: Date; endDate: Date }) =>
  event.startDate <= absence.endDate && event.endDate >= absence.startDate

/**
 * Everyone's absences touching [from, to], soonest first, each with the assignments flagged as falling during it,
 * drafts included: the people preparing a programme want to see them before it goes out. One query per kind of
 * assignment for the whole list.
 */
export async function listCongregationAbsences(
  db: TransactionClient,
  { congregationId, from, to }: { congregationId: number; from: Date; to: Date },
): Promise<CongregationAbsence[]> {
  const rows = await db.absence.findMany({
    where: { congregationId, startDate: { lte: to }, endDate: { gte: from } },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      member: { select: { id: true, firstname: true, lastname: true } },
      account: { select: { firstname: true, lastname: true } },
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
  // The person away: their record, or the account that declared it when there is none.
  const absences = rows.map(({ member, account, createdAt, ...row }) => ({
    ...row,
    declaredAt: createdAt,
    memberId: member?.id ?? null,
    firstname: member?.firstname ?? account?.firstname ?? null,
    lastname: member?.lastname ?? account?.lastname ?? null,
  }))
  const memberIds = [...new Set(absences.flatMap(absence => (absence.memberId == null ? [] : [absence.memberId])))]
  if (memberIds.length === 0) return absences.map(absence => ({ ...absence, conflicts: [] }))

  const span = {
    startDate: { lte: new Date(Math.max(...absences.map(absence => absence.endDate.getTime()))) },
    endDate: { gte: new Date(Math.min(...absences.map(absence => absence.startDate.getTime()))) },
  }
  const event = { select: { id: true, startDate: true, endDate: true, templateId: true } }
  const schedule = { select: { status: true } }
  const [parts, services] = await Promise.all([
    db.item.findMany({
      where: {
        ...PART_ITEMS,
        congregationId,
        hasConflict: true,
        event: span,
        OR: [{ assigneeId: { in: memberIds } }, { assistantId: { in: memberIds } }],
      },
      select: {
        id: true,
        name: true,
        assigneeId: true,
        assistantId: true,
        event,
        schedule,
      },
      orderBy: PART_ITEMS_BY_DATE,
    }),
    db.item.findMany({
      where: { ...SERVICE_ITEMS, congregationId, hasConflict: true, event: span, assigneeId: { in: memberIds } },
      select: { id: true, name: true, assigneeId: true, event, schedule },
      orderBy: SERVICE_ITEMS_BY_DATE,
    }),
  ])
  const slots = [
    ...parts.map(part => ({
      id: publicItemId(part),
      name: part.name,
      event: part.event,
      published: part.schedule?.status === ScheduleStatus.Published,
      kind: 'part' as const,
      holders: [part.assigneeId, part.assistantId],
    })),
    ...services.map(service => ({
      id: publicItemId(service),
      name: service.name,
      event: service.event,
      published: service.schedule?.status === ScheduleStatus.Published,
      kind: 'service' as const,
      holders: [service.assigneeId],
    })),
  ]

  return absences.map(absence => ({
    ...absence,
    conflicts: slots
      .filter(
        slot => absence.memberId != null && slot.holders.includes(absence.memberId) && overlaps(slot.event, absence),
      )
      .map(slot => ({
        kind: slot.kind,
        id: slot.id,
        name: slot.name,
        eventId: slot.event.id,
        eventDate: slot.event.startDate,
        templateId: slot.event.templateId,
        published: slot.published,
      }))
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime()),
  }))
}

/** Whether anyone has ever declared an absence: the page's empty state says which of two things happened. */
export async function congregationHasAbsences(db: TransactionClient, congregationId: number): Promise<boolean> {
  const one = await db.absence.findFirst({ where: { congregationId }, select: { id: true } })
  return one != null
}
