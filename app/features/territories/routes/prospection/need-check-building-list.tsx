import { Eye, Search } from 'lucide-react'
import { Link, redirect } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { Role } from '~/shared/types/role'
import { getSetting } from '~/shared/domain/settings.server'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { findBuildingsWithEntrancePaginated } from '~/features/territories/server/buildings.server'
import { BuildingCheckReason } from '~/features/territories/ui/BuildingCheckReason'
import { BuildingStatus } from '~/features/territories/ui/BuildingStatus'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'

import Pagination from '~/shared/ui/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import type { Route } from './+types/need-check-building-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_need_check_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProspectionViewer,
    Role.ProspectionManager,
    Role.TerritoriesManager,
  ])
  const canViewProspection = can(Role.ProspectionViewer)
  const canManageProspection = can(Role.ProspectionManager)
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canViewProspection) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const prospectionValidity = Number(
      (await getSetting(db, TerritorySettingKey.ProspectionValidity, congregationId)) ?? '0',
    )
    const staleDate = prospectionValidity > 0 ? new Date() : new Date(0)
    if (prospectionValidity > 0) staleDate.setMonth(staleDate.getMonth() - prospectionValidity)
    const inactiveStaleDate = prospectionValidity > 0 ? new Date() : new Date(0)
    if (prospectionValidity > 0) inactiveStaleDate.setMonth(inactiveStaleDate.getMonth() - prospectionValidity * 2)
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
          entrances: { some: { access: TerritoryAccess.Intercom, homes: { equals: null } } },
          inTerritory: true,
        },
        {
          entrances: { some: { access: TerritoryAccess.Doorbell, homes: { equals: null } } },
          inTerritory: true,
        },
        {
          entrances: { some: { access: TerritoryAccess.Code, isOpenEarly: true, homes: { equals: null } } },
          inTerritory: true,
        },
        {
          entrances: { some: { access: TerritoryAccess.Code, isOpenEarly: false, phones: { equals: null } } },
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
          entrances: {
            some: {
              homes: { gt: 0 },
              access: { equals: null },
            },
          },
        },
      ],
    }

    const url = new URL(request.url)
    const { buildings, pagination } = await findBuildingsWithEntrancePaginated(db, selector, url, congregationId)

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
  const { buildings, pagination, staleDate, canManageProspection, canViewProspection } = loaderData

  if (buildings.length < 1) {
    return (
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
        <p>{m.prospection_empty_need_check()}</p>
        <p>{m.prospection_empty_need_check_hint()}</p>
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
              <TableHead>{m.prospection_table_reasons()}</TableHead>
              <TableHead className="text-center">{m.prospection_table_status()}</TableHead>
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
