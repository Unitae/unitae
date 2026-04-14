import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyCount } from '~/features/territories/server/compute-attributions-per-month.server'
import * as m from '~/paraglide/messages'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fév',
  '03': 'Mar',
  '04': 'Avr',
  '05': 'Mai',
  '06': 'Juin',
  '07': 'Juil',
  '08': 'Août',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Déc',
}

function formatMonth(month: string): string {
  const [, m] = month.split('-')
  return MONTH_LABELS[m] ?? m
}

export default function AttributionsPerMonthChart({ data }: { data: MonthlyCount[] }) {
  if (data.length === 0) return null

  const chartData = data.map(d => ({ name: formatMonth(d.month), count: d.count }))

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
