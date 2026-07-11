import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { computeTerritoryQuantity } from '~/features/territories/server/compute-territory-quantity'
import type { TransactionClient } from '~/shared/infra/db.server'

export type TerritoryContent = {
  id: number
  number: string
  kind: TerritoryKind
  entranceCount: number
  quantity: number
  homes: number
  phones: number
  liberals: number
}

export async function getTerritoryContent(
  db: TransactionClient,
  territoryId: number,
): Promise<TerritoryContent | null> {
  const territory = await db.territory.findFirst({
    where: { id: territoryId },
    include: {
      entrances: {
        where: { buildings: { some: { active: true } } },
        include: { buildings: { where: { active: true } } },
      },
    },
  })
  if (territory == null) return null

  const aggregated = territory.entrances.map(aggregateEntrance)
  const homes = aggregated.reduce((sum, entrance) => sum + entrance.homes, 0)
  const phones = aggregated.reduce((sum, entrance) => sum + entrance.phones, 0)
  const liberals = aggregated.reduce((sum, entrance) => sum + entrance.liberals, 0)

  return {
    id: territory.id,
    number: territory.number,
    kind: territory.type,
    entranceCount: aggregated.length,
    quantity: computeTerritoryQuantity(territory.type, aggregated),
    homes,
    phones,
    liberals,
  }
}
