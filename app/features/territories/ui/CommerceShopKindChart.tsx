import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ShopKindDistributionEntry } from '~/features/territories/server/compute-shopkind-distribution.server'

export default function CommerceShopKindChart({ data }: { data: ShopKindDistributionEntry[] }) {
  if (data.length === 0) return null

  const height = Math.max(180, data.length * 40 + 40)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          type="number"
          allowDecimals={false}
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          className="text-xs"
          tick={{ fill: 'var(--color-muted-foreground)' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: 'var(--color-card-foreground)' }}
        />
        <Bar dataKey="count" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
