import { CalendarCheck, Lock, Pencil, Play, X } from 'lucide-react'
import React from 'react'
import { Form, Link, redirect, useSearchParams } from 'react-router'
import { getGroups } from '~/features/publishers/index.server'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { computeFilters } from '~/features/territories/server/attribution-filters.server'
import { findActiveAttributionsPaginated } from '~/features/territories/server/attributions.server'
import { listCampaigns } from '~/features/territories/server/campaign.queries'
import { classifySearch } from '~/features/territories/server/search-intent.server'
import { getCurrentTheocraticYear } from '~/features/territories/server/theocratic-year.server'
import AttributionFilters from '~/features/territories/ui/AttributionFilters'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import { buildAttributionFilterChips } from '~/features/territories/ui/build-filter-chips'
import GeocodeNotice, { type GeocodeNoticeData } from '~/features/territories/ui/GeocodeNotice'
import { NoCoordinatesDivider, NoCoordinatesPageBanner } from '~/features/territories/ui/NoCoordinatesNotice'
import ProximityBanner from '~/features/territories/ui/ProximityBanner'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { type GeocodeResult, geocode } from '~/shared/infra/geocoder.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatDistance } from '~/shared/utils/distance'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { sortFromUrl } from '~/shared/utils/pagination.server'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewTerritories = permissions.has(Permission.TerritoriesViewer)
  const canManagePublisher = permissions.has(Permission.PublisherManager)
  const canViewPublisher = permissions.has(Permission.PublisherViewer)
  const canManageTerritories = permissions.has(Permission.TerritoriesManager)
  const canViewProspection = permissions.has(Permission.ProspectionViewer)

  if (!canViewTerritories) {
    if (canViewProspection) {
      throw redirect('/territories/buildings')
    }

    logger.warn(
      `Tried to load territory attributions. User ID: ${currentUser.id}. Does NOT have rights to access territories.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading territory attributions. User ID: ${currentUser.id}. ${canManageTerritories ? 'Has' : 'Does NOT have'} rights to manage territories.`,
  )

  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    const url = new URL(request.url)
    const selectors = computeFilters(url.searchParams)
    selectors.endDate = null

    const search = url.searchParams.get('search') ?? ''
    const intent = classifySearch(search)

    let geocodeResult: GeocodeResult | null = null
    if (intent.geoQuery != null) {
      geocodeResult = await geocode(intent.geoQuery)
    }
    // Auto-flip to proximity sort when the geocode hit so a typed address is
    // ranked geographically by default. User can flip back via the Select.
    const defaultSort = geocodeResult != null ? 'proximity' : 'date'
    const sort = sortFromUrl(url, ['date', 'proximity'], defaultSort)
    const proximityActive = geocodeResult != null && sort === 'proximity'

    const proximityArgs =
      proximityActive && geocodeResult != null
        ? { origin: { lat: geocodeResult.lat, lng: geocodeResult.lng } }
        : undefined

    const result = await findActiveAttributionsPaginated(db, selectors, url, congregationId, proximityArgs)

    const groups = await getGroups(db, congregationId)
    const campaigns = (await listCampaigns(db, congregationId)).map(c => ({ id: c.id, name: c.name }))
    const theocraticYear = getCurrentTheocraticYear()

    const locale = getLocale()
    const distancesByAttributionId: Record<number, string | null> = {}
    if (proximityActive && 'distances' in result && result.distances != null) {
      for (const attribution of result.attributions) {
        const distance = result.distances.get(attribution)
        distancesByAttributionId[attribution.id] = distance == null ? null : formatDistance(distance, locale)
      }
    }

    const geocodeNotice: GeocodeNoticeData | null =
      intent.forced && intent.geoQuery == null
        ? { kind: 'missing-query' }
        : intent.geoQuery != null && geocodeResult == null
          ? { kind: 'failed', query: intent.geoQuery }
          : null

    return {
      stats: { total: result.pagination.total },
      attributions: result.attributions,
      pagination: result.pagination,
      canManageTerritories,
      canManagePublisher,
      canViewPublisher,
      groups,
      campaigns,
      phoneTypeActive,
      theocraticYear,
      geocodeResult,
      proximityActive,
      geocodeNotice,
      distances: distancesByAttributionId,
      withoutCoordsCount: (proximityActive && 'withoutCoordsCount' in result && result.withoutCoordsCount) || 0,
      withCoordsCount: (proximityActive && 'withCoordsCount' in result && result.withCoordsCount) || 0,
      sort,
    }
  })
}

export default function AttributionListPage({ loaderData }: Route.ComponentProps) {
  const {
    pagination,
    attributions,
    canManageTerritories,
    theocraticYear,
    groups,
    campaigns,
    phoneTypeActive,
    canViewPublisher,
    geocodeResult,
    proximityActive,
    geocodeNotice,
    distances,
    withoutCoordsCount,
    withCoordsCount,
    sort,
  } = loaderData
  const [searchParams] = useSearchParams()
  const chips = buildAttributionFilterChips(searchParams, { groups })
  const wholePageWithoutCoords = proximityActive && pagination.offset >= withCoordsCount && attributions.length > 0
  // Proximity sort already partitioned/ordered the rows server-side; the
  // status-priority client sort below is skipped in that mode so the distance
  // order survives.
  const sortedAttributions = proximityActive
    ? attributions
    : [...attributions].sort((attrA, attrB) => {
        const aIsOrphaned = attrA.publisher.leftAt != null || attrA.publisher.anonymizedAt != null
        const bIsOrphaned = attrB.publisher.leftAt != null || attrB.publisher.anonymizedAt != null
        if (aIsOrphaned && !bIsOrphaned) return -1
        if (!aIsOrphaned && bIsOrphaned) return 1

        const aIsLate = attrA.lateDate < new Date()
        const bIsLate = attrB.lateDate < new Date()
        if (aIsLate && !bIsLate) return -1
        if (!aIsLate && bIsLate) return 1

        return 0
      })
  const dividerIndex = proximityActive ? sortedAttributions.findIndex(a => distances[a.id] == null) : -1
  const baseColCount = 7
  const colSpan = proximityActive ? baseColCount + 1 : baseColCount

  if (attributions.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title={m.attributions_title()}
          subtitle={m.attributions_subtitle()}
          breadcrumbs={[{ label: m.sidebar_attributions() }]}
          actions={
            <>
              <S13ExportButton theocraticYear={theocraticYear} />
              {canManageTerritories && (
                <Button asChild>
                  <Link to="./new/available-territories">{m.attributions_assign_button()}</Link>
                </Button>
              )}
            </>
          }
        />

        <FilterChipBar chips={chips} />
        <GeocodeNotice notice={geocodeNotice} />
        <AttributionFilters groups={groups} campaigns={campaigns} phoneTypeActive={phoneTypeActive} />

        <EmptyState
          icon={CalendarCheck}
          title={m.attributions_empty_title()}
          description={m.attributions_empty_description()}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={m.attributions_title()}
        subtitle={m.attributions_subtitle()}
        breadcrumbs={[{ label: m.sidebar_attributions() }]}
        actions={
          <>
            <S13ExportButton theocraticYear={theocraticYear} />
            {canManageTerritories && (
              <Button asChild>
                <Link to="./new/available-territories">{m.attributions_assign_button()}</Link>
              </Button>
            )}
          </>
        }
      />

      <FilterChipBar chips={chips} />
      <GeocodeNotice notice={geocodeNotice} />
      {geocodeResult != null && <ProximityBanner geocode={geocodeResult} />}
      <AttributionFilters
        groups={groups}
        phoneTypeActive={phoneTypeActive}
        showSort
        sortValue={sort}
        sortOptions={proximityActive ? ['date', 'proximity'] : ['date']}
      />

      <div className="flex grow flex-col gap-3">
        {wholePageWithoutCoords && <NoCoordinatesPageBanner count={withoutCoordsCount} />}
        <div className="overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.attributions_table_checkout_date()}</TableHead>
                {proximityActive && (
                  <TableHead className="text-right">{m.territories_filter_distance_header()}</TableHead>
                )}
                <TableHead className="text-center">{m.attributions_table_number()}</TableHead>
                <TableHead className="text-center">{m.attributions_table_publisher()}</TableHead>
                <TableHead className="text-center max-sm:hidden">{m.attributions_table_type()}</TableHead>
                <TableHead className="text-center">{m.attributions_table_status()}</TableHead>
                <TableHead className="max-sm:hidden">{m.attributions_table_notes()}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">{m.common_actions()}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAttributions.map((attribution, index) => {
                const isAnonymized = attribution.publisher.anonymizedAt != null
                const hasLeft = attribution.publisher.leftAt != null
                const distance = distances[attribution.id]
                const showDivider = proximityActive && dividerIndex === index && index > 0
                return (
                  <React.Fragment key={attribution.id}>
                    {showDivider && <NoCoordinatesDivider count={withoutCoordsCount} colSpan={colSpan} />}
                    <TableRow>
                      <TableCell>
                        {attribution.startDate.toLocaleDateString('fr-FR')}{' '}
                        <span className="text-muted-foreground text-xs">
                          (
                          {m.attributions_days_count({
                            count: ((Date.now() - attribution.startDate.getTime()) / 3600 / 24 / 1000).toFixed(2),
                          })}
                          )
                        </span>
                      </TableCell>
                      {proximityActive && (
                        <TableCell className="text-right tabular-nums text-foreground/80">
                          <span title={distance == null ? m.territories_filter_distance_unknown_tooltip() : undefined}>
                            {distance ?? '—'}
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        <Link
                          to={`/territories/territory/${attribution.territoryId}/view`}
                          className="hover:text-primary"
                        >
                          {attribution.territory.number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        {isAnonymized ? (
                          <span
                            className="inline-flex items-center gap-1 text-muted-foreground italic"
                            title={m.attributions_publisher_anonymized_tooltip()}
                          >
                            <Lock className="size-3" aria-hidden="true" />—
                          </span>
                        ) : hasLeft ? (
                          canViewPublisher ? (
                            <Link
                              to={`/publishers/${attribution.publisherId}/view`}
                              className="text-muted-foreground line-through hover:text-primary"
                              title={m.attributions_publisher_left_tooltip()}
                            >
                              {formatPersonName(attribution.publisher)}
                            </Link>
                          ) : (
                            <span
                              className="text-muted-foreground line-through"
                              title={m.attributions_publisher_left_tooltip()}
                            >
                              {formatPersonName(attribution.publisher)}
                            </span>
                          )
                        ) : canViewPublisher ? (
                          <Link to={`/publishers/${attribution.publisherId}/view`} className="hover:text-primary">
                            {formatPersonName(attribution.publisher)}
                          </Link>
                        ) : (
                          formatPersonName(attribution.publisher)
                        )}
                      </TableCell>
                      <TableCell className="text-center max-sm:hidden">
                        {attribution.campaignId != null
                          ? m.attributions_type_campaign()
                          : attribution.type === TerritoryAttributionKind.Phone
                            ? m.attributions_type_phone()
                            : m.attributions_type_default()}
                      </TableCell>
                      <TableCell className="text-center">
                        <AttributionStatus attribution={attribution} publisher={attribution.publisher} />
                      </TableCell>
                      <TableCell className="max-sm:hidden">
                        {attribution.notes.length > 0 ? attribution.notes : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManageTerritories && (
                            <>
                              <Button variant="ghost" size="icon" asChild>
                                <Link to={`./${attribution.id}/edit`}>
                                  <Pencil className="size-4" />
                                </Link>
                              </Button>
                              {attribution.pausedAt != null && attribution.endDate == null && (
                                <Form method="post" action={`/territories/attributions/${attribution.id}/resume`}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    type="submit"
                                    title={m.attributions_resume_button()}
                                  >
                                    <Play className="size-4" />
                                  </Button>
                                </Form>
                              )}
                              {attribution.endDate == null && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  asChild
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Link
                                    to={`/territories/attributions/${attribution.id}/delete`}
                                    title={m.attributions_cancel_title()}
                                  >
                                    <X className="size-4" />
                                  </Link>
                                </Button>
                              )}
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
