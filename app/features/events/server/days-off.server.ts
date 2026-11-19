import { EventStatus } from '~/features/events/model/event-status.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { absencesOf } from '~/features/events/server/absences.queries'
import { refreshConflictFlags } from '~/features/events/server/refresh-conflict-flags.server'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('days-off')

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

  // The day-off template is what keeps the event out of the programme: programme readers leave out events by
  // `template.key = 'day-off'`. Once the day-off events and their template are dropped, the absence is written alone —
  // never an event without the template, which would show as an empty meeting.
  const dayOffTemplate = await db.eventTemplate.findFirst({
    where: { key: EventTemplateKey.DayOff, congregationId },
  })
  // Until the events are dropped, a congregation without the template was set up wrong: said, but not refused.
  if (dayOffTemplate == null) logger.warn('No day-off template: absence written without its event', { congregationId })
  const event =
    dayOffTemplate == null
      ? null
      : await db.event.create({
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
  // Written twice until the events are dropped: the lists, the feed, the conflict checks and the archive read the
  // Absence row (the person's record when the account has one). Deleting an absence takes its event; deleting the
  // account drops its day-off events and lets go of its rows (releaseAccountEvents).
  const absence = await db.absence.create({
    data: { startDate, endDate, memberId, accountId, legacyEventId: event?.id ?? null, congregationId },
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
  // The row the absence is deleted by, and its day-off event while there are any.
  return { absenceId: absence.id, eventId: event?.id ?? null }
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
