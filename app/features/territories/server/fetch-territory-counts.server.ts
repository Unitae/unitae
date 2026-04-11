import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/libs/db.server'
import type { TerritoryCountByType } from './territory-count-by-type.type'

export type { TerritoryCountByType } from './territory-count-by-type.type'
export { getTotalTerritoryCount } from './territory-count-by-type.type'

export async function fetchTerritoryCounts(
  db: TransactionClient,
  congregationId: number,
  territoryKinds?: TerritoryKind[],
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
    type: g.type as TerritoryKind,
    count: g._count.id,
  }))
}
