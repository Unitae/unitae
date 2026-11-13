import { BarList, ChartCard, ChartEmpty, LineChart } from '@unitae/ui'
import type { CoverageByType } from '~/features/territories/server/compute-coverage-by-territory-type.server'
import type { DurationStats } from '~/features/territories/server/compute-duration-stats.server'
import type { MonthlyCoverage } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import type { RankedTerritoriesResult } from '~/features/territories/server/compute-ranked-territories.server'
import type { NeverWorkedResult } from '~/features/territories/server/territories-never-worked.server'
import {
  formatFigure,
  formatNumber,
  formatPercent,
  NO_FIGURE,
  statsViewLabels,
} from '~/features/territories/ui/stats-format'
import TerritoriesNeverWorkedList from '~/features/territories/ui/TerritoriesNeverWorkedList'
import { TerritoryLink } from '~/features/territories/ui/TerritoryLink'
import * as m from '~/i18n/paraglide/messages'
import { formatMonthLabel, formatMonthLong } from '~/shared/utils/month-label'

/** The share of the file worked since the period began, month by month. */
export function MonthlyCoverageCard({ monthlyCoverage }: { monthlyCoverage: MonthlyCoverage[] }) {
  return (
    <ChartCard
      title={m.stats_monthly_coverage_title()}
      viewLabels={statsViewLabels()}
      table={
        monthlyCoverage.length > 0
          ? {
              columns: [
                { key: 'month', label: m.stats_table_month() },
                { key: 'coverage', label: m.chart_coverage_label(), numeric: true },
              ],
              rows: monthlyCoverage.map(d => ({
                month: formatMonthLong(d.month),
                coverage: formatFigure(d.coverage, formatPercent),
              })),
            }
          : undefined
      }
    >
      {monthlyCoverage.length > 0 ? (
        <LineChart
          aria-label={m.stats_monthly_coverage_title()}
          xKey="month"
          data={monthlyCoverage.map(d => ({ month: d.month, coverage: d.coverage }))}
          series={[{ key: 'coverage', label: m.chart_coverage_label(), area: true }]}
          formatValue={value => formatPercent(value)}
          formatX={formatMonthLabel}
        />
      ) : (
        <ChartEmpty>{m.stats_no_active_attributions()}</ChartEmpty>
      )}
    </ChartCard>
  )
}

/** Each kind of territory worked, whatever the filter: the share covered, and its attributions per territory. */
export function CoverageByTypeCard({ coverageByType }: { coverageByType: CoverageByType[] }) {
  if (coverageByType.length === 0) return null
  return (
    <ChartCard
      title={m.stats_coverage_by_type_title()}
      subtitle={m.stats_coverage_by_type_subtitle()}
      viewLabels={statsViewLabels()}
      table={{
        columns: [
          { key: 'kind', label: m.stats_filter_territory_type() },
          { key: 'total', label: m.stats_total_coverage(), numeric: true },
          { key: 'coverage', label: m.stats_coverage(), numeric: true },
        ],
        rows: coverageByType.map(ct => ({
          kind: ct.label,
          total: formatPercent(ct.totalCoverage),
          coverage: m.stats_attributions_percentage({ percentage: formatNumber(ct.coverage, 1) }),
        })),
      }}
    >
      <BarList
        aria-label={m.stats_coverage_by_type_title()}
        max={100}
        items={coverageByType.map(ct => ({
          key: ct.kind,
          label: ct.label,
          value: Math.min(ct.totalCoverage, 100),
          display: (
            <>
              <span className="font-medium text-foreground">{formatPercent(ct.totalCoverage)}</span>{' '}
              <span className="text-faint text-xs">
                {m.stats_attributions_percentage({ percentage: formatNumber(ct.coverage, 1) })}
              </span>
            </>
          ),
        }))}
      />
    </ChartCard>
  )
}

/** The territories nobody worked in the period, then the most and least worked and the longest and shortest stays. */
export function NeverWorkedCard({
  neverWorked,
  ranked,
  durationStats,
}: {
  neverWorked: NeverWorkedResult
  ranked: RankedTerritoriesResult
  durationStats: DurationStats
}) {
  const stays =
    durationStats.longestDays == null || durationStats.shortestDays == null ? null : (
      <>
        {durationStats.longestDays} j{' '}
        {durationStats.longestTerritory && <Ranked territory={durationStats.longestTerritory} />}
        {' · '}
        {durationStats.shortestDays} j{' '}
        {durationStats.shortestTerritory && <Ranked territory={durationStats.shortestTerritory} />}
      </>
    )
  return (
    <ChartCard title={m.stats_never_worked_title()}>
      <div className="flex flex-col gap-4">
        <TerritoriesNeverWorkedList territories={neverWorked.territories} isCapped={neverWorked.isCapped} />
        <dl className="m-0 flex flex-col border-border border-t text-sm">
          <RankRow label={m.stats_most_worked()}>
            {ranked.most == null ? (
              NO_FIGURE
            ) : (
              <>
                <TerritoryLink territory={ranked.most} className="tabular-nums" />{' '}
                <span className="text-faint">{m.stats_times_count({ count: ranked.most.count })}</span>
              </>
            )}
          </RankRow>
          <RankRow label={m.stats_least_worked()}>
            {ranked.least == null ? (
              NO_FIGURE
            ) : (
              <>
                <TerritoryLink territory={ranked.least} className="tabular-nums" />{' '}
                <span className="text-faint">{m.stats_times_count({ count: ranked.least.count })}</span>
              </>
            )}
          </RankRow>
          <RankRow label={m.stats_longest_shortest()}>{stays ?? NO_FIGURE}</RankRow>
        </dl>
      </div>
    </ChartCard>
  )
}

function RankRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-border border-b py-2 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 text-right tabular-nums">{children}</dd>
    </div>
  )
}

/** « (31) » after a number of days: the territory it belongs to. */
function Ranked({ territory }: { territory: { id: number; number: string } }) {
  return (
    <span className="text-faint">
      (<TerritoryLink territory={territory} />)
    </span>
  )
}
