import { Download, Map as MapIcon, Pencil, Trash2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { getZips } from '~/features/territories/server/buildings.server'
import { findTerritoriesWithDetailsPaginated } from '~/features/territories/server/territories.server'
import { territoryContentLabel } from '~/features/territories/server/territory-content-label'
import { computeFilters } from '~/features/territories/server/territory-filters.server'

import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/i18n/paraglide/messages'
import {
  permissionsContext,
  requirePermission,
  currentAccountContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

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
    const selectors = await computeFilters(url.searchParams)
    const { territories, pagination } = await findTerritoriesWithDetailsPaginated(db, selectors, url, congregationId)

    const zips = await getZips(db, congregationId)

    return {
      zips,
      stats: {
        total: pagination.total,
      },
      territories,
      pagination,
      canManageTerritories,
    }
  })
}

export default function TerritoryListPage({ loaderData }: Route.ComponentProps) {
  const { pagination, territories, canManageTerritories, zips } = loaderData
  const [searchParams] = useSearchParams()
  const fromQuery = searchParams.toString()
  const viewSuffix = fromQuery.length > 0 ? `?from=${encodeURIComponent(fromQuery)}` : ''

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

      <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

      <div className="flex grow flex-col gap-3">
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.territories_table_number()}</TableHead>
                <TableHead className="text-center">{m.territories_table_type()}</TableHead>
                <TableHead className="text-center">{m.territories_table_content()}</TableHead>
                <TableHead>{m.territories_table_assigned_to()}</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {territories.map(territory => {
                const attribution = [...territory.attributions].shift()
                const viewHref = `./territory/${territory.id}/view${viewSuffix}`

                return (
                  <TableRow key={territory.id} className="group relative cursor-pointer hover:bg-accent/30">
                    <TableCell>
                      <Link
                        to={viewHref}
                        className="absolute inset-0 z-0"
                        aria-label={m.territories_view_row_link({ number: territory.number })}
                      />
                      <span className="relative font-medium">{territory.number}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="relative">{territoryTypeLabels[territory.type] ?? territory.type}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="relative">{territoryContentLabel(territory.type, territory.entrances)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="relative">
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
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="relative z-10 flex items-center justify-end gap-1">
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
                              <Link to={`./territory/${territory.id}/delete`} title={m.territories_delete_title_attr()}>
                                <Trash2 className="size-4" />
                              </Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
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
