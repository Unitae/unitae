import { EventStatus } from '~/features/events/model/event-status.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { absencesOf } from '~/features/events/server/absences.queries'
import { refreshConflictFlags } from '~/features/events/server/refresh-conflict-flags.server'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
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

// `accountId` writes Event.createdBy and Absence.accountId. `memberId` (null for
// an account without a record — administrators, circuit overseers) makes the
// Absence row the person's and drives refreshConflictFlags; when it's null
// there can be no assignments to conflict, so the refresh is skipped.
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

  // The day-off template is what keeps this event out of the programme: programme readers leave out events by
  // `template.key = 'day-off'`, so one written without it would show as an empty meeting. Fail loudly on a
  // mis-provisioned tenant instead of a silent success flash.
  const dayOffTemplate = await db.eventTemplate.findFirst({
    where: { key: EventTemplateKey.DayOff, congregationId },
  })
  if (!dayOffTemplate) throw new NotFoundError('Day-off template')

  const event = await db.event.create({
    data: {
      template: { connect: { id: dayOffTemplate.id } },
      startDate,
      endDate,
      createdBy: { connect: { id: accountId } },
      name: m.seed_template_day_off(),
      congregation: { connect: { id: congregationId } },
      // Days-off never go through the release workflow — they must be visible
      // to the conflict pipeline immediately.
      status: EventStatus.Released,
    },
  })
  // Written twice until the events are dropped: the lists, the feed and the conflict checks read the Absence row (the
  // person's record when the account has one); account deletion and backups still go through the event, and deleting
  // either one takes the other.
  const absence = await db.absence.create({
    data: { startDate, endDate, memberId, accountId, legacyEventId: event.id, congregationId },
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
  // The event, and the row an absence is deleted by.
  return { ...event, absenceId: absence.id }
}

/**
 * Deletes one of the caller's own absences, by its row, with the day-off event written alongside it when there is one.
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
    select: { id: true, startDate: true, endDate: true, legacyEventId: true },
  })
  if (absence == null) return null

  // A second delete of the same absence (a double click, another tab) finds it gone and answers as for no absence.
  const { count } = await db.absence.deleteMany({ where: { id: absence.id, congregationId } })
  if (count === 0) return null
  if (absence.legacyEventId != null) {
    // Its day-off event only: legacyEventId has no foreign key, so it is never trusted to name a programme event.
    await db.event.deleteMany({
      where: { id: absence.legacyEventId, congregationId, template: { key: EventTemplateKey.DayOff } },
    })
  }

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
