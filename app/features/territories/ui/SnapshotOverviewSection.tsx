import { BarList, ChartCard, ChartEmpty, MetricStrip, SegmentedBar, StatTile } from '@unitae/ui'
import { RESTING_PERIOD_DAYS } from '~/features/territories/model/resting-periods'
import type { AttributionsByGroup } from '~/features/territories/server/fetch-attributions-by-group.server'
import { StatLabel } from '~/features/territories/ui/StatLabel'
import { statsViewLabels } from '~/features/territories/ui/stats-format'
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
  // Free is not good news, so neutral; late is the lists' danger; the rest are plain categories.
  const stateParts = [
    {
      key: 'available',
      label: m.stats_pie_available(),
      value: stats.available,
      color: 'var(--color-chart-muted)',
      ink: 'var(--u-fg)',
    },
    {
      key: 'active',
      label: m.stats_pie_active(),
      value: stats.active,
      color: 'var(--color-chart-1)',
      ink: 'var(--color-ink-on-chart-1)',
    },
    { key: 'delayed', label: m.stats_pie_delayed(), value: stats.delayed, color: 'var(--u-danger)', ink: '#fff' },
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
  const attributed = groups.reduce((sum, group) => sum + group.value, 0)

  return (
    <section className="flex flex-col gap-4">
      <ZoneHeading eyebrow={m.stats_scope_snapshot()} title={m.stats_global_heading()} />
      <MetricStrip aria-label={m.stats_global_heading()} minTileWidth={150}>
        <StatTile
          label={<StatLabel label={m.stats_total_territories()} help={m.stats_total_territories_help()} />}
          value={stats.total}
          foot={m.stats_tile_total_foot()}
        />
        <StatTile
          label={<StatLabel label={m.stats_available_territories()} help={m.stats_available_territories_help()} />}
          value={stats.available}
          foot={m.stats_tile_available_foot()}
        />
        <StatTile
          label={<StatLabel label={m.stats_working_territories()} help={m.stats_working_territories_help()} />}
          value={stats.working}
          foot={m.stats_tile_working_foot({ count: stats.delayed })}
        />
        <StatTile
          label={<StatLabel label={m.stats_delayed_territories()} help={m.stats_delayed_territories_help()} />}
          value={stats.delayed}
          foot={m.stats_tile_delayed_foot()}
          tone={stats.delayed > 0 ? 'negative' : 'neutral'}
        />
        <StatTile
          label={
            <StatLabel
              label={m.stats_resting_territories()}
              help={m.stats_resting_territories_help({
                doorDays: m.stats_resting_days({ count: RESTING_PERIOD_DAYS.doorsToDoors }),
                otherDays: m.stats_resting_days({ count: RESTING_PERIOD_DAYS.campaign }),
              })}
            />
          }
          value={stats.resting}
          foot={m.stats_tile_resting_foot()}
        />
      </MetricStrip>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <ChartCard
          title={m.stats_pie_label()}
          subtitle={m.stats_pie_subtitle({ count: stats.total })}
          viewLabels={statsViewLabels()}
          table={{
            columns: [
              { key: 'state', label: m.stats_table_state() },
              { key: 'count', label: m.stats_table_count(), numeric: true },
            ],
            rows: stateParts.map(part => ({ state: part.label, count: part.value })),
          }}
        >
          <SegmentedBar aria-label={m.stats_pie_label()} parts={stateParts} />
        </ChartCard>
        <ChartCard
          title={m.stats_group_distribution_label()}
          subtitle={groups.length > 0 ? m.stats_group_subtitle({ count: attributed }) : undefined}
          viewLabels={statsViewLabels()}
          table={
            groups.length > 0
              ? {
                  columns: [
                    { key: 'group', label: m.stats_table_group() },
                    { key: 'count', label: m.stats_table_count(), numeric: true },
                  ],
                  rows: groups.map(group => ({ group: group.label, count: group.value })),
                }
              : undefined
          }
        >
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
