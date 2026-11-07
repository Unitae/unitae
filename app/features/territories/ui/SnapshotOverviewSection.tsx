import { BarList, ChartCard, ChartEmpty, MetricStrip, SegmentedBar, StatTile } from '@unitae/ui'
import { RESTING_PERIOD_DAYS } from '~/features/territories/model/resting-periods'
import type { AttributionsByGroup } from '~/features/territories/server/fetch-attributions-by-group.server'
import { StatLabel } from '~/features/territories/ui/StatLabel'
import { ZoneHeading } from '~/features/territories/ui/ZoneHeading'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'

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

export default function SnapshotOverviewSection({ stats, attributionsByGroup }: SnapshotOverviewSectionProps) {
  // A state, not a category: status colours with their matching label ink.
  const stateParts = [
    {
      key: 'available',
      label: m.stats_pie_available(),
      value: stats.available,
      color: 'var(--color-success)',
      ink: 'var(--color-ink-on-success)',
    },
    {
      key: 'active',
      label: m.stats_pie_active(),
      value: stats.active,
      color: 'var(--color-chart-1)',
      ink: 'var(--color-ink-on-chart-1)',
    },
    {
      key: 'delayed',
      label: m.stats_pie_delayed(),
      value: stats.delayed,
      color: 'var(--color-warning)',
      ink: 'var(--color-ink-on-warning)',
    },
    {
      key: 'resting',
      label: m.stats_pie_resting(),
      value: stats.resting,
      color: 'var(--color-chart-other)',
      ink: 'var(--color-ink-on-chart-other)',
    },
  ]
  const groups = attributionsByGroup.map((g, i) => ({
    key: `${i}-${g.groupName}`,
    label: formatGroupName(g.groupName),
    value: g.count,
  }))

  return (
    <section className="flex flex-col gap-4">
      <ZoneHeading eyebrow={m.stats_scope_snapshot()} title={m.stats_global_heading()} />
      <MetricStrip aria-label={m.stats_global_heading()}>
        <StatTile
          label={<StatLabel label={m.stats_total_territories()} help={m.stats_total_territories_help()} />}
          value={stats.total}
        />
        <StatTile
          label={<StatLabel label={m.stats_available_territories()} help={m.stats_available_territories_help()} />}
          value={stats.available}
        />
        <StatTile
          label={<StatLabel label={m.stats_working_territories()} help={m.stats_working_territories_help()} />}
          value={stats.working}
        />
        <StatTile
          label={<StatLabel label={m.stats_delayed_territories()} help={m.stats_delayed_territories_help()} />}
          value={stats.delayed}
          tone={stats.delayed > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label={
            <StatLabel
              label={m.stats_resting_territories()}
              help={m.stats_resting_territories_help({
                doorDays: RESTING_PERIOD_DAYS.doorsToDoors,
                otherDays: RESTING_PERIOD_DAYS.campaign,
              })}
            />
          }
          value={stats.resting}
        />
      </MetricStrip>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <ChartCard title={m.stats_pie_label()} subtitle={m.stats_pie_help()}>
          <SegmentedBar aria-label={m.stats_pie_label()} parts={stateParts} />
        </ChartCard>
        <ChartCard title={m.stats_group_distribution_label()} subtitle={m.stats_group_distribution_help()}>
          {groups.length > 0 ? (
            <BarList aria-label={m.stats_group_distribution_label()} items={groups} />
          ) : (
            <ChartEmpty>{m.stats_no_active_attributions()}</ChartEmpty>
          )}
        </ChartCard>
      </div>
    </section>
  )
}
