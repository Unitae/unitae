import { EventKind } from '~/features/events/model/event-kind.type'
import { refreshConflictFlags } from '~/features/events/server/programme-assignments.server'
import * as m from '~/i18n/paraglide/messages'
import type { TransactionClient } from '~/shared/infra/db.server'

export function getNextDaysOffs(db: TransactionClient, userId: number, congregationId: number) {
  return db.event.findMany({
    where: {
      congregationId,
      createdBy: { id: userId },
      kind: {
        key: EventKind.Off,
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

  const eventKind = await db.eventKind.findFirst({ where: { key: EventKind.Off, congregationId } })

  const event = await db.event.create({
    data: {
      ...(eventKind ? { kind: { connect: { id: eventKind.id } } } : {}),
      startDate,
      endDate,
      createdBy: { connect: { id: accountId } },
      name: m.seed_event_kind_absence(),
      congregation: { connect: { id: congregationId } },
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
