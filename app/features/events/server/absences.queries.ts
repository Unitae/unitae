import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * One person's absences touching a range, bounds included — the overlap rule checkDayOffConflict applies, so the
 * panel beside the list of people to pick from never disagrees with the list. By the person's record: an absence
 * declared from an account without one is nobody's.
 */
export function listAbsencesOverRange(
  db: TransactionClient,
  memberId: number,
  startDate: Date,
  endDate: Date,
  congregationId: number,
) {
  return db.absence.findMany({
    where: { congregationId, memberId, startDate: { lte: endDate }, endDate: { gte: startDate } },
    select: { id: true, startDate: true, endDate: true },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
}
