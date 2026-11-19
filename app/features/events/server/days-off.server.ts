import { EventStatus } from '~/features/events/model/event-status.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { refreshConflictFlags } from '~/features/events/server/refresh-conflict-flags.server'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export function getNextDaysOffs(db: TransactionClient, userId: number, congregationId: number) {
  return db.event.findMany({
    where: {
      congregationId,
      createdBy: { id: userId },
      template: {
        key: EventTemplateKey.DayOff,
      },
      OR: [{ startDate: { lte: new Date() }, endDate: { gte: new Date() } }, { endDate: { gte: new Date() } }],
    },
    orderBy: {
      startDate: 'asc',
    },
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

  // Day-offs are identified everywhere by `template.key = 'day-off'`. If the
  // system template is missing (mis-provisioned tenant), writing the event
  // with a null templateId would create a ghost row invisible to every
  // downstream query — including the /me/days-off delete guard. Fail loudly
  // so ops sees the incident instead of a silent success flash.
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
  // Written twice while the readers still read the event: the day-off event, and its Absence row (the person's record
  // when the account has one).
  await db.absence.create({
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
    entityType: 'Event',
    entityId: event.id,
  })
  return event
}

/**
 * Deletes one of the caller's own absences. Anything else answers null and stays: another person's
 * absence, and any event that is not an absence, such as a programme event the caller created.
 */
export async function deleteDayOff(
  db: TransactionClient,
  {
    eventId,
    accountId,
    memberId,
    congregationId,
  }: { eventId: number; accountId: number; memberId: number | null; congregationId: number },
) {
  const own = await db.event.findFirst({
    where: { id: eventId, congregationId, createdById: accountId, template: { key: EventTemplateKey.DayOff } },
    select: { id: true },
  })
  if (own == null) return null

  await db.absence.deleteMany({ where: { legacyEventId: eventId, congregationId } })
  const event = await db.event.delete({
    where: {
      id_congregationId: { id: eventId, congregationId },
    },
  })

  if (memberId != null) {
    await refreshConflictFlags(db, memberId, event.startDate, event.endDate, congregationId)
  }

  await auditInTransaction(db, {
    action: AuditAction.DayOffDeleted,
    congregationId,
    actorId: accountId,
    entityType: 'Event',
    entityId: event.id,
  })
  return event
}
