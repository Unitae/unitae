import { ChartCard, ChartEmpty, ColumnChart, MetricStrip, StatTile } from '@unitae/ui'
import type { MonthlyCount } from '~/features/territories/server/compute-attributions-per-month.server'
import type { DurationStats } from '~/features/territories/server/compute-duration-stats.server'
import type { FoyersReached } from '~/features/territories/server/compute-foyers-reached.server'
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
import * as m from '~/i18n/paraglide/messages'
import { formatMonthLabel, formatMonthLong } from '~/shared/utils/month-label'

interface AnalysisTilesProps {
  coverage: number
  totalCoverage: number
  durationStats: DurationStats
  overdueRate: number | null
  availabilityGap: number | null
  restUtilization: number | null
  foyersReached: FoyersReached
}

/** The period's six figures, in one strip above its charts. */
export function AnalysisTiles({
  coverage,
  totalCoverage,
  durationStats,
  overdueRate,
  availabilityGap,
  restUtilization,
  foyersReached,
}: AnalysisTilesProps) {
  return (
    <MetricStrip aria-label={m.stats_progression_heading()} minTileWidth={150}>
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
        foot={m.stats_rest_utilization_foot({ days: restUtilization == null ? NO_FIGURE : `${restUtilization} j` })}
      />
    </MetricStrip>
  )
}

/** How many attributions went out each month of the period, this month emphasised and the months to come as gaps. */
export function AttributionsPerMonthCard({ attributionsPerMonth }: { attributionsPerMonth: MonthlyCount[] }) {
  const months = attributionsPerMonth.map(d => ({
    key: d.month,
    label: formatMonthLabel(d.month),
    title: formatMonthLong(d.month),
    // A month still to come is a gap, not a month without attributions.
    value: d.count ?? ('future' as const),
  }))
  const current = months.findIndex(d => d.key === currentMonthKey())

  return (
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
  )
}
