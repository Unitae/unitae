import { LineChart } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { serviceYearMonths } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { EmptyState } from '~/shared/ui/EmptyState'

interface Props {
  serviceYear: number
  monthlyHours: (number | null)[]
  rate: number
}

export function PioneerPaceChart({ serviceYear, monthlyHours, rate }: Props) {
  if (monthlyHours.every(h => h == null)) {
    return <EmptyState icon={LineChart} title={m.pioneers_chart_empty()} />
  }

  const months = serviceYearMonths(serviceYear)
  let cumulative = 0
  const data = months.map(({ month, year }, i) => {
    const hours = monthlyHours[i]
    cumulative += hours ?? 0
    return {
      name: new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'short' }),
      hours: hours ?? undefined,
      cumulative,
    }
  })

  return (
    <div role="img" aria-label={m.pioneers_chart_aria()}>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
          <YAxis
            allowDecimals={false}
            width={32}
            className="text-xs"
            tick={{ fill: 'var(--color-muted-foreground)' }}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
            contentStyle={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '0.5rem',
            }}
            labelStyle={{ color: 'var(--color-card-foreground)' }}
          />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
          <ReferenceLine
            y={rate}
            strokeDasharray="4 4"
            className="stroke-muted-foreground"
            label={{
              value: m.pioneers_chart_target(),
              position: 'insideTopRight',
              className: 'fill-muted-foreground text-xs',
            }}
          />
          <Bar dataKey="hours" name={m.pioneers_chart_hours()} fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
          <Line
            type="monotone"
            dataKey="cumulative"
            name={m.pioneers_chart_cumulative()}
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={{ fill: 'var(--color-chart-2)', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
