import { absencesOf } from '~/features/events/server/absences.queries'
import { refreshConflictFlags } from '~/features/events/server/refresh-conflict-flags.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/** The absences of the account's person still to come or under way, soonest first: by their record when they have one. */
export async function getNextDaysOffs(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  now: Date = new Date(),
) {
  const account = await db.userAccount.findFirst({ where: { id: userId, congregationId }, select: { memberId: true } })
  return db.absence.findMany({
    where: {
      congregationId,
      ...absencesOf({ accountId: userId, memberId: account?.memberId ?? null }),
      endDate: { gte: now },
    },
    select: { id: true, startDate: true, endDate: true },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  })
}

// `accountId` is who declared it. `memberId` (null for an account without a record — administrators, circuit overseers)
// makes the Absence row the person's and drives refreshConflictFlags; when it's null there can be no assignments to
// conflict, so the refresh is skipped.
export async function createDayOff(
  db: TransactionClient,
  accountId: number,
  memberId: number | null,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
  congregationId: number,
) {
  if (startDate == null || endDate == null) {
    return null
  }

  if (startDate > endDate) {
    return null
  }

  const absence = await db.absence.create({
    data: { startDate, endDate, memberId, accountId, congregationId },
  })

  if (memberId != null) {
    await refreshConflictFlags(db, memberId, startDate, endDate, congregationId)
  }

  // Awaited, in the same transaction: the record of who declared it stands or falls with the absence.
  await auditInTransaction(db, {
    action: AuditAction.DayOffCreated,
    congregationId,
    actorId: accountId,
    entityType: 'Absence',
    entityId: absence.id,
  })
  // The row the absence is deleted by.
  return { absenceId: absence.id }
}

/**
 * Deletes one of the caller's own absences, by its row.
 * Anything else answers null and stays: another person's absence, or no absence at all.
 */
export async function deleteDayOff(
  db: TransactionClient,
  {
    absenceId,
    accountId,
    memberId,
    congregationId,
  }: { absenceId: number; accountId: number; memberId: number | null; congregationId: number },
) {
  const absence = await db.absence.findFirst({
    where: { id: absenceId, congregationId, ...absencesOf({ accountId, memberId }) },
    select: { id: true, startDate: true, endDate: true },
  })
  if (absence == null) return null

  // A second delete of the same absence (a double click, another tab) finds it gone and answers as for no absence.
  const { count } = await db.absence.deleteMany({ where: { id: absence.id, congregationId } })
  if (count === 0) return null

  if (memberId != null) {
    await refreshConflictFlags(db, memberId, absence.startDate, absence.endDate, congregationId)
  }

  await auditInTransaction(db, {
    action: AuditAction.DayOffDeleted,
    congregationId,
    actorId: accountId,
    entityType: 'Absence',
    entityId: absence.id,
  })
  return absence
}
