import type { Prisma } from '~/database/generated/client'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { ScopedDb } from '~/shared/libs/db.server'
import type { StatsAttribution } from './stats-attribution.type'
import type { StatsFilterParams } from './stats-filter-params.type'

function buildDateOverlapWhere(startDate: Date, endDate: Date): Prisma.AttributionWhereInput {
  return {
    startDate: { lte: endDate },
    // biome-ignore lint/style/useNamingConvention: Prisma OR operator
    OR: [{ endDate: null }, { endDate: { gte: startDate } }],
  }
}

export async function fetchAttributionsForStats(db: ScopedDb, params: StatsFilterParams): Promise<StatsAttribution[]> {
  const attributions = await db.attribution.findMany({
    where: {
      territory: {
        type: { in: params.territoryKind },
      },
      type: { in: params.attributionKind },
      ...buildDateOverlapWhere(params.startDate, params.endDate),
      ...(params.groupId != null ? { publisher: { publisherGroupId: params.groupId } } : {}),
    },
    select: {
      id: true,
      territoryId: true,
      territory: {
        select: {
          number: true,
          type: true,
        },
      },
      type: true,
      startDate: true,
      endDate: true,
      lateDate: true,
    },
    orderBy: [{ territoryId: 'asc' }, { startDate: 'asc' }],
  })

  return attributions.map(a => ({
    id: a.id,
    territoryId: a.territoryId,
    territoryNumber: a.territory.number,
    territoryType: a.territory.type as TerritoryKind,
    type: a.type as StatsAttribution['type'],
    startDate: a.startDate,
    endDate: a.endDate,
    lateDate: a.lateDate,
  }))
}
