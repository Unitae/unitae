import { EventKind } from '~/features/events/model/event-kind.type'
import { db } from '~/shared/libs/db.server'

export function getNextDaysOffs(userId: number) {
  return db.event.findMany({
    where: {
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

  const eventKind = await db.eventKind.findFirst({ where: { key: EventKind.Off } })

  return await db.event.create({
    data: {
      ...(eventKind ? { kind: { connect: { id: eventKind.id } } } : {}),
      startDate,
      endDate,
      createdBy: { connect: { id: userId } },
      name: 'Absence',
      congregation: { connect: { id: congregationId } },
    },
  })
}
