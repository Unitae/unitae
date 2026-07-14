import { getGroups } from '~/features/publishers/index.server'
import { countActiveWorkingTerritories } from '~/features/territories/server/active-working-territories.server'
import { aggregateAttributionStatsForWindow } from '~/features/territories/server/aggregate-attribution-stats.server'
import { countAvailableTerritories } from '~/features/territories/server/available-territories.server'
import { computeAttributionsPerMonth } from '~/features/territories/server/compute-attributions-per-month.server'
import { computeAvailabilityGap } from '~/features/territories/server/compute-availability-gap.server'
import { computeCoverageByTerritoryType } from '~/features/territories/server/compute-coverage-by-territory-type.server'
import { computeDurationStats } from '~/features/territories/server/compute-duration-stats.server'
import { computeFoyersReached } from '~/features/territories/server/compute-foyers-reached.server'
import { computeMonthlyCoverageEvolution } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import { computeOverdueRate } from '~/features/territories/server/compute-overdue-rate.server'
import { computeRankedTerritories } from '~/features/territories/server/compute-ranked-territories.server'
import { computeRestPeriodUtilization } from '~/features/territories/server/compute-rest-period-utilization.server'
import { computeShopKindDistribution } from '~/features/territories/server/compute-shopkind-distribution.server'
import { computeTerrainStats } from '~/features/territories/server/compute-terrain-stats.server'
import { countBuildingsMissingDemographics } from '~/features/territories/server/count-buildings-missing-demographics.server'
import { countDelayedWorkingTerritories } from '~/features/territories/server/delayed-working-territories.server'
import { fetchActiveAttributionsByGroup } from '~/features/territories/server/fetch-attributions-by-group.server'
import { fetchAttributionsForStats } from '~/features/territories/server/fetch-attributions-for-stats.server'
import {
  countTerritoriesExistingBefore,
  fetchTerritoryCounts,
  getTotalTerritoryCount,
} from '~/features/territories/server/fetch-territory-counts.server'
import { parseStatsFilterParams } from '~/features/territories/server/parse-stats-filter-params.server'
import { countRestingTerritories } from '~/features/territories/server/resting-territories.server'
import { getTerritoriesNeverWorked } from '~/features/territories/server/territories-never-worked.server'
import { computeTerritoryCoverage } from '~/features/territories/server/territory-coverage.server'
import { computeTerritoryCoverageTotal } from '~/features/territories/server/territory-coverage-total.server'
import {
  getBeginingDateOfTheocraticYear,
  getCurrentTheocraticYear,
  getEndDateOfTheocraticYear,
} from '~/features/territories/server/theocratic-year.server'
import AnalysisSection from '~/features/territories/ui/AnalysisSection'
import SnapshotOverviewSection from '~/features/territories/ui/SnapshotOverviewSection'
import TerrainSection from '~/features/territories/ui/TerrainSection'
import YearComparisonSection from '~/features/territories/ui/YearComparisonSection'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.stats_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesManager)

  const congregation = context.get(congregationContext)
  const congregationId = congregation.id

  return withScopeFromContext(context, async db => {
    const url = new URL(request.url)
    const params = url.searchParams

    const theocraticYear = getCurrentTheocraticYear()
    const filterParams = parseStatsFilterParams(params, theocraticYear)

    // YoY card is pinned to current vs previous theocratic year — only the dates
    // are overridden; kinds/group are inherited so drilling into a group still
    // produces a meaningful year-over-year for that group.
    const yoyCurrentParams = {
      ...filterParams,
      startDate: getBeginingDateOfTheocraticYear(theocraticYear),
      endDate: getEndDateOfTheocraticYear(theocraticYear),
    }
    const yoyPreviousParams = {
      ...filterParams,
      startDate: getBeginingDateOfTheocraticYear(theocraticYear - 1),
      endDate: getEndDateOfTheocraticYear(theocraticYear - 1),
    }
    // By-type breakdown shows every kind regardless of the user's filter.
    const allKindsParams = { ...filterParams, territoryKind: [] }

    const [
      activeWorkingTerritoriesCount,
      delayedWorkingTerritoriesCount,
      restingTerritoriesCount,
      availableTerritoriesCount,
      percentageCovered,
      percentageTotallyCovered,
      filteredAttributions,
      allKindsAttributions,
      yoyCurrentAggregate,
      yoyPreviousAggregate,
      allTerritoryCounts,
      previousYearTerritoryCount,
      neverWorked,
      attributionsByGroup,
      groups,
      terrainStats,
      shopKindDistribution,
      buildingsMissingDemographicsCount,
    ] = await Promise.all([
      countActiveWorkingTerritories(db, congregationId),
      countDelayedWorkingTerritories(db, congregationId),
      countRestingTerritories(db, congregationId),
      countAvailableTerritories(db, congregationId),
      computeTerritoryCoverage(
        db,
        congregationId,
        filterParams.territoryKind,
        filterParams.attributionKind,
        filterParams.startDate,
        filterParams.endDate,
        filterParams.groupId,
      ),
      computeTerritoryCoverageTotal(
        db,
        congregationId,
        filterParams.territoryKind,
        filterParams.attributionKind,
        filterParams.startDate,
        filterParams.endDate,
        filterParams.groupId,
      ),
      fetchAttributionsForStats(db, filterParams, congregationId),
      fetchAttributionsForStats(db, allKindsParams, congregationId),
      aggregateAttributionStatsForWindow(db, yoyCurrentParams, congregationId),
      aggregateAttributionStatsForWindow(db, yoyPreviousParams, congregationId),
      fetchTerritoryCounts(db, congregationId),
      countTerritoriesExistingBefore(db, congregationId, yoyPreviousParams.endDate, filterParams.territoryKind),
      getTerritoriesNeverWorked(db, filterParams, congregationId),
      fetchActiveAttributionsByGroup(db, congregationId),
      getGroups(db, congregationId),
      computeTerrainStats(db, congregationId),
      computeShopKindDistribution(db, congregationId, m.stats_terrain_commerce_distribution_other()),
      countBuildingsMissingDemographics(db, congregationId),
    ])

    const reachedTerritoryIds = Array.from(new Set(filteredAttributions.map(a => a.territoryId)))
    const foyersReached = await computeFoyersReached(db, congregationId, reachedTerritoryIds, terrainStats.homesCount)

    // Filtered counts derived in JS to avoid a second SQL groupBy (R10).
    const territoryCounts =
      filterParams.territoryKind.length > 0
        ? allTerritoryCounts.filter(c => filterParams.territoryKind.includes(c.type))
        : allTerritoryCounts

    const workingTerritoriesCount = activeWorkingTerritoriesCount + delayedWorkingTerritoriesCount
    const unavailableTerritoriesCount = restingTerritoriesCount + workingTerritoriesCount
    const territoriesCount = unavailableTerritoriesCount + availableTerritoriesCount

    // Cards driven by the user's filter
    const ranked = computeRankedTerritories(filteredAttributions)
    const durationStats = computeDurationStats(filteredAttributions)
    const overdueRate = computeOverdueRate(filteredAttributions, filterParams.startDate, filterParams.endDate)
    const availabilityGap = computeAvailabilityGap(filteredAttributions)
    const attributionsPerMonth = computeAttributionsPerMonth(
      filteredAttributions,
      filterParams.startDate,
      filterParams.endDate,
    )
    const monthlyCoverage = computeMonthlyCoverageEvolution(
      filteredAttributions,
      territoryCounts,
      filterParams.startDate,
      filterParams.endDate,
    )
    const restUtilization = computeRestPeriodUtilization(filteredAttributions)

    // By-type breakdown — always all kinds, regardless of filter.
    const coverageByType = computeCoverageByTerritoryType(allKindsAttributions, allTerritoryCounts)

    // YoY card — denominators differ between current (snapshot now) and previous
    // (territories that already existed at the end of the previous theocratic year).
    const currentYearTerritoryCount = getTotalTerritoryCount(territoryCounts)
    const yoyCurrentCoverage =
      currentYearTerritoryCount > 0 ? (yoyCurrentAggregate.attributionCount / currentYearTerritoryCount) * 100 : 0
    const yoyCurrentTotalCoverage =
      currentYearTerritoryCount > 0 ? (yoyCurrentAggregate.distinctTerritoryCount / currentYearTerritoryCount) * 100 : 0
    const yoyPreviousCoverage =
      previousYearTerritoryCount > 0 ? (yoyPreviousAggregate.attributionCount / previousYearTerritoryCount) * 100 : 0
    const yoyPreviousTotalCoverage =
      previousYearTerritoryCount > 0
        ? (yoyPreviousAggregate.distinctTerritoryCount / previousYearTerritoryCount) * 100
        : 0

    return {
      stats: {
        total: territoriesCount,
        available: availableTerritoriesCount,
        unavailable: unavailableTerritoriesCount,
        resting: restingTerritoriesCount,
        working: workingTerritoriesCount,
        active: activeWorkingTerritoriesCount,
        delayed: delayedWorkingTerritoriesCount,
        coverage: percentageCovered,
        totalCoverage: percentageTotallyCovered,
      },
      progression: {
        ranked,
        durationStats,
        overdueRate,
        availabilityGap,
        attributionsPerMonth,
        restUtilization,
        foyersReached,
      },
      coverageOverTime: {
        monthlyCoverage,
        coverageByType,
        neverWorked,
      },
      yearOverYear: {
        current: {
          coverage: yoyCurrentCoverage,
          totalCoverage: yoyCurrentTotalCoverage,
          averageDurationDays: yoyCurrentAggregate.averageDurationDays,
          overdueRate: yoyCurrentAggregate.overdueRate,
          attributionCount: yoyCurrentAggregate.attributionCount,
        },
        previous: {
          coverage: yoyPreviousCoverage,
          totalCoverage: yoyPreviousTotalCoverage,
          averageDurationDays: yoyPreviousAggregate.averageDurationDays,
          overdueRate: yoyPreviousAggregate.overdueRate,
          attributionCount: yoyPreviousAggregate.attributionCount,
        },
      },
      terrain: {
        stats: terrainStats,
        shopKindDistribution,
        buildingsMissingDemographicsCount,
      },
      attributionsByGroup,
      theocraticYear,
      groups,
    }
  })
}

export default function TerritoryStatsPage({ loaderData }: Route.ComponentProps) {
  const { stats, progression, coverageOverTime, yearOverYear, attributionsByGroup, theocraticYear, groups, terrain } =
    loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.stats_title()}
        subtitle={m.stats_subtitle()}
        breadcrumbs={[{ label: m.sidebar_statistics() }]}
        actions={<S13ExportButton theocraticYear={theocraticYear} />}
      />
      <SnapshotOverviewSection stats={stats} attributionsByGroup={attributionsByGroup} />
      <TerrainSection
        stats={terrain.stats}
        shopKindDistribution={terrain.shopKindDistribution}
        buildingsMissingDemographicsCount={terrain.buildingsMissingDemographicsCount}
      />
      <AnalysisSection
        coverage={stats.coverage}
        totalCoverage={stats.totalCoverage}
        progression={progression}
        coverageOverTime={coverageOverTime}
        groups={groups}
        theocraticYear={theocraticYear}
      />
      <YearComparisonSection yearOverYear={yearOverYear} theocraticYear={theocraticYear} />
    </div>
  )
}
