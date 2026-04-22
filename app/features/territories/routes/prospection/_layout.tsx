import { Map as MapIcon, RefreshCw } from 'lucide-react'
import { Form, Link, NavLink, Outlet, redirect } from 'react-router'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { getZips } from '~/features/territories/server/buildings.server'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getSetting } from '~/shared/domain/settings.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.prospection_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canViewProspection = permissions.has(Role.ProspectionViewer)
  const canManageProspection = permissions.has(Role.ProspectionManager)
  const canManageTerritories = permissions.has(Role.TerritoriesManager)

  if (!canViewProspection) {
    throw redirect('/')
  }

  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const prospectionValidity = Number(
      (await getSetting(db, TerritorySettingKey.ProspectionValidity, congregationId)) ?? '0',
    )
    const staleDate = prospectionValidity > 0 ? new Date() : new Date(0)
    if (prospectionValidity > 0) staleDate.setMonth(staleDate.getMonth() - prospectionValidity)
    const inactiveStaleDate = prospectionValidity > 0 ? new Date() : new Date(0)
    if (prospectionValidity > 0) inactiveStaleDate.setMonth(inactiveStaleDate.getMonth() - prospectionValidity * 2)
    const warningDate = new Date()
    warningDate.setMonth(warningDate.getMonth() - 3)

    const totalBuildings = await db.building.count({ where: { congregationId } })
    const totalActiveBuildings = await db.building.count({ where: { active: true, congregationId } })
    const totalRemovedBuildings = await db.building.count({
      where: { inOpenData: false, active: true, congregationId },
    })
    const totalCreatedBuildings = await db.building.count({
      where: { inOpenData: true, active: true, prospectionDate: null, congregationId },
    })
    const totalStaleBuildings = await db.building.count({
      where: {
        congregationId,
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
      },
    })
    const banoUrl = await db.setting.findFirst({ where: { key: 'bano-url' } })
    const zips = await getZips(db, congregationId)

    return {
      zips,
      openDataAvailable: banoUrl?.value != null && banoUrl.value !== '',
      staleDate,
      canManageTerritories,
      canManageProspection,
      stats: {
        total: totalBuildings,
        active: totalActiveBuildings,
        removed: totalRemovedBuildings,
        stale: totalStaleBuildings,
        created: totalCreatedBuildings,
      },
    }
  })
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { openDataAvailable, stats, staleDate, canManageTerritories, zips, canManageProspection } = loaderData

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title={m.prospection_title()}
        subtitle={m.prospection_subtitle()}
        breadcrumbs={[{ label: m.sidebar_prospection() }]}
        actions={
          <>
            {canManageTerritories && (
              <Button variant="outline" size="icon" asChild>
                <Link to="../buildings/split-territories" title={m.prospection_split_tool_title()}>
                  <MapIcon className="size-4" />
                </Link>
              </Button>
            )}
            {canManageProspection && canManageTerritories && openDataAvailable && (
              <Form method="post" action="./sync">
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  title={m.prospection_sync_title()}
                  disabled={!openDataAvailable}
                >
                  <RefreshCw className={`size-4 ${openDataAvailable ? 'hover:animate-spin' : ''}`} />
                </Button>
              </Form>
            )}
            {canManageTerritories && (
              <Button asChild>
                <Link to="../building/new">{m.prospection_new_building_button()}</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap justify-around gap-3 rounded-lg border bg-muted/50 p-2">
        <NavLink
          to={'.'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title={m.prospection_active_buildings_title()}
          caseSensitive
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.active.toLocaleString()}</span>
          <span className="text-sm">{m.prospection_active_buildings()}</span>
        </NavLink>
        <NavLink
          to={'./all'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title={m.prospection_all_buildings_title()}
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.total.toLocaleString()}</span>
          <span className="text-sm">{m.prospection_all_buildings()}</span>
        </NavLink>
        <NavLink
          to={'./need-check'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title={m.prospection_need_check_title({ date: staleDate.toLocaleDateString() })}
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.stale.toLocaleString()}</span>
          <span className="text-sm">{m.prospection_need_check()}</span>
        </NavLink>
        {openDataAvailable && (
          <NavLink
            to={'./new'}
            className={({ isActive }) =>
              isActive
                ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
                : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
            }
            title={m.prospection_new_buildings_title()}
            end
          >
            <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.created.toLocaleString()}</span>
            <span className="text-sm">{m.prospection_new_buildings()}</span>
          </NavLink>
        )}
        {openDataAvailable && canManageTerritories && (
          <NavLink
            to="./missing"
            className={({ isActive }) =>
              isActive
                ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
                : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
            }
            title={m.prospection_destroyed_buildings_title()}
            end
          >
            <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.removed.toLocaleString()}</span>
            <span className="text-sm">{m.prospection_destroyed_buildings()}</span>
          </NavLink>
        )}
      </div>

      <TerritoryFilters
        action="/territories/buildings/all"
        zips={zips}
        showAccess
        showSearch
        showType
        showZip
        showShops
      />

      <div className="flex grow flex-col gap-3">
        <Outlet />
      </div>
    </div>
  )
}
