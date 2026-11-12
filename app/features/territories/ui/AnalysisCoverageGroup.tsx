import { BarList, ChartCard, ChartEmpty, LineChart } from '@unitae/ui'
import type { CoverageByType } from '~/features/territories/server/compute-coverage-by-territory-type.server'
import type { MonthlyCoverage } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import type { NeverWorkedResult } from '~/features/territories/server/territories-never-worked.server'
import { formatFigure, formatNumber, formatPercent, statsViewLabels } from '~/features/territories/ui/stats-format'
import TerritoriesNeverWorkedList from '~/features/territories/ui/TerritoriesNeverWorkedList'
import * as m from '~/i18n/paraglide/messages'
import { formatMonthLabel, formatMonthLong } from '~/shared/utils/month-label'

interface AnalysisCoverageGroupProps {
  monthlyCoverage: MonthlyCoverage[]
  coverageByType: CoverageByType[]
  neverWorked: NeverWorkedResult
}

export default function AnalysisCoverageGroup({
  monthlyCoverage,
  coverageByType,
  neverWorked,
}: AnalysisCoverageGroupProps) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-semibold text-base">{m.stats_coverage_over_time_heading()}</h3>
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
      <div className="grid items-start gap-4 md:grid-cols-2">
        {coverageByType.length > 0 && (
          <ChartCard title={m.stats_coverage_by_type_title()} subtitle={m.stats_coverage_by_type_subtitle()}>
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
        )}
        <ChartCard title={m.stats_never_worked_title()}>
          <TerritoriesNeverWorkedList territories={neverWorked.territories} isCapped={neverWorked.isCapped} />
        </ChartCard>
      </div>
    </div>
  )
}
