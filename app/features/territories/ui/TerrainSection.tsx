import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { ShopKindDistributionEntry } from '~/features/territories/server/compute-shopkind-distribution.server'
import type { TerrainStats } from '~/features/territories/server/compute-terrain-stats.server'
import CommerceShopKindChart from '~/features/territories/ui/CommerceShopKindChart'
import { StatLabel } from '~/features/territories/ui/StatLabel'
import { ZoneHeading } from '~/features/territories/ui/ZoneHeading'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

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
  return (
    <>
      <ZoneHeading eyebrow={m.stats_scope_snapshot()} title={m.stats_terrain_heading()} />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.homesCount}</span>
              {stats.homesPerBuilding != null && (
                <span className="font-display text-lg text-muted-foreground">
                  {m.stats_terrain_homes_subtitle({ perBuilding: stats.homesPerBuilding })}
                </span>
              )}
              <StatLabel label={m.stats_terrain_homes()} help={m.stats_terrain_homes_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.phonesCount}</span>
              {stats.phonesCoverage != null && (
                <span className="font-display text-lg text-muted-foreground">
                  {m.stats_terrain_phones_subtitle({ percentage: stats.phonesCoverage })}
                </span>
              )}
              <StatLabel label={m.stats_terrain_phones()} help={m.stats_terrain_phones_help()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.buildingsCount}</span>
              <span className="font-display text-lg text-muted-foreground">
                {m.stats_terrain_buildings_subtitle({ count: stats.entrancesCount })}
              </span>
              <StatLabel label={m.stats_terrain_buildings()} help={m.stats_terrain_buildings_help()} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">{m.stats_terrain_commerce_distribution_title()}</CardTitle>
          </CardHeader>
          <CardContent>
            {shopKindDistribution.length > 0 ? (
              <CommerceShopKindChart data={shopKindDistribution} />
            ) : (
              <span className="block py-12 text-center text-muted-foreground text-sm italic">
                {m.stats_terrain_no_commerces()}
              </span>
            )}
          </CardContent>
        </Card>
        {buildingsMissingDemographicsCount > 0 && (
          <div className="flex justify-end">
            <Link
              to="/territories/buildings/need-check"
              className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-primary hover:underline"
            >
              {buildingsMissingDemographicsCount > 1
                ? m.stats_terrain_gap_link_other({ count: buildingsMissingDemographicsCount })
                : m.stats_terrain_gap_link_one({ count: buildingsMissingDemographicsCount })}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
