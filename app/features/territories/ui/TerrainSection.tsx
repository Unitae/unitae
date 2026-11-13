import { BarList, ChartCard, ChartEmpty } from '@unitae/ui'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
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
      <div className="grid items-start gap-4 md:grid-cols-2">
        {/* The facts as rows, the figure at the end of each, as the board draws them. */}
        <div className="flex flex-col rounded-lg border border-border bg-card">
          <TerrainFact
            label={<StatLabel label={m.stats_terrain_homes()} help={m.stats_terrain_homes_help()} />}
            value={formatNumber(stats.homesCount)}
            caption={
              stats.homesPerBuilding != null
                ? m.stats_terrain_homes_subtitle({ perBuilding: stats.homesPerBuilding })
                : undefined
            }
          />
          <TerrainFact
            label={<StatLabel label={m.stats_terrain_phones()} help={m.stats_terrain_phones_help()} />}
            value={formatNumber(stats.phonesCount)}
            caption={
              stats.phonesCoverage != null
                ? m.stats_terrain_phones_subtitle({ percentage: stats.phonesCoverage })
                : undefined
            }
          />
          <TerrainFact
            label={<StatLabel label={m.stats_terrain_buildings()} help={m.stats_terrain_buildings_help()} />}
            value={formatNumber(stats.buildingsCount)}
            caption={m.stats_terrain_buildings_subtitle({ count: stats.entrancesCount })}
          />
          {buildingsMissingDemographicsCount > 0 && (
            <Link
              to="/territories/buildings/need-check"
              className="flex items-center justify-between gap-2 px-4 py-3 font-medium text-brand-text text-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {buildingsMissingDemographicsCount > 1
                ? m.stats_terrain_gap_link_other({ count: buildingsMissingDemographicsCount })
                : m.stats_terrain_gap_link_one({ count: buildingsMissingDemographicsCount })}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
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
      </div>
    </section>
  )
}

/** One fact of the terrain: its label, and the figure at the row's end with its caption under it. */
function TerrainFact({ label, value, caption }: { label: ReactNode; value: ReactNode; caption?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-border border-b px-4 py-3 last:border-b-0">
      {label}
      <span className="flex flex-col items-end gap-0.5">
        <span className="font-semibold text-foreground text-lg tabular-nums leading-tight">{value}</span>
        {caption != null && <span className="text-faint text-xs">{caption}</span>}
      </span>
    </div>
  )
}
