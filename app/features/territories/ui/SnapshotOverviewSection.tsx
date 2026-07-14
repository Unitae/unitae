import { Cell, Pie, PieChart, Tooltip as RechartsTooltip } from 'recharts'
import { RESTING_PERIOD_DAYS } from '~/features/territories/model/resting-periods'
import type { AttributionsByGroup } from '~/features/territories/server/fetch-attributions-by-group.server'
import { StatLabel } from '~/features/territories/ui/StatLabel'
import { ZoneHeading } from '~/features/territories/ui/ZoneHeading'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent } from '~/shared/ui/card'

interface SnapshotStats {
  total: number
  available: number
  working: number
  delayed: number
  resting: number
  active: number
}

interface SnapshotOverviewSectionProps {
  stats: SnapshotStats
  attributionsByGroup: AttributionsByGroup[]
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.5rem',
  },
  labelStyle: { color: 'var(--color-card-foreground)' },
}

const PIE_COLORS = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-4)', 'var(--color-chart-3)']

const GROUP_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
]

export default function SnapshotOverviewSection({ stats, attributionsByGroup }: SnapshotOverviewSectionProps) {
  const pieData = [
    { name: m.stats_pie_available(), value: stats.available },
    { name: m.stats_pie_active(), value: stats.active },
    { name: m.stats_pie_delayed(), value: stats.delayed },
    { name: m.stats_pie_resting(), value: stats.resting },
  ]

  return (
    <>
      <ZoneHeading eyebrow={m.stats_scope_snapshot()} title={m.stats_global_heading()} />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-7xl max-sm:text-5xl">{stats.total}</span>
              <StatLabel label={m.stats_total_territories()} help={m.stats_total_territories_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-7xl max-sm:text-5xl">{stats.available}</span>
              <StatLabel label={m.stats_available_territories()} help={m.stats_available_territories_help()} />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.working}</span>
              <StatLabel label={m.stats_working_territories()} help={m.stats_working_territories_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.delayed}</span>
              <StatLabel label={m.stats_delayed_territories()} help={m.stats_delayed_territories_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.resting}</span>
              <StatLabel
                label={m.stats_resting_territories()}
                help={m.stats_resting_territories_help({
                  doorDays: RESTING_PERIOD_DAYS.doorsToDoors,
                  otherDays: RESTING_PERIOD_DAYS.campaign,
                })}
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <PieChart width={300} height={300}>
                <Pie
                  data={pieData}
                  cx={150}
                  cy={150}
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip {...CHART_TOOLTIP_STYLE} />
              </PieChart>
              <StatLabel label={m.stats_pie_label()} help={m.stats_pie_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              {attributionsByGroup.length > 0 ? (
                <PieChart width={300} height={300}>
                  <Pie
                    data={attributionsByGroup.map(g => ({ name: g.groupName.toLocaleUpperCase(), value: g.count }))}
                    cx={150}
                    cy={150}
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {attributionsByGroup.map((g, index) => (
                      <Cell key={`group-${g.groupName}`} fill={GROUP_COLORS[index % GROUP_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip {...CHART_TOOLTIP_STYLE} />
                </PieChart>
              ) : (
                <span className="py-12 text-muted-foreground text-sm italic">{m.stats_no_active_attributions()}</span>
              )}
              <StatLabel label={m.stats_group_distribution_label()} help={m.stats_group_distribution_help()} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
