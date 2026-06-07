import { ExternalLink, Send } from 'lucide-react'
import { Link, redirect, useSearchParams } from 'react-router'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { Permission } from '~/shared/types/permission'

function getTerritoryTypeLabel(type: string): string {
  const labels: Record<string, () => string> = {
    [TerritoryKind.Classical]: () => m.territories_type_classical(),
    [TerritoryKind.Commerces]: () => m.territories_type_commerces(),
    [TerritoryKind.Phone]: () => m.territories_type_phone(),
    [TerritoryKind.Hotel]: () => m.territories_type_hotel(),
    [TerritoryKind.Univ]: () => m.territories_type_university(),
  }
  return labels[type]?.() ?? type
}

function territoryContentLabel(type: string, entrances: { homes: number | null; phones: number | null }[]): string {
  const count = entrances.length
  if (type === TerritoryKind.Phone) {
    const phones = entrances.reduce((s, e) => s + (e.phones ?? 0), 0)
    return m.territories_content_phones({ count: String(phones) })
  }
  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    const homes = entrances.reduce((s, e) => s + ((e.homes ?? 0) || (e.phones ?? 0)), 0)
    return homes > 1
      ? m.territories_content_homes_other({ count: String(homes) })
      : m.territories_content_homes_one({ count: String(homes) })
  }
  if (type === TerritoryKind.Commerces) {
    return count > 1
      ? m.territories_content_commerces_other({ count: String(count) })
      : m.territories_content_commerces_one({ count: String(count) })
  }
  if (type === TerritoryKind.Hotel) {
    return count > 1
      ? m.territories_content_hotels_other({ count: String(count) })
      : m.territories_content_hotels_one({ count: String(count) })
  }
  return count > 1
    ? m.territories_content_entrances_other({ count: String(count) })
    : m.territories_content_entrances_one({ count: String(count) })
}

import React from 'react'
import { getZips } from '~/features/territories/server/buildings.server'
import { classifySearch } from '~/features/territories/server/search-intent.server'
import { findAvailableTerritoriesPaginated } from '~/features/territories/server/territories.server'
import { computeFilters } from '~/features/territories/server/territory-filters.server'
import ActiveTerritoryFilters from '~/features/territories/ui/ActiveTerritoryFilters'
import { buildTerritoryFilterChips } from '~/features/territories/ui/build-filter-chips'
import GeocodeNotice from '~/features/territories/ui/GeocodeNotice'
import { NoCoordinatesDivider, NoCoordinatesPageBanner } from '~/features/territories/ui/NoCoordinatesNotice'
import ProximityBanner from '~/features/territories/ui/ProximityBanner'
import { checkAvailabilityStatus, TerritoryAvaibilityStatus } from '~/features/territories/ui/TerritoryAvaibilityStatus'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { geocode, type GeocodeResult } from '~/shared/infra/geocoder.server'
import logger from '~/shared/infra/logger.server'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatDistance } from '~/shared/utils/distance'
import { sortFromUrl } from '~/shared/utils/pagination.server'

import type { Route } from './+types/territories'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_new_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.TerritoriesManager)) {
    logger.warn(
      `Tried to load territories available for attribution. User ID: ${currentUser.id}. Does NOT have rights to manage territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Loading territories available for attribution. User ID: ${currentUser.id}.`)

  const canManageTerritories = permissions.has(Permission.TerritoriesManager)
  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const url = new URL(request.url)
    const selectors = computeFilters(url.searchParams)
    selectors.attributions = { none: { endDate: null } }

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

    const zips = await getZips(db, congregationId)

    const distancesByTerritoryId: Record<number, string | null> = {}
    if (proximityActive && 'distances' in result && result.distances != null) {
      for (const territory of result.territories) {
        const distance = result.distances.get(territory)
        distancesByTerritoryId[territory.id] = distance == null ? null : formatDistance(distance)
      }
    }

    const geocodeNotice: { kind: 'failed' | 'missing-query'; query?: string } | null =
      intent.forced && intent.geoQuery == null
        ? { kind: 'missing-query' }
        : intent.geoQuery != null && geocodeResult == null
          ? { kind: 'failed', query: intent.geoQuery }
          : null

    return {
      zips,
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

export default function TerritorySelectorPage({ loaderData }: Route.ComponentProps) {
  const {
    pagination,
    territories,
    zips,
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
  const dividerIndex = proximityActive ? territories.findIndex(t => distances[t.id] == null) : -1
  const baseCol = 5
  const colSpan = proximityActive ? baseCol + 1 : baseCol
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
        <ActiveTerritoryFilters chips={chips} />
        <GeocodeNotice notice={geocodeNotice} />
        <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

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
      <ActiveTerritoryFilters chips={chips} />
      <GeocodeNotice notice={geocodeNotice} />
      {geocodeResult != null && <ProximityBanner geocode={geocodeResult} />}
      <TerritoryFilters
        zips={zips}
        showZip
        showAccess
        showSearch
        showType
        showSort
        sortValue={sort}
        sortOptions={proximityActive ? ['number', 'proximity'] : ['number']}
      />

      <div className="flex grow flex-col gap-3">
        {wholePageWithoutCoords && <NoCoordinatesPageBanner count={withoutCoordsCount} />}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">{m.territories_table_number()}</TableHead>
              {proximityActive && (
                <TableHead className="w-[120px] text-right">{m.territories_filter_distance_header()}</TableHead>
              )}
              <TableHead className="w-[150px] text-center">{m.territories_table_type()}</TableHead>
              <TableHead className="w-[150px] text-center">{m.territories_table_content()}</TableHead>
              <TableHead className="w-[150px] text-center">{m.attributions_available_table_status()}</TableHead>
              <TableHead className="w-[150px] text-center" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {territories.map((territory, index) => {
              const distance = distances[territory.id]
              const showDivider = proximityActive && dividerIndex === index && index > 0
              return (
                <React.Fragment key={territory.id}>
                  {showDivider && <NoCoordinatesDivider count={withoutCoordsCount} colSpan={colSpan} />}
                  <TableRow>
                    <TableCell>{territory.number}</TableCell>
                    {proximityActive && (
                      <TableCell className="text-right tabular-nums text-foreground/80">
                        <span title={distance == null ? m.territories_filter_distance_unknown_tooltip() : undefined}>
                          {distance ?? '—'}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-center">{getTerritoryTypeLabel(territory.type)}</TableCell>
                    <TableCell className="text-center">
                      {territoryContentLabel(territory.type, territory.entrances)}
                    </TableCell>
                    <TableCell className="text-center">
                      <TerritoryAvaibilityStatus attribution={[...territory.attributions].shift()} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link
                            to={`/territories/territory/${territory.id}/view`}
                            title={m.attributions_available_view_title()}
                          >
                            <ExternalLink className="size-4" />
                          </Link>
                        </Button>
                        {checkAvailabilityStatus([...territory.attributions].shift()) ? (
                          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-primary">
                            <Link
                              to={`/territories/attributions/new?territory=${territory.id}`}
                              title={m.attributions_available_assign_title()}
                            >
                              <span className="max-sm:hidden">{m.attributions_available_assign_button()}</span>
                              <Send className="size-4 -rotate-12" />
                            </Link>
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled className="gap-1.5">
                            <span className="max-sm:hidden">{m.attributions_available_assign_button()}</span>
                            <Send className="size-4 -rotate-12" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
