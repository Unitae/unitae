import { TrendingDown, TrendingUp } from 'lucide-react'
import {
  formatDelta,
  formatFigure,
  formatNumber,
  formatPercent,
  formatPerTerritory,
  NO_FIGURE,
} from '~/features/territories/ui/stats-format'
import * as m from '~/i18n/paraglide/messages'

interface YearMetrics {
  coverage: number
  totalCoverage: number
  averageDurationDays: number | null
  overdueRate: number | null
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
  /** Null when one of the two years has nothing to measure. */
  delta: number | null
  unit: string
  invertedBetter?: boolean // true si une baisse est positive (ex: taux de retard)
}

// A change between two percentages is in points, not a percentage of the first.
const POINTS = '\u00a0pts'
const days = (value: number) => `${formatNumber(value)}\u00a0j`
const difference = (current: number | null, previous: number | null) =>
  current == null || previous == null ? null : current - previous

function formatSignedDelta(delta: number, unit: string): string {
  return `${formatDelta(delta)}${unit}`
}

export default function YearOverYearTable({ current, previous, currentLabel, previousLabel }: YearOverYearTableProps) {
  const rows: MetricRow[] = [
    {
      label: m.stats_yoy_coverage(),
      currentValue: formatPerTerritory(current.coverage),
      previousValue: formatPerTerritory(previous.coverage),
      delta: (current.coverage - previous.coverage) / 100,
      unit: '',
    },
    {
      label: m.stats_yoy_total_coverage(),
      currentValue: formatPercent(current.totalCoverage),
      previousValue: formatPercent(previous.totalCoverage),
      delta: current.totalCoverage - previous.totalCoverage,
      unit: POINTS,
    },
    {
      label: m.stats_yoy_avg_duration(),
      currentValue: formatFigure(current.averageDurationDays, days),
      previousValue: formatFigure(previous.averageDurationDays, days),
      delta: difference(current.averageDurationDays, previous.averageDurationDays),
      unit: '\u00a0j',
    },
    {
      label: m.stats_yoy_overdue_rate(),
      currentValue: formatFigure(current.overdueRate, formatPercent),
      previousValue: formatFigure(previous.overdueRate, formatPercent),
      delta: difference(current.overdueRate, previous.overdueRate),
      unit: POINTS,
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
            const { delta } = row
            if (delta == null) {
              return (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="py-3 font-medium">{row.label}</td>
                  <td className="py-3 text-right font-display font-semibold">{row.currentValue}</td>
                  <td className="py-3 text-right text-muted-foreground">{row.previousValue}</td>
                  <td className="py-3 text-right text-muted-foreground">{NO_FIGURE}</td>
                </tr>
              )
            }
            const isPositive = row.invertedBetter ? delta < 0 : delta > 0
            const isNeutral = Math.abs(delta) < 0.1

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
                    {formatSignedDelta(delta, row.unit)}
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
