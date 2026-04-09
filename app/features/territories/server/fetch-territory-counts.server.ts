import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { db } from '~/shared/libs/db.server'

export interface TerritoryCountByType {
  type: TerritoryKind
  count: number
}

export async function fetchTerritoryCounts(territoryKinds?: TerritoryKind[]): Promise<TerritoryCountByType[]> {
  const groups = await db.territory.groupBy({
    by: ['type'],
    _count: { id: true },
    ...(territoryKinds != null && territoryKinds.length > 0 ? { where: { type: { in: territoryKinds } } } : {}),
  })

  return groups.map(g => ({
    type: g.type as TerritoryKind,
    count: g._count.id,
  }))
}

export function getTotalTerritoryCount(counts: TerritoryCountByType[]): number {
  return counts.reduce((sum, c) => sum + c.count, 0)
}
