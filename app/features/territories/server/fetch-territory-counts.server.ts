import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { TerritoryCountByType } from './territory-count-by-type.type'

export type { TerritoryCountByType } from './territory-count-by-type.type'
export { getTotalTerritoryCount } from './territory-count-by-type.type'

export async function fetchTerritoryCounts(
  db: TransactionClient,
  congregationId: number,
  territoryKinds?: TerritoryKindKey[],
): Promise<TerritoryCountByType[]> {
  const groups = await db.territory.groupBy({
    by: ['type'],
    _count: { id: true },
    where: {
      congregationId,
      ...(territoryKinds != null && territoryKinds.length > 0 ? { type: { in: territoryKinds } } : {}),
    },
  })

  return groups.map(g => ({
    type: g.type,
    count: g._count.id,
  }))
}

// Counts territories that existed at or before `cutoff`. Used as the
// YoY denominator for the previous theocratic year — counting the
// territories that already existed by that year's end avoids inflating
// the denominator with territories created after.
export async function countTerritoriesExistingBefore(
  db: TransactionClient,
  congregationId: number,
  cutoff: Date,
  territoryKinds?: TerritoryKindKey[],
): Promise<number> {
  return db.territory.count({
    where: {
      congregationId,
      createdAt: { lte: cutoff },
      ...(territoryKinds != null && territoryKinds.length > 0 ? { type: { in: territoryKinds } } : {}),
    },
  })
}
