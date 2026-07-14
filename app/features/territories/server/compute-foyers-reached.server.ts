import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface FoyersReached {
  count: number
  percentage: number | null
}

export async function computeFoyersReached(
  db: TransactionClient,
  congregationId: number,
  territoryIds: number[],
  totalHomes: number,
): Promise<FoyersReached> {
  if (territoryIds.length === 0) {
    return { count: 0, percentage: null }
  }

  const aggregate = await db.buildingEntrance.aggregate({
    where: {
      congregationId,
      kind: EntranceKind.Residential,
      territories: { some: { id: { in: territoryIds } } },
    },
    _sum: { homes: true },
  })

  const count = aggregate._sum.homes ?? 0
  const percentage = totalHomes > 0 ? Math.round((count / totalHomes) * 100) : null

  return { count, percentage }
}
