import { refreshConflictFlags } from '~/features/events/server/refresh-conflict-flags.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface ReleasedAccountEvents {
  /** The absences deleted with an account that has no record (their rows), for the audit trail. */
  absencesDeleted: { id: number; startDate: Date; endDate: Date }[]
  /** How many absences stayed on the record, now without the account (0 for an account without one). */
  absencesKept: number
  /** How many of its events lost their author. */
  eventsUnattributed: number
}

/**
 * Lets go of the events an account created, and of its Absence rows, before the account is deleted (from Réglages, or
 * by taking a login away from a record): `Event.createdBy` and `Absence.accountId` are Restrict, so the account could
 * not go otherwise.
 *
 * Its absences go with an account that has no record — nobody else is away on them, and they flagged no assignment,
 * since absences flag through the record. An account with a record leaves its absences on the record, which every list
 * reads them by: the rows stop naming the account (a row on no record moves onto the record, as linking does). Its
 * events lose their author and keep their origin, so a hand-made one never becomes an empty meeting a template may
 * move or delete.
 */
export async function releaseAccountEvents(
  db: TransactionClient,
  account: { id: number; memberId: number | null },
  congregationId: number,
): Promise<ReleasedAccountEvents> {
  const absencesKept =
    account.memberId != null ? await keepOnRecord(db, account.id, account.memberId, congregationId) : 0
  // Every Absence row still naming the account (accountId is Restrict). Read first, for the audit trail.
  const absencesDeleted =
    account.memberId == null
      ? await db.absence.findMany({
          where: { congregationId, accountId: account.id },
          select: { id: true, startDate: true, endDate: true },
          orderBy: { id: 'asc' },
        })
      : []
  if (absencesDeleted.length > 0) {
    await db.absence.deleteMany({ where: { congregationId, accountId: account.id } })
  }
  const unattributed = await db.event.updateMany({
    where: { congregationId, createdById: account.id },
    data: { createdById: null },
  })
  return { absencesDeleted, absencesKept, eventsUnattributed: unattributed.count }
}

/**
 * Puts every absence of the account on its record, without the account; answers how many there are. A row on no
 * record (an absence declared while the account was being linked) is new to the record and now flags its assignments.
 */
async function keepOnRecord(
  db: TransactionClient,
  accountId: number,
  memberId: number,
  congregationId: number,
): Promise<number> {
  const recordless = await db.absence.findMany({
    where: { congregationId, accountId, memberId: null },
    select: { startDate: true, endDate: true },
  })
  const moved = await db.absence.updateMany({
    where: { congregationId, accountId, memberId: null },
    data: { memberId, accountId: null },
  })
  const kept = await db.absence.updateMany({
    where: { congregationId, accountId, memberId: { not: null } },
    data: { accountId: null },
  })
  for (const range of recordless) {
    await refreshConflictFlags(db, memberId, range.startDate, range.endDate, congregationId)
  }
  return moved.count + kept.count
}
