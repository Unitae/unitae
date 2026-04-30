import { CalendarCheck, Pencil, X } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { getGroups } from '~/features/publishers/server/groups.server'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { computeFilters } from '~/features/territories/server/attribution-filters.server'
import { findActiveAttributionsPaginated } from '~/features/territories/server/attributions.server'
import { getCurrentTheocraticYear } from '~/features/territories/server/theocratic-year.server'
import AttributionFilters from '~/features/territories/ui/AttributionFilters'
import { AttributionStatus } from '~/features/territories/ui/AttributionStatus'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import S13ExportButton from '~/shared/ui/S13ExportButton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_meta_title() }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewTerritories = permissions.has(Role.TerritoriesViewer)
  const canManagePublisher = permissions.has(Role.PublisherManager)
  const canViewPublisher = permissions.has(Role.PublisherViewer)
  const canManageTerritories = permissions.has(Role.TerritoriesManager)
  const canViewProspection = permissions.has(Role.ProspectionViewer)

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

    const { attributions, pagination } = await findActiveAttributionsPaginated(db, selectors, url, congregationId)

    const groups = await getGroups(db, congregationId)
    const theocraticYear = getCurrentTheocraticYear()

    return {
      stats: {
        total: pagination.total,
      },
      attributions,
      pagination,
      canManageTerritories,
      canManagePublisher,
      canViewPublisher,
      groups,
      phoneTypeActive,
      theocraticYear,
    }
  })
}

export default function AttributionListPage({ loaderData }: Route.ComponentProps) {
  const { pagination, attributions, canManageTerritories, theocraticYear, groups, phoneTypeActive, canViewPublisher } =
    loaderData

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

        <AttributionFilters groups={groups} phoneTypeActive={phoneTypeActive} />

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

      <AttributionFilters groups={groups} phoneTypeActive={phoneTypeActive} />

      <div className="flex grow flex-col gap-3">
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.attributions_table_checkout_date()}</TableHead>
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
              {[...attributions]
                .sort((attrA, attrB) => {
                  const aIsLate = attrA.lateDate == null || attrA.lateDate < new Date()
                  const bIsLate = attrB.lateDate == null || attrB.lateDate < new Date()
                  if (aIsLate && !bIsLate) {
                    return -1
                  }

                  if (!aIsLate && bIsLate) {
                    return 1
                  }

                  return 0
                })
                .map(attribution => (
                  <TableRow key={attribution.id}>
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
                    <TableCell className="text-center">
                      <Link
                        to={`/territories/territory/${attribution.territoryId}/view`}
                        className="hover:text-primary"
                      >
                        {attribution.territory.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      {canViewPublisher ? (
                        <Link to={`/publishers/${attribution.publisherId}/view`} className="hover:text-primary">
                          {attribution.publisher.lastname?.toLocaleUpperCase()} {attribution.publisher.firstname}
                        </Link>
                      ) : (
                        <>
                          {attribution.publisher.lastname?.toLocaleUpperCase()} {attribution.publisher.firstname}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-center max-sm:hidden">
                      {attribution.type === TerritoryAttributionKind.Default && m.attributions_type_default()}
                      {attribution.type === TerritoryAttributionKind.Campaign && m.attributions_type_campaign()}
                      {attribution.type === TerritoryAttributionKind.Phone && m.attributions_type_phone()}
                    </TableCell>
                    <TableCell className="text-center">
                      <AttributionStatus attribution={attribution} />
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
                ))}
            </TableBody>
          </Table>
        </div>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
