import { EventStatus } from '~/features/events/model/event-status.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import type { AssignKind } from '~/features/events/model/reassign'
import {
  listUserConflictsInRange,
  type UserConflictInRange,
} from '~/features/events/server/list-user-conflicts-in-range.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface MyAbsence {
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
  const absences = await db.event.findMany({
    where: {
      congregationId,
      createdById: accountId,
      template: { key: EventTemplateKey.DayOff },
      endDate: { gte: now },
    },
    select: { id: true, startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
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
  /** The part's or the service's id, from its own table. */
  id: number
  name: string
  eventId: number
  eventDate: Date
  /** Who may reassign it follows the event's template. */
  templateId: number | null
  /** Its programme is published: people already rely on it. */
  published: boolean
}

export interface CongregationAbsence {
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
  const rows = await db.event.findMany({
    where: {
      congregationId,
      template: { key: EventTemplateKey.DayOff },
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      createdBy: {
        select: { firstname: true, lastname: true, member: { select: { id: true, firstname: true, lastname: true } } },
      },
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
  // Absences belong to the account that declared them; the person away is its member, when it has one.
  const absences = rows.map(({ createdBy, createdAt, ...row }) => ({
    ...row,
    declaredAt: createdAt,
    memberId: createdBy.member?.id ?? null,
    firstname: createdBy.member?.firstname ?? createdBy.firstname,
    lastname: createdBy.member?.lastname ?? createdBy.lastname,
  }))
  const memberIds = [...new Set(absences.flatMap(absence => (absence.memberId == null ? [] : [absence.memberId])))]
  if (memberIds.length === 0) return absences.map(absence => ({ ...absence, conflicts: [] }))

  const span = {
    startDate: { lte: new Date(Math.max(...absences.map(absence => absence.endDate.getTime()))) },
    endDate: { gte: new Date(Math.min(...absences.map(absence => absence.startDate.getTime()))) },
  }
  const event = { select: { id: true, startDate: true, endDate: true, templateId: true, status: true } }
  const [parts, services] = await Promise.all([
    db.eventPart.findMany({
      where: {
        congregationId,
        hasConflict: true,
        event: span,
        OR: [{ assigneeId: { in: memberIds } }, { assistantId: { in: memberIds } }],
      },
      select: { id: true, name: true, assigneeId: true, assistantId: true, event },
    }),
    db.eventServicePart.findMany({
      where: { congregationId, hasConflict: true, event: span, assigneeId: { in: memberIds } },
      select: { id: true, name: true, assigneeId: true, event },
    }),
  ])
  const slots = [
    ...parts.map(part => ({ ...part, kind: 'part' as const, holders: [part.assigneeId, part.assistantId] })),
    ...services.map(service => ({ ...service, kind: 'service' as const, holders: [service.assigneeId] })),
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
        published: slot.event.status === EventStatus.Released,
      }))
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime()),
  }))
}

/** Whether anyone has ever declared an absence: the page's empty state says which of two things happened. */
export async function congregationHasAbsences(db: TransactionClient, congregationId: number): Promise<boolean> {
  const one = await db.event.findFirst({
    where: { congregationId, template: { key: EventTemplateKey.DayOff } },
    select: { id: true },
  })
  return one != null
}
