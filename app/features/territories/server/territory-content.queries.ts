import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { computeTerritoryQuantity } from '~/features/territories/server/compute-territory-quantity'
import type { TransactionClient } from '~/shared/infra/db.server'

export type TerritoryContent = {
  id: number
  number: string
  kind: TerritoryKindKey
  entranceCount: number
  quantity: number
  homes: number
  phones: number
  liberals: number
  /** Who has it out now, for those who may see the attributions; `null` otherwise or when it is in. */
  holder: { firstname: string | null; lastname: string | null; anonymized: boolean } | null
}

export async function getTerritoryContent(
  db: TransactionClient,
  territoryId: number,
  congregationId: number,
  { withHolder = false }: { withHolder?: boolean } = {},
): Promise<TerritoryContent | null> {
  const territory = await db.territory.findFirst({
    where: { id: territoryId, congregationId },
    include: {
      entrances: {
        where: { buildings: { some: { active: true } } },
        include: { buildings: { where: { active: true } } },
      },
    },
  })
  if (territory == null) return null
  const open = withHolder
    ? await db.attribution.findFirst({
        where: { territoryId, congregationId, endDate: null },
        orderBy: { startDate: 'desc' },
        select: { publisher: { select: { firstname: true, lastname: true, anonymizedAt: true } } },
      })
    : null

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
    holder: holderOf(open?.publisher),
  }
}

function holderOf(
  publisher: { firstname: string | null; lastname: string | null; anonymizedAt: Date | null } | undefined,
): TerritoryContent['holder'] {
  if (publisher == null) return null
  return { firstname: publisher.firstname, lastname: publisher.lastname, anonymized: publisher.anonymizedAt != null }
}
