import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { refreshConflictFlags } from '~/features/events/server/refresh-conflict-flags.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface ReleasedAccountEvents {
  /** The day-off events deleted with an account that has no record, for the audit trail. */
  absencesDeleted: { id: number; startDate: Date; endDate: Date }[]
  /** How many absences stayed on the record, now without the account (0 for an account without one). */
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
 * reads them by: their day-off events go and the rows stop naming the account (a day-off without its row gets one
 * first, and a row on no record moves onto the record, as linking does). Its other events lose their author and keep
 * their origin, so a hand-made one never becomes an empty meeting a template may move or delete.
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

  const absencesKept =
    account.memberId != null ? await keepOnRecord(db, account.id, account.memberId, dayOffs, congregationId) : 0
  if (dayOffs.length > 0) {
    await db.event.deleteMany({ where: { congregationId, id: { in: dayOffs.map(dayOff => dayOff.id) } } })
  }
  if (account.memberId == null) {
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

/**
 * Puts every absence of the account on its record, without the account, before its day-off events go; answers how many
 * there are. The ones the record did not have yet — a day-off the previous image wrote alone during the rollout, a row
 * on no record (an absence declared while the account was being linked) — now flag the record's assignments.
 */
async function keepOnRecord(
  db: TransactionClient,
  accountId: number,
  memberId: number,
  dayOffs: { id: number; startDate: Date; endDate: Date; description: string; createdAt: Date }[],
  congregationId: number,
): Promise<number> {
  const copied = await db.absence.findMany({
    where: { congregationId, legacyEventId: { in: dayOffs.map(dayOff => dayOff.id) } },
    select: { legacyEventId: true },
  })
  const withRow = new Set(copied.map(row => row.legacyEventId))
  // Carrying the event's id, as every copied row does: the feed's identifier and the archive read it.
  const missing = dayOffs
    .filter(dayOff => !withRow.has(dayOff.id))
    .map(dayOff => ({
      startDate: dayOff.startDate,
      endDate: dayOff.endDate,
      note: dayOff.description,
      memberId,
      accountId: null,
      legacyEventId: dayOff.id,
      createdAt: dayOff.createdAt,
      congregationId,
    }))
  const created = missing.length > 0 ? (await db.absence.createMany({ data: missing })).count : 0
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
  for (const range of [...missing, ...recordless]) {
    await refreshConflictFlags(db, memberId, range.startDate, range.endDate, congregationId)
  }
  return created + moved.count + kept.count
}
