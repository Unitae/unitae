import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { serviceYearMonths } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'

interface Props {
  serviceYear: number
  monthlyHours: (number | null)[]
  rate: number
}

export function PioneerPaceChart({ serviceYear, monthlyHours, rate }: Props) {
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
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
          <YAxis className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '0.5rem',
            }}
            labelStyle={{ color: 'var(--color-card-foreground)' }}
          />
          <ReferenceLine y={rate} strokeDasharray="4 4" className="stroke-muted-foreground" />
          <Bar dataKey="hours" name={m.pioneers_chart_hours()} fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
          <Line
            type="monotone"
            dataKey="cumulative"
            name={m.pioneers_chart_cumulative()}
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
