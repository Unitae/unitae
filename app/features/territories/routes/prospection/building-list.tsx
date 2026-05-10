import { Eye, Search } from 'lucide-react'
import { Link } from 'react-router'
import { computeFilters } from '~/features/territories/server/building-filters.server'
import { findBuildingsPaginated, getProspectionStaleDate } from '~/features/territories/server/buildings.server'
import { BuildingStatus } from '~/features/territories/ui/BuildingStatus'
import * as m from '~/i18n/paraglide/messages'
import {
  permissionsContext,
  requirePermission,
  currentAccountContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/building-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_all_buildings_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.ProspectionViewer)

  const canManageTerritories = permissions.has(Permission.TerritoriesManager)
  const canManageProspection = permissions.has(Permission.ProspectionManager)
  const canViewProspection = permissions.has(Permission.ProspectionViewer)
  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const url = new URL(request.url)
    const selectors = computeFilters(url.searchParams)
    const staleDate = await getProspectionStaleDate(db)
    const { buildings, pagination } = await findBuildingsPaginated(db, selectors, url, congregationId)

    return {
      buildings,
      pagination,
      staleDate,
      canManageTerritories,
      canManageProspection,
      canViewProspection,
    }
  })
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { buildings, pagination, staleDate, canViewProspection, canManageProspection } = loaderData

  if (buildings.length < 1) {
    return (
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
        <p>{m.prospection_empty_buildings()}</p>
        <p>{m.prospection_empty_buildings_hint({ bano: m.prospection_bano_name() })}</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.prospection_table_zip()}</TableHead>
              <TableHead>{m.prospection_table_street()}</TableHead>
              <TableHead className="text-center">{m.prospection_table_number()}</TableHead>
              <TableHead className="text-center">{m.prospection_table_status()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.prospection_table_latitude()}</TableHead>
              <TableHead className="text-center max-sm:hidden">{m.prospection_table_longitude()}</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">{m.common_actions()}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buildings.map(building => (
              <TableRow key={building.id}>
                <TableCell>{building.zip}</TableCell>
                <TableCell>{building.street}</TableCell>
                <TableCell className="text-center">{building.number}</TableCell>
                <TableCell className="text-center">
                  <BuildingStatus building={building} options={{ staleDate }} />
                </TableCell>
                <TableCell className="text-center max-sm:hidden">{building.latitude ?? '?'}</TableCell>
                <TableCell className="text-center max-sm:hidden">{building.longitude ?? '?'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canViewProspection && (
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`../../building/${building.id}/view`} relative="path">
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                    )}
                    {canManageProspection && (
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`../../building/${building.id}/edit-prospection`} relative="path">
                          <Search className="size-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
    </>
  )
}
