import { TrendingDown, TrendingUp } from 'lucide-react'

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

function formatDelta(delta: number, unit: string): string {
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}${unit}`
}

export default function YearOverYearTable({
  current,
  previous,
  currentLabel,
  previousLabel,
}: YearOverYearTableProps) {
  const rows: MetricRow[] = [
    {
      label: 'Couverture du territoire',
      currentValue: `${current.coverage.toFixed(1)} %`,
      previousValue: `${previous.coverage.toFixed(1)} %`,
      delta: current.coverage - previous.coverage,
      unit: ' %',
    },
    {
      label: 'Couverture complète',
      currentValue: `${current.totalCoverage.toFixed(1)} %`,
      previousValue: `${previous.totalCoverage.toFixed(1)} %`,
      delta: current.totalCoverage - previous.totalCoverage,
      unit: ' %',
    },
    {
      label: 'Durée moy. des attributions',
      currentValue: `${current.averageDurationDays} j`,
      previousValue: `${previous.averageDurationDays} j`,
      delta: current.averageDurationDays - previous.averageDurationDays,
      unit: ' j',
    },
    {
      label: 'Taux de retard',
      currentValue: `${current.overdueRate.toFixed(1)} %`,
      previousValue: `${previous.overdueRate.toFixed(1)} %`,
      delta: current.overdueRate - previous.overdueRate,
      unit: ' %',
      invertedBetter: true,
    },
    {
      label: 'Nombre d\'attributions',
      currentValue: String(current.attributionCount),
      previousValue: String(previous.attributionCount),
      delta: current.attributionCount - previous.attributionCount,
      unit: '',
    },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-3 font-medium">Indicateur</th>
            <th className="pb-3 text-right font-medium">{currentLabel}</th>
            <th className="pb-3 text-right font-medium">{previousLabel}</th>
            <th className="pb-3 text-right font-medium">Évolution</th>
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
                    {formatDelta(row.delta, row.unit)}
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
