import type { Prisma } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function computeTerritoryCoverageTotal(
  db: TransactionClient,
  congregationId: number,
  territoryKind: TerritoryKind[] = [TerritoryKind.Classical],
  attributionKind: TerritoryAttributionKind[] = [TerritoryAttributionKind.Default],
  startDate?: Date,
  endDate?: Date,
) {
  // Filtre les attributions qui chevauchent la période [startDate, endDate]
  let whereDate: Prisma.AttributionWhereInput = {}
  if (startDate != null && endDate != null) {
    whereDate = {
      startDate: { lte: endDate },
      OR: [{ endDate: null }, { endDate: { gte: startDate } }],
    }
  } else if (startDate != null) {
    whereDate = { OR: [{ endDate: null }, { endDate: { gte: startDate } }] }
  } else if (endDate != null) {
    whereDate = { startDate: { lte: endDate } }
  }

  const kindWhere = territoryKind.length > 0 ? { type: { in: territoryKind } } : {}

  // Count total territories of the specified kind
  const total = await db.territory.count({
    where: {
      congregationId,
      ...kindWhere,
    },
  })

  const count = await db.territory.count({
    where: {
      congregationId,
      ...kindWhere,
      attributions: {
        some: {
          type: { in: attributionKind },
          ...whereDate,
        },
      },
    },
  })

  return total === 0 ? 0 : (count / total) * 100
}
