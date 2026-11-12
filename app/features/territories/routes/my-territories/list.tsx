import { Panel, SectionHeading } from '@unitae/ui'
import { MapPin } from 'lucide-react'
import { useEffect, useId } from 'react'

import { mainStreets } from '~/features/territories/model/holder-territory'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { getActiveCampaign } from '~/features/territories/server/campaign.queries'
import { getUserTerritoriesWithDetails } from '~/features/territories/server/my-territories.server'
import { CampaignModeBanner } from '~/features/territories/ui/CampaignModeBanner'
import { prefetchHolderMapCanvas } from '~/features/territories/ui/holder-map-chunk'
import { MyTerritoryRow, type MyTerritoryRowData } from '~/features/territories/ui/MyTerritoryRow'
import { territoryCountLabel } from '~/features/territories/ui/my-territory-labels'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { getMapTiles } from '~/shared/infra/map-tiles.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { formatLocalDate } from '~/shared/utils/date.server'
import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.my_territories_meta_title() }]
}

/** How many streets name a territory in the list before « + 3 rues ». */
const NAMED_STREETS = 2

export function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  // Attributions are held by the Member, not the login account; accounts
  // without a linked member (e.g. platform admins) legitimately have none.
  const memberId = currentUser.member?.id ?? null

  return withScopeFromContext(context, async (db, congregationId) => {
    const attributions =
      memberId == null ? [] : await getUserTerritoriesWithDetails(db, memberId, { includePaused: true })
    const locale = getLocale()

    const rows = attributions.map((a): MyTerritoryRowData => {
      const { entrances } = a.territory
      const streets = mainStreets(
        entrances.flatMap(e => e.buildings.map(b => b.street)),
        locale,
      )
      return {
        territoryId: a.territory.id,
        number: a.territory.number,
        type: a.territory.type,
        // An entrance without a household count still has its phone numbers to call.
        homes: entrances.reduce((sum, e) => sum + ((e.homes ?? 0) || (e.phones ?? 0)), 0),
        phones: entrances.reduce((sum, e) => sum + (e.phones ?? 0), 0),
        entrances: entrances.length,
        streets: streets.slice(0, NAMED_STREETS),
        moreStreets: Math.max(0, streets.length - NAMED_STREETS),
        startDate: a.startDate,
        lateDate: a.lateDate,
        pausedAt: a.pausedAt,
        status: a.status,
        byPhone: a.type === TerritoryAttributionKind.Phone,
        campaignName: a.campaign?.name ?? null,
      }
    })

    const activeCampaign = await getActiveCampaign(db, congregationId)
    // Whether a territory page here will show a map: the list then fetches the map's code while it sits idle.
    const mapOn =
      rows.length > 0 &&
      getMapTiles() != null &&
      ((await getBoolSetting(db, TerritorySettingKey.MapTabActive, congregationId)) ?? false)
    const bannerCampaign =
      activeCampaign == null
        ? null
        : {
            id: activeCampaign.id,
            name: activeCampaign.name,
            // Campaign days are saved as midnight in the server's zone: read them there.
            startDay: formatLocalDate(activeCampaign.startDate),
            endDay: formatLocalDate(activeCampaign.endDate),
            status: 'active' as const,
          }

    return {
      territories: rows.filter(row => row.pausedAt == null),
      paused: rows.filter(row => row.pausedAt != null),
      bannerCampaign,
      mapOn,
      timeZone: timezone,
    }
  })
}

export default function MyTerritoriesList({ loaderData }: Route.ComponentProps) {
  const { territories, paused, bannerCampaign, mapOn, timeZone } = loaderData
  const pausedHeadingId = useId()
  useEffect(() => (mapOn ? prefetchHolderMapCanvas() : undefined), [mapOn])

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader
        title={m.my_territories_title()}
        titleBadge={
          territories.length > 0 ? (
            <span className="text-base text-faint tabular-nums">{territoryCountLabel(territories.length)}</span>
          ) : undefined
        }
        breadcrumbs={[{ label: m.sidebar_my_territories() }]}
      />

      <CampaignModeBanner campaign={bannerCampaign} variant="publisher" />

      {territories.length === 0 && paused.length === 0 && (
        <EmptyState icon={MapPin} title={m.my_territories_empty()} description={m.my_territories_empty_description()} />
      )}

      {territories.length > 0 && (
        <Panel aria-label={m.my_territories_title()}>
          <ul>
            {territories.map(territory => (
              <MyTerritoryRow key={territory.territoryId} territory={territory} timeZone={timeZone} />
            ))}
          </ul>
        </Panel>
      )}

      {paused.length > 0 && (
        <section aria-labelledby={pausedHeadingId} className="mt-3 flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <SectionHeading id={pausedHeadingId} title={m.my_territories_paused_title()} meta={paused.length} />
            <p className="text-muted-foreground text-sm">{m.my_territories_paused_description()}</p>
          </div>
          <Panel aria-label={m.my_territories_paused_title()}>
            <ul>
              {paused.map(territory => (
                <MyTerritoryRow key={territory.territoryId} territory={territory} timeZone={timeZone} />
              ))}
            </ul>
          </Panel>
        </section>
      )}
    </div>
  )
}
