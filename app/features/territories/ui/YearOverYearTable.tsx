import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatDelta, formatNumber, formatPercent } from '~/features/territories/ui/stats-format'
import * as m from '~/i18n/paraglide/messages'

interface YearMetrics {
  coverage: number
  totalCoverage: number
  averageDurationDays: number
  overdueRate: number
  attributionCount: number
}

interface YearOverYearTableProps {
  current: YearMetrics
  previous: YearMetrics
  currentLabel: string
  previousLabel: string
}

interface MetricRow {
  label: string
  currentValue: string
  previousValue: string
  delta: number
  unit: string
  invertedBetter?: boolean // true si une baisse est positive (ex: taux de retard)
}

function formatSignedDelta(delta: number, unit: string): string {
  return `${formatDelta(delta)}${unit}`
}

export default function YearOverYearTable({ current, previous, currentLabel, previousLabel }: YearOverYearTableProps) {
  const rows: MetricRow[] = [
    {
      label: m.stats_yoy_coverage(),
      currentValue: formatPercent(current.coverage),
      previousValue: formatPercent(previous.coverage),
      delta: current.coverage - previous.coverage,
      unit: '\u202f%',
    },
    {
      label: m.stats_yoy_total_coverage(),
      currentValue: formatPercent(current.totalCoverage),
      previousValue: formatPercent(previous.totalCoverage),
      delta: current.totalCoverage - previous.totalCoverage,
      unit: '\u202f%',
    },
    {
      label: m.stats_yoy_avg_duration(),
      currentValue: `${formatNumber(current.averageDurationDays)}\u00a0j`,
      previousValue: `${formatNumber(previous.averageDurationDays)}\u00a0j`,
      delta: current.averageDurationDays - previous.averageDurationDays,
      unit: '\u00a0j',
    },
    {
      label: m.stats_yoy_overdue_rate(),
      currentValue: formatPercent(current.overdueRate),
      previousValue: formatPercent(previous.overdueRate),
      delta: current.overdueRate - previous.overdueRate,
      unit: '\u202f%',
      invertedBetter: true,
    },
    {
      label: m.stats_yoy_attribution_count(),
      currentValue: formatNumber(current.attributionCount),
      previousValue: formatNumber(previous.attributionCount),
      delta: current.attributionCount - previous.attributionCount,
      unit: '',
    },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-3 font-medium">{m.stats_yoy_indicator()}</th>
            <th className="pb-3 text-right font-medium">{currentLabel}</th>
            <th className="pb-3 text-right font-medium">{previousLabel}</th>
            <th className="pb-3 text-right font-medium">{m.stats_yoy_evolution()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const isPositive = row.invertedBetter ? row.delta < 0 : row.delta > 0
            const isNeutral = Math.abs(row.delta) < 0.1

            return (
              <tr key={row.label} className="border-b last:border-0">
                <td className="py-3 font-medium">{row.label}</td>
                <td className="py-3 text-right font-display font-semibold">{row.currentValue}</td>
                <td className="py-3 text-right text-muted-foreground">{row.previousValue}</td>
                <td className="py-3 text-right">
                  <span
                    className={`inline-flex items-center gap-1 ${
                      isNeutral ? 'text-muted-foreground' : isPositive ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {!isNeutral &&
                      (isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />)}
                    {formatSignedDelta(row.delta, row.unit)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
