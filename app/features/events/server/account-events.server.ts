import { EventTemplateKey } from '~/features/events/model/event-template.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface ReleasedAccountEvents {
  /** The day-off events deleted with an account that has no record, for the audit trail. */
  absencesDeleted: { id: number; startDate: Date; endDate: Date }[]
  /** How many absences stayed on the record of an account linked to one. */
  absencesKept: number
  /** How many of its other events lost their author. */
  eventsUnattributed: number
}

/**
 * Lets go of the events an account created, and of its Absence rows, before the account is deleted (from Réglages, or
 * by taking a login away from a record): `Event.createdBy` and `Absence.accountId` are Restrict, so the account could
 * not go otherwise.
 *
 * Its absences go with an account that has no record — nobody else is away on them, and they flagged no assignment,
 * since absences flag through the record. An account with a record leaves its absences on the record, which every list
 * reads them by: their day-off events go, and the rows stop naming the account. Its other events lose their author and
 * keep their origin, so a hand-made one never becomes an empty meeting a template may move or delete.
 */
export async function releaseAccountEvents(
  db: TransactionClient,
  account: { id: number; memberId: number | null },
  congregationId: number,
): Promise<ReleasedAccountEvents> {
  const dayOffs = await db.event.findMany({
    where: { congregationId, createdById: account.id, template: { key: EventTemplateKey.DayOff } },
    select: { id: true, startDate: true, endDate: true, description: true, createdAt: true },
    orderBy: { id: 'asc' },
  })

  let absencesKept = 0
  if (account.memberId != null && dayOffs.length > 0) {
    // A day-off written without its row (by a version before the absences table) would be lost with its event: it
    // gets its row on the record first, under the event's id so a subscribed calendar keeps knowing it.
    const copied = await db.absence.findMany({
      where: { congregationId, legacyEventId: { in: dayOffs.map(dayOff => dayOff.id) } },
      select: { legacyEventId: true },
    })
    const withRow = new Set(copied.map(row => row.legacyEventId))
    const missing = dayOffs.filter(dayOff => !withRow.has(dayOff.id))
    if (missing.length > 0) {
      const created = await db.absence.createMany({
        data: missing.map(dayOff => ({
          startDate: dayOff.startDate,
          endDate: dayOff.endDate,
          note: dayOff.description,
          memberId: account.memberId,
          accountId: null,
          legacyEventId: dayOff.id,
          createdAt: dayOff.createdAt,
          congregationId,
        })),
      })
      absencesKept += created.count
    }
  }

  if (dayOffs.length > 0) {
    await db.event.deleteMany({ where: { congregationId, id: { in: dayOffs.map(dayOff => dayOff.id) } } })
  }
  if (account.memberId != null) {
    const kept = await db.absence.updateMany({
      where: { congregationId, accountId: account.id, memberId: { not: null } },
      data: { accountId: null },
    })
    absencesKept += kept.count
    // Rows on no record have no one else to belong to: they go with the account.
    await db.absence.deleteMany({ where: { congregationId, accountId: account.id, memberId: null } })
  } else {
    // Every Absence row still naming the account (accountId is Restrict): those of the absences just deleted, and any
    // whose event went without them.
    await db.absence.deleteMany({ where: { congregationId, accountId: account.id } })
  }
  const unattributed = await db.event.updateMany({
    where: { congregationId, createdById: account.id },
    data: { createdById: null },
  })
  return {
    absencesDeleted:
      account.memberId == null ? dayOffs.map(({ id, startDate, endDate }) => ({ id, startDate, endDate })) : [],
    absencesKept,
    eventsUnattributed: unattributed.count,
  }
}
