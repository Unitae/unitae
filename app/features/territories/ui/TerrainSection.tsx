import { BarList, ChartCard, ChartEmpty, MetricStrip, StatTile } from '@unitae/ui'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { ShopKindDistributionEntry } from '~/features/territories/server/compute-shopkind-distribution.server'
import type { TerrainStats } from '~/features/territories/server/compute-terrain-stats.server'
import { StatLabel } from '~/features/territories/ui/StatLabel'
import { formatNumber, statsViewLabels } from '~/features/territories/ui/stats-format'
import { ZoneHeading } from '~/features/territories/ui/ZoneHeading'
import * as m from '~/i18n/paraglide/messages'

interface TerrainSectionProps {
  stats: TerrainStats
  shopKindDistribution: ShopKindDistributionEntry[]
  buildingsMissingDemographicsCount: number
}

export default function TerrainSection({
  stats,
  shopKindDistribution,
  buildingsMissingDemographicsCount,
}: TerrainSectionProps) {
  const otherLabel = m.stats_terrain_commerce_distribution_other()
  const shops = shopKindDistribution.map(s => ({
    key: s.name,
    label: s.name,
    value: s.count,
    other: s.name === otherLabel,
  }))

  return (
    <section className="flex flex-col gap-4">
      <ZoneHeading eyebrow={m.stats_scope_snapshot()} title={m.stats_terrain_heading()} />
      <MetricStrip aria-label={m.stats_terrain_heading()}>
        <StatTile
          label={<StatLabel label={m.stats_terrain_homes()} help={m.stats_terrain_homes_help()} />}
          value={formatNumber(stats.homesCount)}
          foot={
            stats.homesPerBuilding != null
              ? m.stats_terrain_homes_subtitle({ perBuilding: stats.homesPerBuilding })
              : undefined
          }
        />
        <StatTile
          label={<StatLabel label={m.stats_terrain_phones()} help={m.stats_terrain_phones_help()} />}
          value={formatNumber(stats.phonesCount)}
          foot={
            stats.phonesCoverage != null
              ? m.stats_terrain_phones_subtitle({ percentage: stats.phonesCoverage })
              : undefined
          }
        />
        <StatTile
          label={<StatLabel label={m.stats_terrain_buildings()} help={m.stats_terrain_buildings_help()} />}
          value={formatNumber(stats.buildingsCount)}
          foot={m.stats_terrain_buildings_subtitle({ count: stats.entrancesCount })}
        />
      </MetricStrip>
      <ChartCard
        title={m.stats_terrain_commerce_distribution_title()}
        viewLabels={statsViewLabels()}
        table={
          shops.length > 0
            ? {
                columns: [
                  { key: 'label', label: m.stats_table_activity() },
                  { key: 'count', label: m.stats_table_count(), numeric: true },
                ],
                rows: shops.map(s => ({ label: s.label, count: formatNumber(s.value) })),
              }
            : undefined
        }
      >
        {shops.length > 0 ? (
          <BarList
            aria-label={m.stats_terrain_commerce_distribution_title()}
            items={shops}
            formatValue={value => formatNumber(value)}
          />
        ) : (
          <ChartEmpty>{m.stats_terrain_no_commerces()}</ChartEmpty>
        )}
      </ChartCard>
      {buildingsMissingDemographicsCount > 0 && (
        <div className="flex justify-end">
          <Link
            to="/territories/buildings/need-check"
            className="inline-flex items-center gap-1 font-medium text-brand-text text-sm hover:underline"
          >
            {buildingsMissingDemographicsCount > 1
              ? m.stats_terrain_gap_link_other({ count: buildingsMissingDemographicsCount })
              : m.stats_terrain_gap_link_one({ count: buildingsMissingDemographicsCount })}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </section>
  )
}
