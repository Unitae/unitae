import type { Prisma } from '~/database/generated/client'
import { db } from '~/shared/libs/db.server'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

export async function computeTerritoryCoverage(
  territoryKind: TerritoryKind[] = [TerritoryKind.Classical],
  attributionKind: TerritoryAttributionKind[] = [TerritoryAttributionKind.Default],
  startDate?: Date,
  endDate?: Date,
) {
  let whereDate: Prisma.AttributionWhereInput = {}
  if (startDate != null) {
    whereDate = { ...whereDate, startDate: { gte: startDate }, endDate: null }
  }
  if (endDate != null) {
    whereDate = { ...whereDate, endDate: { lte: endDate } }
  }

  // Count total territories of the specified kind
  const total = await db.territory.count({
    where: {
      type: { in: territoryKind },
    },
  })

  const count = await db.attribution.count({
    where: {
      territory: {
        type: { in: territoryKind },
      },
      type: { in: attributionKind },
      ...whereDate,
    },
  })

  return total === 0 ? 0 : (count / total) * 100
}
