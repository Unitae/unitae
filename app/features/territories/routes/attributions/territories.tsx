import { redirect, useSearchParams } from 'react-router'
import { getZips } from '~/features/territories/server/buildings.server'
import { getActiveCampaign } from '~/features/territories/server/campaign.queries'
import { classifySearch } from '~/features/territories/server/search-intent.server'
import { findAvailableTerritoriesPaginated } from '~/features/territories/server/territories.server'
import { computeFilters } from '~/features/territories/server/territory-filters.server'
import { AvailableTerritoriesTable } from '~/features/territories/ui/AvailableTerritoriesTable'
import { buildTerritoryFilterChips } from '~/features/territories/ui/build-filter-chips'
import GeocodeNotice, { type GeocodeNoticeData } from '~/features/territories/ui/GeocodeNotice'
import { NoCoordinatesPageBanner } from '~/features/territories/ui/NoCoordinatesNotice'
import ProximityBanner from '~/features/territories/ui/ProximityBanner'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { type GeocodeResult, geocode } from '~/shared/infra/geocoder.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { formatDistance } from '~/shared/utils/distance'
import { sortFromUrl } from '~/shared/utils/pagination.server'

import type { Route } from './+types/territories'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_new_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.CanManageTerritoryAttributions)) {
    logger.warn(
      `Tried to load territories available for attribution. User ID: ${currentUser.id}. Does NOT have rights to manage territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Loading territories available for attribution. User ID: ${currentUser.id}.`)

  const canManageTerritories = permissions.has(Permission.CanManageTerritoryAttributions)
  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const url = new URL(request.url)
    const [pmrActive, zips] = await Promise.all([
      getBoolSetting(db, TerritorySettingKey.PmrActive, congregationId).then(v => v ?? false),
      getZips(db, congregationId),
    ])
    const selectors = computeFilters(url.searchParams)
    // While a campaign is active a territory is assignable (into the
    // campaign) only when nobody actively works it: any open, unpaused
    // attribution blocks it — paused regulars and returned ones don't.
    // Outside a campaign, any open attribution blocks: paused regulars are
    // still held, and campaign attributions left open by an ended campaign
    // (endCloseCampaign off) still occupy the ground.
    const activeCampaign = await getActiveCampaign(db, congregationId)
    selectors.attributions =
      activeCampaign != null ? { none: { endDate: null, pausedAt: null } } : { none: { endDate: null } }

    const search = url.searchParams.get('search') ?? ''
    const intent = classifySearch(search)

    let geocodeResult: GeocodeResult | null = null
    if (intent.geoQuery != null) {
      geocodeResult = await geocode(intent.geoQuery)
    }
    const defaultSort = geocodeResult != null ? 'proximity' : 'number'
    const sort = sortFromUrl(url, ['number', 'proximity'], defaultSort)
    const proximityActive = geocodeResult != null && sort === 'proximity'

    const proximityArgs =
      proximityActive && geocodeResult != null
        ? { origin: { lat: geocodeResult.lat, lng: geocodeResult.lng } }
        : undefined

    const result = await findAvailableTerritoriesPaginated(db, selectors, url, congregationId, proximityArgs)

    const locale = getLocale()
    const distancesByTerritoryId: Record<number, string | null> = {}
    if (proximityActive && 'distances' in result && result.distances != null) {
      for (const territory of result.territories) {
        const distance = result.distances.get(territory)
        distancesByTerritoryId[territory.id] = distance == null ? null : formatDistance(distance, locale)
      }
    }

    const geocodeNotice: GeocodeNoticeData | null =
      intent.forced && intent.geoQuery == null
        ? { kind: 'missing-query' }
        : intent.geoQuery != null && geocodeResult == null
          ? { kind: 'failed', query: intent.geoQuery }
          : null

    return {
      zips,
      pmrActive,
      activeCampaignName: activeCampaign?.name ?? null,
      stats: { total: result.pagination.total },
      territories: result.territories,
      pagination: result.pagination,
      canManageTerritories,
      geocodeResult,
      proximityActive,
      geocodeNotice,
      distances: distancesByTerritoryId,
      withoutCoordsCount: (proximityActive && 'withoutCoordsCount' in result && result.withoutCoordsCount) || 0,
      withCoordsCount: (proximityActive && 'withCoordsCount' in result && result.withCoordsCount) || 0,
      sort,
    }
  })
}

function CampaignModeNotice({ name }: { name: string | null }) {
  if (name == null) return null
  return (
    <div className="rounded-md bg-blue-100 px-4 py-3 text-blue-700 text-sm dark:bg-blue-900/30 dark:text-blue-400">
      {m.attributions_available_campaign_notice({ name })}
    </div>
  )
}

export default function TerritorySelectorPage({ loaderData }: Route.ComponentProps) {
  const {
    pagination,
    territories,
    zips,
    pmrActive,
    activeCampaignName,
    geocodeResult,
    proximityActive,
    geocodeNotice,
    distances,
    withoutCoordsCount,
    withCoordsCount,
    sort,
  } = loaderData
  const [searchParams] = useSearchParams()
  const chips = buildTerritoryFilterChips(searchParams)
  const wholePageWithoutCoords = proximityActive && pagination.offset >= withCoordsCount && territories.length > 0

  if (territories.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title={m.attributions_available_title()}
          subtitle={m.attributions_available_subtitle()}
          breadcrumbs={[
            { label: m.sidebar_attributions(), to: '/territories/attributions' },
            { label: m.attributions_available_title() },
          ]}
          backTo="/territories/attributions"
        />
        <CampaignModeNotice name={activeCampaignName} />
        <FilterChipBar chips={chips} />
        <GeocodeNotice notice={geocodeNotice} />
        <TerritoryFilters zips={zips} showAccess showSearch showType showZip showPmr={pmrActive} />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
          <p>{m.attributions_available_empty_title()}</p>
          <p>{m.attributions_available_empty_details()}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={m.attributions_available_title()}
        subtitle={m.attributions_available_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_attributions(), to: '/territories/attributions' },
          { label: m.attributions_available_title() },
        ]}
        backTo="/territories/attributions"
      />
      <CampaignModeNotice name={activeCampaignName} />
      <FilterChipBar chips={chips} />
      <GeocodeNotice notice={geocodeNotice} />
      {geocodeResult != null && <ProximityBanner geocode={geocodeResult} />}
      <TerritoryFilters
        zips={zips}
        showZip
        showAccess
        showSearch
        showType
        showPmr={pmrActive}
        showSort
        sortValue={sort}
        sortOptions={proximityActive ? ['number', 'proximity'] : ['number']}
      />

      <div className="flex grow flex-col gap-3">
        {wholePageWithoutCoords && <NoCoordinatesPageBanner count={withoutCoordsCount} />}
        <AvailableTerritoriesTable
          territories={territories}
          campaignMode={activeCampaignName != null}
          proximityActive={proximityActive}
          distances={distances}
          withoutCoordsCount={withoutCoordsCount}
          pmrActive={pmrActive}
        />

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
