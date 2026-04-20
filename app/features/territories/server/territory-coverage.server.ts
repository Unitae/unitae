import type { Prisma } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export async function computeTerritoryCoverage(
  db: TransactionClient,
  congregationId: number,
  territoryKind: TerritoryKind[] = [TerritoryKind.Classical],
  attributionKind: TerritoryAttributionKind[] = [TerritoryAttributionKind.Default],
  startDate?: Date,
  endDate?: Date,
) {
  // Filtre les attributions qui chevauchent la période [startDate, endDate]
  // Une attribution chevauche si : elle commence avant la fin ET (elle est en cours OU se termine après le début)
  let whereDate: Prisma.AttributionWhereInput = {}
  if (startDate != null && endDate != null) {
    whereDate = {
      startDate: { lte: endDate },
      // biome-ignore lint/style/useNamingConvention: Prisma OR operator
      OR: [{ endDate: null }, { endDate: { gte: startDate } }],
    }
  } else if (startDate != null) {
    // biome-ignore lint/style/useNamingConvention: Prisma OR operator
    whereDate = { OR: [{ endDate: null }, { endDate: { gte: startDate } }] }
  } else if (endDate != null) {
    whereDate = { startDate: { lte: endDate } }
  }

  // Count total territories of the specified kind
  const total = await db.territory.count({
    where: {
      congregationId,
      type: { in: territoryKind },
    },
  })

  const count = await db.attribution.count({
    where: {
      congregationId,
      territory: {
        type: { in: territoryKind },
      },
      type: { in: attributionKind },
      ...whereDate,
    },
  })

  return total === 0 ? 0 : (count / total) * 100
}
