import { Info } from 'lucide-react'
import { Cell, Pie, PieChart, Tooltip as RechartsTooltip } from 'recharts'
import { getGroups } from '~/features/publishers/index.server'
import { RESTING_PERIOD_DAYS } from '~/features/territories/model/resting-periods'
import { countActiveWorkingTerritories } from '~/features/territories/server/active-working-territories.server'
import { aggregateAttributionStatsForWindow } from '~/features/territories/server/aggregate-attribution-stats.server'
import { countAvailableTerritories } from '~/features/territories/server/available-territories.server'
import { computeAttributionsPerMonth } from '~/features/territories/server/compute-attributions-per-month.server'
import { computeAvailabilityGap } from '~/features/territories/server/compute-availability-gap.server'
import { computeCoverageByTerritoryType } from '~/features/territories/server/compute-coverage-by-territory-type.server'
import { computeDurationStats } from '~/features/territories/server/compute-duration-stats.server'
import { computeMonthlyCoverageEvolution } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import { computeOverdueRate } from '~/features/territories/server/compute-overdue-rate.server'
import { computeRankedTerritories } from '~/features/territories/server/compute-ranked-territories.server'
import { computeRestPeriodUtilization } from '~/features/territories/server/compute-rest-period-utilization.server'
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
import AttributionsPerMonthChart from '~/features/territories/ui/AttributionsPerMonthChart'
import MonthlyCoverageChart from '~/features/territories/ui/MonthlyCoverageChart'
import StatsFilters from '~/features/territories/ui/StatsFilters'
import TerritoriesNeverWorkedList from '~/features/territories/ui/TerritoriesNeverWorkedList'
import YearOverYearTable from '~/features/territories/ui/YearOverYearTable'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'
import type { Route } from './+types/index'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.stats_meta_title() }]
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.5rem',
  },
  labelStyle: { color: 'var(--color-card-foreground)' },
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
    ])

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
      attributionsByGroup,
      theocraticYear,
      groups,
    }
  })
}

const PIE_COLORS = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-4)', 'var(--color-chart-3)']

const GROUP_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
]

function StatLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
      {label}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-3.5 cursor-help text-muted-foreground/60" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            {help}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  )
}

export default function TerritoryStatsPage({ loaderData }: Route.ComponentProps) {
  const { stats, progression, coverageOverTime, yearOverYear, attributionsByGroup, theocraticYear, groups } = loaderData

  const pieData = [
    { name: m.stats_pie_available(), value: stats.available },
    { name: m.stats_pie_active(), value: stats.active },
    { name: m.stats_pie_delayed(), value: stats.delayed },
    { name: m.stats_pie_resting(), value: stats.resting },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.stats_title()}
        subtitle={m.stats_subtitle()}
        breadcrumbs={[{ label: m.sidebar_statistics() }]}
        actions={<S13ExportButton theocraticYear={theocraticYear} />}
      />

      {/* ═══ État global ═══ */}
      <h2 className="font-display font-semibold text-xl">{m.stats_global_heading()}</h2>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-7xl max-sm:text-5xl">{stats.total}</span>
              <StatLabel label={m.stats_total_territories()} help={m.stats_total_territories_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-7xl max-sm:text-5xl">{stats.available}</span>
              <StatLabel label={m.stats_available_territories()} help={m.stats_available_territories_help()} />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.working}</span>
              <StatLabel label={m.stats_working_territories()} help={m.stats_working_territories_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.delayed}</span>
              <StatLabel label={m.stats_delayed_territories()} help={m.stats_delayed_territories_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.resting}</span>
              <StatLabel
                label={m.stats_resting_territories()}
                help={m.stats_resting_territories_help({
                  doorDays: RESTING_PERIOD_DAYS.doorsToDoors,
                  otherDays: RESTING_PERIOD_DAYS.campaign,
                })}
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <PieChart width={300} height={300}>
                <Pie
                  data={pieData}
                  cx={150}
                  cy={150}
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip {...CHART_TOOLTIP_STYLE} />
              </PieChart>
              <StatLabel label={m.stats_pie_label()} help={m.stats_pie_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              {attributionsByGroup.length > 0 ? (
                <PieChart width={300} height={300}>
                  <Pie
                    data={attributionsByGroup.map(g => ({ name: g.groupName, value: g.count }))}
                    cx={150}
                    cy={150}
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {attributionsByGroup.map((g, index) => (
                      <Cell key={`group-${g.groupName}`} fill={GROUP_COLORS[index % GROUP_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip {...CHART_TOOLTIP_STYLE} />
                </PieChart>
              ) : (
                <span className="py-12 text-muted-foreground text-sm italic">{m.stats_no_active_attributions()}</span>
              )}
              <StatLabel label={m.stats_group_distribution_label()} help={m.stats_group_distribution_help()} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ Progression ═══ */}
      <h2 className="mt-3 font-display font-semibold text-xl">{m.stats_progression_heading()}</h2>
      <div className="flex flex-col gap-3">
        <div className="my-2">
          <StatsFilters groups={groups} theocraticYear={theocraticYear} />
        </div>
        <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-1 max-md:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.coverage.toFixed(2)} %</span>
              <StatLabel label={m.stats_coverage()} help={m.stats_coverage_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {stats.totalCoverage.toFixed(2)} %
              </span>
              <StatLabel label={m.stats_total_coverage()} help={m.stats_total_coverage_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.ranked.most != null ? `${progression.ranked.most.number}` : '-'}
              </span>
              {progression.ranked.most != null && (
                <span className="font-display text-lg text-muted-foreground">
                  {m.stats_times_count({ count: progression.ranked.most.count })}
                </span>
              )}
              <StatLabel label={m.stats_most_worked()} help={m.stats_most_worked_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.ranked.least != null ? `${progression.ranked.least.number}` : '-'}
              </span>
              {progression.ranked.least != null && (
                <span className="font-display text-lg text-muted-foreground">
                  {m.stats_times_count({ count: progression.ranked.least.count })}
                </span>
              )}
              <StatLabel label={m.stats_least_worked()} help={m.stats_least_worked_help()} />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.durationStats.averageDays} j
              </span>
              <StatLabel label={m.stats_avg_duration()} help={m.stats_avg_duration_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <div className="flex items-baseline gap-2">
                <span className="font-black font-display text-5xl max-sm:text-3xl">
                  {progression.durationStats.longestDays}
                </span>
                <span className="text-2xl text-muted-foreground">/</span>
                <span className="font-black font-display text-5xl max-sm:text-3xl">
                  {progression.durationStats.shortestDays}
                </span>
                <span className="font-display text-2xl">j</span>
              </div>
              <StatLabel label={m.stats_longest_shortest()} help={m.stats_longest_shortest_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">
                {progression.overdueRate.toFixed(1)} %
              </span>
              <StatLabel label={m.stats_overdue_rate()} help={m.stats_overdue_rate_help()} />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{progression.availabilityGap} j</span>
              <StatLabel label={m.stats_availability_gap()} help={m.stats_availability_gap_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{progression.restUtilization} j</span>
              <StatLabel label={m.stats_rest_utilization()} help={m.stats_rest_utilization_help()} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">{m.stats_attributions_per_month()}</CardTitle>
          </CardHeader>
          <CardContent>
            <AttributionsPerMonthChart data={progression.attributionsPerMonth} />
          </CardContent>
        </Card>
      </div>

      {/* ═══ Couverture dans le temps ═══ */}
      <h2 className="mt-3 font-display font-semibold text-xl">{m.stats_coverage_over_time_heading()}</h2>
      <div className="flex flex-col gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">{m.stats_monthly_coverage_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyCoverageChart data={coverageOverTime.monthlyCoverage} />
          </CardContent>
        </Card>
        {coverageOverTime.coverageByType.length > 0 && (
          <div
            className={`grid gap-3 max-sm:grid-cols-1 ${
              coverageOverTime.coverageByType.length <= 3
                ? `grid-cols-${coverageOverTime.coverageByType.length}`
                : 'grid-cols-3 max-md:grid-cols-2'
            }`}
          >
            {coverageOverTime.coverageByType.map(ct => (
              <Card key={ct.kind}>
                <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
                  <span className="font-black font-display text-4xl max-sm:text-2xl">
                    {ct.totalCoverage.toFixed(1)} %
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {m.stats_attributions_percentage({ percentage: ct.coverage.toFixed(1) })}
                  </span>
                  <StatLabel label={ct.label} help={m.stats_coverage_by_type_help({ label: ct.label })} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">{m.stats_never_worked_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            <TerritoriesNeverWorkedList
              territories={coverageOverTime.neverWorked.territories}
              isCapped={coverageOverTime.neverWorked.isCapped}
            />
          </CardContent>
        </Card>
      </div>

      {/* ═══ Comparaison annuelle ═══ */}
      <h2 className="mt-3 font-display font-semibold text-xl">{m.stats_year_comparison_heading()}</h2>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">
            {m.stats_year_comparison_title({
              current: `${theocraticYear}/${theocraticYear + 1}`,
              previous: `${theocraticYear - 1}/${theocraticYear}`,
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <YearOverYearTable
            current={yearOverYear.current}
            previous={yearOverYear.previous}
            currentLabel={`${theocraticYear}/${theocraticYear + 1}`}
            previousLabel={`${theocraticYear - 1}/${theocraticYear}`}
          />
        </CardContent>
      </Card>
    </div>
  )
}
