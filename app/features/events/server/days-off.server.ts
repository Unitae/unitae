import { EventKind } from '~/features/events/model/event-kind.type'
import { refreshConflictFlags } from '~/features/events/server/programme-assignments.server'
import * as m from '~/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export function getNextDaysOffs(db: TransactionClient, userId: number, congregationId: number) {
  return db.event.findMany({
    where: {
      congregationId,
      createdBy: { id: userId },
      kind: {
        key: EventKind.Off,
      },
      // biome-ignore lint/style/useNamingConvention: prisma syntax
      OR: [{ startDate: { lte: new Date() }, endDate: { gte: new Date() } }, { endDate: { gte: new Date() } }],
    },
    orderBy: {
      startDate: 'asc',
    },
  })
}

export async function createDayOff(
  db: TransactionClient,
  userId: number,
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
      createdBy: { connect: { id: userId } },
      name: m.seed_event_kind_absence(),
      congregation: { connect: { id: congregationId } },
    },
  })

  // Update conflict flags on programme assignments overlapping this new day-off
  await refreshConflictFlags(db, userId, startDate, endDate, congregationId)

  audit({
    action: AuditAction.DayOffCreated,
    congregationId,
    actorId: userId,
    entityType: 'Event',
    entityId: event.id,
    metadata: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
  })

  return event
}

export async function deleteDayOff(db: TransactionClient, eventId: number, userId: number, congregationId: number) {
  const event = await db.event.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: eventId, congregationId },
    },
  })

  // Refresh conflict flags — the absence is gone, so conflicts may be resolved
  await refreshConflictFlags(db, userId, event.startDate, event.endDate, congregationId)

  audit({
    action: AuditAction.DayOffDeleted,
    congregationId,
    actorId: userId,
    entityType: 'Event',
    entityId: eventId,
  })

  return event
}
