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
