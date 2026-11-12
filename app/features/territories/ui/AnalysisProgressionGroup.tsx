import { ChartCard, ChartEmpty, ColumnChart, MetricStrip, StatTile } from '@unitae/ui'
import type { MonthlyCount } from '~/features/territories/server/compute-attributions-per-month.server'
import type { DurationStats } from '~/features/territories/server/compute-duration-stats.server'
import type { FoyersReached } from '~/features/territories/server/compute-foyers-reached.server'
import type { RankedTerritoriesResult } from '~/features/territories/server/compute-ranked-territories.server'
import { StatLabel } from '~/features/territories/ui/StatLabel'
import {
  currentMonthKey,
  formatFigure,
  formatNumber,
  formatPercent,
  formatPerTerritory,
  NO_FIGURE,
  statsViewLabels,
} from '~/features/territories/ui/stats-format'
import { TerritoryLink } from '~/features/territories/ui/TerritoryLink'
import * as m from '~/i18n/paraglide/messages'
import { formatMonthLabel, formatMonthLong } from '~/shared/utils/month-label'

interface AnalysisProgressionGroupProps {
  coverage: number
  totalCoverage: number
  ranked: RankedTerritoriesResult
  durationStats: DurationStats
  overdueRate: number | null
  availabilityGap: number | null
  restUtilization: number | null
  foyersReached: FoyersReached
  attributionsPerMonth: MonthlyCount[]
}

export default function AnalysisProgressionGroup({
  coverage,
  totalCoverage,
  ranked,
  durationStats,
  overdueRate,
  availabilityGap,
  restUtilization,
  foyersReached,
  attributionsPerMonth,
}: AnalysisProgressionGroupProps) {
  const months = attributionsPerMonth.map(d => ({
    key: d.month,
    label: formatMonthLabel(d.month),
    title: formatMonthLong(d.month),
    // A month still to come is a gap, not a month without attributions.
    value: d.count ?? ('future' as const),
  }))
  const current = months.findIndex(d => d.key === currentMonthKey())

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-semibold text-base">{m.stats_progression_heading()}</h3>
      <MetricStrip aria-label={m.stats_progression_heading()}>
        <StatTile
          label={<StatLabel label={m.stats_coverage()} help={m.stats_coverage_help()} />}
          value={formatPerTerritory(coverage)}
        />
        <StatTile
          label={<StatLabel label={m.stats_total_coverage()} help={m.stats_total_coverage_help()} />}
          value={formatPercent(totalCoverage)}
        />
        <StatTile
          label={<StatLabel label={m.stats_foyers_reached()} help={m.stats_foyers_reached_help()} />}
          value={formatNumber(foyersReached.count)}
          foot={
            foyersReached.percentage != null
              ? m.stats_foyers_reached_subtitle({ percentage: foyersReached.percentage })
              : undefined
          }
        />
        <StatTile
          label={<StatLabel label={m.stats_avg_duration()} help={m.stats_avg_duration_help()} />}
          value={formatFigure(durationStats.averageDays)}
          unit={durationStats.averageDays == null ? undefined : 'j'}
        />
        <StatTile
          label={<StatLabel label={m.stats_overdue_rate()} help={m.stats_overdue_rate_help()} />}
          value={formatFigure(overdueRate, formatPercent)}
        />
        <StatTile
          label={<StatLabel label={m.stats_availability_gap()} help={m.stats_availability_gap_help()} />}
          value={formatFigure(availabilityGap)}
          unit={availabilityGap == null ? undefined : 'j'}
        />
        <StatTile
          label={<StatLabel label={m.stats_rest_utilization()} help={m.stats_rest_utilization_help()} />}
          value={formatFigure(restUtilization)}
          unit={restUtilization == null ? undefined : 'j'}
        />
      </MetricStrip>
      <MetricStrip aria-label={m.stats_territory_rankings_title()} minTileWidth={220}>
        <StatTile
          label={<StatLabel label={m.stats_most_worked()} help={m.stats_most_worked_help()} />}
          value={ranked.most != null ? <TerritoryLink territory={ranked.most} /> : '–'}
          foot={ranked.most != null ? m.stats_times_count({ count: ranked.most.count }) : undefined}
        />
        <StatTile
          label={<StatLabel label={m.stats_least_worked()} help={m.stats_least_worked_help()} />}
          value={ranked.least != null ? <TerritoryLink territory={ranked.least} /> : '–'}
          foot={ranked.least != null ? m.stats_times_count({ count: ranked.least.count }) : undefined}
        />
        <StatTile
          label={<StatLabel label={m.stats_longest_shortest()} help={m.stats_longest_shortest_help()} />}
          value={
            durationStats.longestDays == null || durationStats.shortestDays == null
              ? NO_FIGURE
              : `${durationStats.longestDays} / ${durationStats.shortestDays}`
          }
          unit={durationStats.longestDays == null ? undefined : 'j'}
          foot={
            durationStats.longestTerritory != null || durationStats.shortestTerritory != null ? (
              <>
                {durationStats.longestTerritory != null ? (
                  <TerritoryLink territory={durationStats.longestTerritory} />
                ) : (
                  '–'
                )}
                <span className="mx-1">/</span>
                {durationStats.shortestTerritory != null ? (
                  <TerritoryLink territory={durationStats.shortestTerritory} />
                ) : (
                  '–'
                )}
              </>
            ) : undefined
          }
        />
      </MetricStrip>
      <ChartCard
        title={m.stats_attributions_per_month()}
        viewLabels={statsViewLabels()}
        table={
          months.length > 0
            ? {
                columns: [
                  { key: 'month', label: m.stats_table_month() },
                  { key: 'count', label: m.chart_attributions_label(), numeric: true },
                ],
                rows: months.map(d => ({ month: d.title, count: typeof d.value === 'number' ? d.value : NO_FIGURE })),
              }
            : undefined
        }
      >
        {months.length > 0 ? (
          <ColumnChart
            aria-label={m.stats_attributions_per_month()}
            data={months}
            highlight={current === -1 ? 'none' : current}
          />
        ) : (
          <ChartEmpty>{m.stats_no_active_attributions()}</ChartEmpty>
        )}
      </ChartCard>
    </div>
  )
}
