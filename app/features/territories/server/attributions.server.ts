import type { TerritoryKindKey } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'

export function findActiveAttributionsForPublisher(db: TransactionClient, publisherId: number, congregationId: number) {
  return db.attribution.findMany({
    where: { publisherId, endDate: null, congregationId },
    include: { territory: true },
    orderBy: [{ startDate: 'asc' }],
  })
}

export function findTerritoryWithHistory(db: TransactionClient, territoryId: number, congregationId: number) {
  return db.territory.findUnique({
    where: {
      id_congregationId: { id: territoryId, congregationId },
    },
    include: {
      entrances: {
        where: { buildings: { some: { active: true } } },
        include: { buildings: { where: { active: true } } },
      },
      attributions: {
        include: { publisher: true },
        orderBy: [{ startDate: 'desc' }],
      },
    },
  })
}

export async function findAdjacentTerritories(
  db: TransactionClient,
  territoryNumber: string,
  territoryType: TerritoryKindKey,
  congregationId: number,
): Promise<{
  prev: { id: number; number: string } | null
  next: { id: number; number: string } | null
}> {
  const [prev, next] = await Promise.all([
    db.territory.findFirst({
      where: { congregationId, type: territoryType, number: { lt: territoryNumber } },
      orderBy: { number: 'desc' },
      select: { id: true, number: true },
    }),
    db.territory.findFirst({
      where: { congregationId, type: territoryType, number: { gt: territoryNumber } },
      orderBy: { number: 'asc' },
      select: { id: true, number: true },
    }),
  ])
  return { prev, next }
}
