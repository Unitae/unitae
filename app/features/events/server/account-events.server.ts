import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Refused: the account is linked to a record and has absences. They are the person's, not the login's: an
 * administrator cannot delete someone else's absences, so the account stays until it can hand them to its record.
 */
export class AccountHasAbsencesError extends ConflictError {}

export interface ReleasedAccountEvents {
  /** The absences deleted with an account that has no record, for the audit trail. */
  absencesDeleted: { id: number; startDate: Date; endDate: Date }[]
  /** How many of its other events lost their author. */
  eventsUnattributed: number
}

/**
 * Lets go of the events an account created, before the account is deleted (from Réglages, or by taking a login away
 * from a record): `Event.createdBy` is Restrict, so the account could not go otherwise.
 *
 * Its absences go with an account that has no record — nobody else is away on them, and they flagged no assignment,
 * since absences flag through the record. An account with a record and absences is refused (AccountHasAbsencesError).
 * Its other events lose their author and keep their origin, so a hand-made one never becomes an empty meeting a
 * template may move or delete.
 */
export async function releaseAccountEvents(
  db: TransactionClient,
  account: { id: number; memberId: number | null },
  congregationId: number,
): Promise<ReleasedAccountEvents> {
  const absences = await db.event.findMany({
    where: { congregationId, createdById: account.id, template: { key: EventTemplateKey.DayOff } },
    select: { id: true, startDate: true, endDate: true },
    orderBy: { id: 'asc' },
  })
  if (account.memberId != null && absences.length > 0) throw new AccountHasAbsencesError('The account has absences')

  if (absences.length > 0) {
    await db.event.deleteMany({ where: { congregationId, id: { in: absences.map(absence => absence.id) } } })
  }
  const unattributed = await db.event.updateMany({
    where: { congregationId, createdById: account.id },
    data: { createdById: null },
  })
  return { absencesDeleted: absences, eventsUnattributed: unattributed.count }
}
