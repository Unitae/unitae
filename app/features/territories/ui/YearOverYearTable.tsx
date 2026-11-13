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
  /** A fall is the good news, e.g. the overdue rate. */
  invertedBetter?: boolean
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

  const head = 'h-10 whitespace-nowrap border-border border-b px-3.5 font-medium text-faint text-sm'
  const cell = 'h-10 border-border border-b px-3.5 group-last:border-b-0'
  return (
    // A minimum width keeps the columns apart on a phone: the table scrolls instead of running its headers together.
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${head} text-left`}>{m.stats_yoy_indicator()}</th>
            <th className={`${head} text-right`}>{currentLabel}</th>
            <th className={`${head} text-right`}>{previousLabel}</th>
            <th className={`${head} text-right`}>{m.stats_yoy_evolution()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="group">
              <td className={cell}>{row.label}</td>
              <td className={`${cell} text-right font-semibold tabular-nums`}>{row.currentValue}</td>
              <td className={`${cell} text-right text-muted-foreground tabular-nums`}>{row.previousValue}</td>
              <td className={`${cell} text-right tabular-nums`}>
                <Evolution delta={row.delta} unit={row.unit} invertedBetter={row.invertedBetter} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** « ↑ +6,2 pts »: the success text colour when it is good news, the danger one when not, an arrow either way. */
function Evolution({ delta, unit, invertedBetter }: { delta: number | null; unit: string; invertedBetter?: boolean }) {
  if (delta == null) return <span className="text-muted-foreground">{NO_FIGURE}</span>
  if (Math.abs(delta) < 0.1) return <span className="text-muted-foreground">{formatSignedDelta(delta, unit)}</span>
  const better = invertedBetter ? delta < 0 : delta > 0
  return (
    <span className={`inline-flex items-center gap-1 ${better ? 'text-success-text' : 'text-danger-text'}`}>
      {delta > 0 ? (
        <TrendingUp className="size-3.5" aria-hidden="true" />
      ) : (
        <TrendingDown className="size-3.5" aria-hidden="true" />
      )}
      {formatSignedDelta(delta, unit)}
    </span>
  )
}
