import { Download, Map as MapIcon, Pencil, Trash2 } from 'lucide-react'
import React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { getZips } from '~/features/territories/server/buildings.server'
import { classifySearch } from '~/features/territories/server/search-intent.server'
import { findTerritoriesWithDetailsPaginated } from '~/features/territories/server/territories.server'
import { territoryContentLabel } from '~/features/territories/server/territory-content-label'
import { computeFilters } from '~/features/territories/server/territory-filters.server'

import { buildTerritoryFilterChips } from '~/features/territories/ui/build-filter-chips'
import GeocodeNotice, { type GeocodeNoticeData } from '~/features/territories/ui/GeocodeNotice'
import { NoCoordinatesDivider, NoCoordinatesPageBanner } from '~/features/territories/ui/NoCoordinatesNotice'
import ProximityBanner from '~/features/territories/ui/ProximityBanner'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { type GeocodeResult, geocode } from '~/shared/infra/geocoder.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatDistance } from '~/shared/utils/distance'
import { sortFromUrl } from '~/shared/utils/pagination.server'

import type { Route } from './+types/list'

const territoryTypeLabels: Record<string, string> = {
  [TerritoryKind.Classical]: m.territories_type_classical(),
  [TerritoryKind.Commerces]: m.territories_type_commerces(),
  [TerritoryKind.Phone]: m.territories_type_phone(),
  [TerritoryKind.Hotel]: m.territories_type_hotel(),
  [TerritoryKind.Univ]: m.territories_type_university(),
}

export const meta: Route.MetaFunction = () => {
  return [{ title: m.territories_list_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesViewer)

  const canManageTerritories = permissions.has(Permission.TerritoriesManager)

  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const url = new URL(request.url)
    const selectors = computeFilters(url.searchParams)
    const search = url.searchParams.get('search') ?? ''
    const intent = classifySearch(search)

    let geocodeResult: GeocodeResult | null = null
    if (intent.geoQuery != null) {
      geocodeResult = await geocode(intent.geoQuery)
    }
    // When the geocode hits, default the sort to `proximity` so a typed
    // address is ranked geographically by default. The user can still flip
    // to `number` via the Select — `sortFromUrl` whitelists either value.
    const defaultSort = geocodeResult != null ? 'proximity' : 'number'
    const sort = sortFromUrl(url, ['number', 'proximity'], defaultSort)
    const proximityActive = geocodeResult != null && sort === 'proximity'

    const proximityArgs =
      proximityActive && geocodeResult != null
        ? { origin: { lat: geocodeResult.lat, lng: geocodeResult.lng } }
        : undefined

    const result = await findTerritoriesWithDetailsPaginated(db, selectors, url, congregationId, proximityArgs)

    const zips = await getZips(db, congregationId)

    const locale = getLocale()
    const distancesByTerritoryId: Record<number, string | null> = {}
    if (proximityActive && 'distances' in result && result.distances != null) {
      for (const territory of result.territories) {
        const distance = result.distances.get(territory)
        distancesByTerritoryId[territory.id] = distance == null ? null : formatDistance(distance, locale)
      }
    }

    // Build the failure notice the UI renders above the filters: tells the
    // user *why* proximity didn't kick in, instead of silently degrading to
    // text-only.
    const geocodeNotice: GeocodeNoticeData | null =
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
      // Banner shows whenever the geocode hit; distance column / partition
      // are separately gated on `proximityActive`.
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

export default function TerritoryListPage({ loaderData }: Route.ComponentProps) {
  const {
    pagination,
    territories,
    canManageTerritories,
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
  const navigate = useNavigate()
  const fromQuery = searchParams.toString()
  const viewSuffix = fromQuery.length > 0 ? `?from=${encodeURIComponent(fromQuery)}` : ''
  const chips = buildTerritoryFilterChips(searchParams)
  const colSpan = proximityActive ? 6 : 5
  // Index of the first item in this page that falls in the "without coords"
  // partition, so we can insert a divider row before it. -1 when the whole
  // page is on one side of the partition.
  const dividerIndex = proximityActive ? territories.findIndex(t => distances[t.id] == null) : -1
  // True when *every* row on this page is past the coords/no-coords boundary
  // — the in-table divider never renders, so we show a banner above the table
  // so users understand why distances are missing.
  const wholePageWithoutCoords = proximityActive && pagination.offset >= withCoordsCount && territories.length > 0

  if (territories.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title={m.territories_title()}
          subtitle={m.territories_subtitle()}
          breadcrumbs={[{ label: m.sidebar_territories() }]}
          actions={
            canManageTerritories && (
              <Button asChild>
                <Link to="./territory/new">{m.territories_new_button()}</Link>
              </Button>
            )
          }
        />

        <FilterChipBar chips={chips} />
        <GeocodeNotice notice={geocodeNotice} />
        <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

        <EmptyState
          icon={MapIcon}
          title={m.territories_empty_title()}
          description={m.territories_empty_description()}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={m.territories_title()}
        subtitle={m.territories_subtitle()}
        breadcrumbs={[{ label: m.sidebar_territories() }]}
        actions={
          canManageTerritories && (
            <Button asChild>
              <Link to="./territory/new">{m.territories_new_button()}</Link>
            </Button>
          )
        }
      />

      <FilterChipBar chips={chips} />
      <GeocodeNotice notice={geocodeNotice} />
      {geocodeResult != null && <ProximityBanner geocode={geocodeResult} />}
      <TerritoryFilters
        zips={zips}
        showAccess
        showSearch
        showType
        showZip
        showSort
        sortValue={sort}
        sortOptions={proximityActive ? ['number', 'proximity'] : ['number']}
      />

      <div className="flex grow flex-col gap-3">
        {wholePageWithoutCoords && <NoCoordinatesPageBanner count={withoutCoordsCount} />}
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.territories_table_number()}</TableHead>
                {proximityActive && (
                  <TableHead className="text-right">{m.territories_filter_distance_header()}</TableHead>
                )}
                <TableHead className="text-center">{m.territories_table_type()}</TableHead>
                <TableHead className="text-center">{m.territories_table_content()}</TableHead>
                <TableHead>{m.territories_table_assigned_to()}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {territories.map((territory, index) => {
                const attribution = [...territory.attributions].shift()
                const viewHref = `./territory/${territory.id}/view${viewSuffix}`
                const distance = distances[territory.id]
                const showDivider = proximityActive && dividerIndex === index && index > 0

                return (
                  <React.Fragment key={territory.id}>
                    {showDivider && <NoCoordinatesDivider count={withoutCoordsCount} colSpan={colSpan} />}
                    <TableRow
                      data-testid="territory-row"
                      className="group cursor-pointer hover:bg-accent/30"
                      onClick={event => {
                        if (event.defaultPrevented) return
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                        if ((event.target as HTMLElement).closest('a, button, [role="button"]')) return
                        navigate(viewHref)
                      }}
                    >
                      <TableCell>
                        <Link
                          to={viewHref}
                          className="font-medium hover:underline"
                          aria-label={m.territories_view_row_link({ number: territory.number })}
                        >
                          {territory.number}
                        </Link>
                      </TableCell>
                      {proximityActive && (
                        <TableCell className="text-right tabular-nums text-foreground/80">
                          <span title={distance == null ? m.territories_filter_distance_unknown_tooltip() : undefined}>
                            {distance ?? '—'}
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        {territoryTypeLabels[territory.type] ?? territory.type}
                      </TableCell>
                      <TableCell className="text-center">
                        {territoryContentLabel(territory.type, territory.entrances)}
                      </TableCell>
                      <TableCell>
                        {attribution ? (
                          <span className={attribution.lateDate < new Date() ? 'text-destructive' : ''}>
                            {attribution.publisher.firstname} {attribution.publisher.lastname?.toUpperCase().at(0)}.
                            {' — '}
                            {m.territories_assigned_until({
                              date: attribution.lateDate.toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: '2-digit',
                              }),
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{m.territories_available()}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" asChild>
                            <a
                              href={`/territories/territory/${territory.id}/pdf`}
                              title={m.territories_download_pdf_title()}
                            >
                              <Download className="size-4" />
                            </a>
                          </Button>
                          {canManageTerritories && (
                            <>
                              <Button variant="ghost" size="icon" asChild>
                                <Link to={`./territory/${territory.id}/edit`} title={m.territories_edit_title_attr()}>
                                  <Pencil className="size-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                className="text-destructive hover:text-destructive max-sm:hidden"
                              >
                                <Link
                                  to={`./territory/${territory.id}/delete`}
                                  title={m.territories_delete_title_attr()}
                                >
                                  <Trash2 className="size-4" />
                                </Link>
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
