import type { Prisma } from '~/database/generated/client'
import { MS_PER_DAY } from '~/shared/constants/limits'
import type { TransactionClient } from '~/shared/infra/db.server'
import { startOfNextDay } from '~/shared/utils/date.server'
import { buildAttributionCategoryWhere } from './attribution-category-where.server'
import { buildAttributionDateOverlapWhere } from './attribution-date-overlap.server'
import type { StatsFilterParams } from './stats-filter-params.type'

export interface AttributionStatsAggregate {
  attributionCount: number
  distinctTerritoryCount: number
  averageDurationDays: number
  overdueRate: number
}

function buildBaseWhere(params: StatsFilterParams, congregationId: number): Prisma.AttributionWhereInput {
  return {
    congregationId,
    ...(params.territoryKind.length > 0 ? { territory: { type: { in: params.territoryKind } } } : {}),
    ...buildAttributionCategoryWhere(params.attributionKind),
    ...buildAttributionDateOverlapWhere(params.startDate, params.endDate),
    ...(params.groupId != null ? { publisher: { publisherGroupId: params.groupId } } : {}),
  }
}

// Aggregates the four numbers the YoY card needs without loading full rows.
// Each `Attribution` here carries seven columns; pulling thousands of rows
// just to compute count/avg/overdueRate on the client side wastes bandwidth.
export async function aggregateAttributionStatsForWindow(
  db: TransactionClient,
  params: StatsFilterParams,
  congregationId: number,
): Promise<AttributionStatsAggregate> {
  const baseWhere = buildBaseWhere(params, congregationId)
  const windowEndExclusive = startOfNextDay(params.endDate)
  const lateDateInWindow = { gte: params.startDate, lt: windowEndExclusive }

  // 3 small parallel queries: counts + distinct ids + the slim "completed" set
  // used for average duration and the in-window overdue rate (#13).
  const [attributionCount, distinctTerritoryRows, completedRows] = await Promise.all([
    db.attribution.count({ where: baseWhere }),
    db.attribution.findMany({
      where: baseWhere,
      distinct: ['territoryId'],
      select: { territoryId: true },
    }),
    db.attribution.findMany({
      where: { ...baseWhere, endDate: { not: null }, lateDate: lateDateInWindow },
      select: { startDate: true, endDate: true, lateDate: true },
    }),
  ])

  const distinctTerritoryCount = distinctTerritoryRows.length

  let averageDurationDays = 0
  let overdueRate = 0
  if (completedRows.length > 0) {
    let durationSum = 0
    let overdueCount = 0
    for (const row of completedRows) {
      const endTime = row.endDate?.getTime()
      if (endTime == null) continue
      durationSum += (endTime - row.startDate.getTime()) / MS_PER_DAY
      if (endTime > row.lateDate.getTime()) overdueCount += 1
    }
    averageDurationDays = Math.round(durationSum / completedRows.length)
    overdueRate = (overdueCount / completedRows.length) * 100
  }

  return {
    attributionCount,
    distinctTerritoryCount,
    averageDurationDays,
    overdueRate,
  }
}
