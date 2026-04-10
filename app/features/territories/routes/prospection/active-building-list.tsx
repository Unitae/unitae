import { Eye, Search } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { findBuildingsPaginated, getProspectionStaleDate } from '~/features/territories/server/buildings'
import { BuildingStatus } from '~/features/territories/ui/BuildingStatus'
import { Button } from '~/shared/ui/button'

import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/active-building-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiments actifs - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.ProspectionViewer, Role.ProspectionManager, Role.TerritoriesManager])
  const canViewProspection = can(Role.ProspectionViewer)
  const canManageProspection = can(Role.ProspectionManager)
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canViewProspection) {
    throw redirect('/')
  }

  const url = new URL(request.url)
  const staleDate = await getProspectionStaleDate()
  const { buildings, pagination } = await findBuildingsPaginated({ active: true }, url)

  return {
    buildings,
    pagination,
    staleDate,
    canManageTerritories,
    canViewProspection,
    canManageProspection,
  }
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { buildings, pagination, staleDate, canManageProspection, canViewProspection } = loaderData

  if (buildings.length < 1) {
    return (
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
        <p>Il n'y a aucun batiment actif pour le moment !</p>
        <p>
          Pour ajouter des batiments utilisez le bouton "Nouveau batiment" ou lancez une synchronisation avec la{' '}
          <em>Base d'Adresses Nationale Ouverte</em> fournie par l'état.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code Postal</TableHead>
              <TableHead>Rue</TableHead>
              <TableHead className="text-center">Nº</TableHead>
              <TableHead className="text-center">Statut</TableHead>
              <TableHead className="text-center max-sm:hidden">Latitude</TableHead>
              <TableHead className="text-center max-sm:hidden">Longitude</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Actions</span>
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
                        <Link to={`../building/${building.id}/view`}>
                          <Eye className="size-4" />
                        </Link>
                      </Button>
                    )}
                    {canManageProspection && (
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`../building/${building.id}/edit-prospection`} relative="path">
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
