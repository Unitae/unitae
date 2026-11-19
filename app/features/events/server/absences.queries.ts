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

/**
 * Whose absences these are, as a where clause: the person's record when they have one, otherwise the account that
 * declared them — an account without a record has its own.
 */
export function absencesOf(person: { accountId: number; memberId: number | null }) {
  return person.memberId != null ? { memberId: person.memberId } : { accountId: person.accountId, memberId: null }
}
