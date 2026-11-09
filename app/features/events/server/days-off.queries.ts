import { EventTemplateKey } from '~/features/events/model/event-template.type'
import {
  listUserConflictsInRange,
  type UserConflictInRange,
} from '~/features/events/server/list-user-conflicts-in-range.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/** One of the caller's own absences; null for anyone else's, and for any event that is not an absence. */
export function findOwnDayOff(
  db: TransactionClient,
  { eventId, accountId, congregationId }: { eventId: number; accountId: number; congregationId: number },
) {
  return db.event.findFirst({
    where: { id: eventId, congregationId, createdById: accountId, template: { key: EventTemplateKey.DayOff } },
    select: { id: true, startDate: true, endDate: true },
  })
}

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
