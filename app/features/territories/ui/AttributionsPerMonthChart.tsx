import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyCount } from '~/features/territories/server/compute-attributions-per-month.server'
import * as m from '~/i18n/paraglide/messages'
import { formatMonthLabel } from '~/shared/utils/month-label'

export default function AttributionsPerMonthChart({ data }: { data: MonthlyCount[] }) {
  if (data.length === 0) return null

  const chartData = data.map(d => ({ name: formatMonthLabel(d.month), count: d.count }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="name" className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
        <YAxis allowDecimals={false} className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: 'var(--color-card-foreground)' }}
        />
        <Bar dataKey="count" name={m.chart_attributions_label()} fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
