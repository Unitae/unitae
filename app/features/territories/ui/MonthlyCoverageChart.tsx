import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyCoverage } from '~/features/territories/server/compute-monthly-coverage-evolution.server'
import * as m from '~/i18n/paraglide/messages'
import { formatMonthLabel } from '~/shared/utils/month-label'

export default function MonthlyCoverageChart({ data }: { data: MonthlyCoverage[] }) {
  if (data.length === 0) return null

  const chartData = data.map(d => ({ name: formatMonthLabel(d.month), coverage: d.coverage }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="name" className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
        <YAxis unit=" %" className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: 'var(--color-card-foreground)' }}
          formatter={value => [`${Number(value).toFixed(1)} %`, m.chart_coverage_label()]}
        />
        <Line
          type="monotone"
          dataKey="coverage"
          name={m.chart_coverage_label()}
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={{ fill: 'var(--color-chart-1)', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
