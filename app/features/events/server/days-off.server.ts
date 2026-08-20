import { EventStatus } from '~/features/events/model/event-status.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { refreshConflictFlags } from '~/features/events/server/refresh-conflict-flags.server'
import * as m from '~/i18n/paraglide/messages'
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

// `accountId` writes Event.createdBy. `memberId` (nullable — admin / circuit
// overseer accounts with no linked member) is what refreshConflictFlags needs
// to reconcile assignments; when it's null there can be no assignments to
// conflict, so we skip the refresh entirely.
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

  if (memberId != null) {
    await refreshConflictFlags(db, memberId, startDate, endDate, congregationId)
  }

  return event
}

export async function deleteDayOff(
  db: TransactionClient,
  eventId: number,
  memberId: number | null,
  congregationId: number,
) {
  const event = await db.event.delete({
    where: {
      id_congregationId: { id: eventId, congregationId },
    },
  })

  if (memberId != null) {
    await refreshConflictFlags(db, memberId, event.startDate, event.endDate, congregationId)
  }

  return event
}
