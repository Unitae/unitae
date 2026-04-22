import type { TransactionClient } from '~/shared/infra/db.server'

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

export type TerritoryStatus = 'on-time' | 'due-soon' | 'overdue'

export function computeStatus(lateDate: Date): TerritoryStatus {
  const now = new Date()
  if (lateDate < now) return 'overdue'
  if (lateDate.getTime() - now.getTime() <= TWO_WEEKS_MS) return 'due-soon'
  return 'on-time'
}

export async function getUserTerritoriesWithDetails(db: TransactionClient, userId: number) {
  const attributions = await db.attribution.findMany({
    where: {
      publisherId: userId,
      endDate: null,
    },
    select: {
      id: true,
      startDate: true,
      lateDate: true,
      type: true,
      territory: {
        select: {
          id: true,
          number: true,
          type: true,
          entrances: {
            select: {
              id: true,
              homes: true,
              phones: true,
              kind: true,
              shopKind: true,
            },
          },
        },
      },
    },
    orderBy: { lateDate: 'asc' },
  })

  return attributions.map(a => ({
    ...a,
    status: computeStatus(a.lateDate),
  }))
}

export async function getUserTerritoryDetail(db: TransactionClient, userId: number, territoryId: number) {
  const attribution = await db.attribution.findFirst({
    where: {
      publisherId: userId,
      endDate: null,
      territoryId,
    },
    select: {
      id: true,
      startDate: true,
      lateDate: true,
      type: true,
      territory: {
        select: {
          id: true,
          number: true,
          type: true,
          notes: true,
          entrances: {
            include: {
              accesses: { orderBy: { position: 'asc' } },
              buildings: { where: { active: true } },
            },
          },
        },
      },
    },
  })

  return attribution
}
