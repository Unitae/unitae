import { Eye, Search } from 'lucide-react'
import { Link, redirect } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getSetting } from '~/features/settings/server/settings'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { findBuildingsWithEntrancePaginated } from '~/features/territories/server/buildings'
import { BuildingCheckReason } from '~/features/territories/ui/BuildingCheckReason'
import { BuildingStatus } from '~/features/territories/ui/BuildingStatus'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'

import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/need-check-building-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiments à prospecter - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canViewProspection = await verifyRole(request, Role.ProspectionViewer)
  const canManageProspection = await verifyRole(request, Role.ProspectionManager)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canViewProspection) {
    throw redirect('/')
  }

  const prospectionValidity = await getSetting(TerritorySettingKey.ProspectionValidity)
  const staleDate = new Date()
  staleDate.setMonth(staleDate.getMonth() - Number(prospectionValidity ?? '0'))
  const inactiveStaleDate = new Date()
  inactiveStaleDate.setMonth(inactiveStaleDate.getMonth() - Number(prospectionValidity ?? '0') * 2)
  const warningDate = new Date()
  warningDate.setMonth(warningDate.getMonth() - 3)

  const selector: Prisma.BuildingWhereInput = {
    // biome-ignore lint/style/useNamingConvention: OR is a keywork for prisma ORM
    OR: [
      {
        prospectionDate: {
          lt: staleDate,
        },
        active: true,
      },
      {
        prospectionDate: {
          lt: inactiveStaleDate,
        },
        active: false,
        inTerritory: true,
      },
      {
        entrance: { access: TerritoryAccess.Intercom },
        homes: { equals: null },
        inTerritory: true,
      },
      {
        entrance: { access: TerritoryAccess.Doorbell },
        homes: { equals: null },
        inTerritory: true,
      },
      {
        entrance: { access: TerritoryAccess.Code, isOpenEarly: true },
        homes: { equals: null },
        inTerritory: true,
      },
      {
        entrance: { access: TerritoryAccess.Code, isOpenEarly: false },
        phones: { equals: null },
        inTerritory: true,
      },
      {
        inTerritory: false,
        active: true,
        createdAt: {
          lt: warningDate,
        },
      },
      {
        inTerritory: true,
        homes: { gt: 0 },
        entrance: {
          access: {
            equals: null,
          },
        },
      },
    ],
  }

  const url = new URL(request.url)
  const { buildings, pagination } = await findBuildingsWithEntrancePaginated(selector, url)

  return {
    buildings,
    pagination,
    staleDate,
    canManageTerritories,
    canManageProspection,
    canViewProspection,
  }
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { buildings, pagination, staleDate, canManageProspection, canViewProspection } = loaderData

  if (buildings.length < 1) {
    return (
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
        <p>Il n'y a aucun batiment à vérifier pour le moment !</p>
        <p>
          Les batiments sont soit tous à jour, soit certains sont neufs dans notre application. Vous pouvez les
          retrouver dans la liste des nouveaux batiments.
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
              <TableHead>Raisons</TableHead>
              <TableHead className="text-center">Statut</TableHead>
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
                <TableCell>
                  <BuildingCheckReason building={building} options={{ staleDate }} />
                </TableCell>
                <TableCell className="text-center">
                  <BuildingStatus building={building} options={{ staleDate }} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canViewProspection && (
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`../../building/${building.id}/view`}>
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
