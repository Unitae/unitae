import { Map as MapIcon, RefreshCw } from 'lucide-react'
import { data, Form, Link, NavLink, Outlet, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { getSetting } from '~/features/settings/server/settings'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { getZips } from '~/features/territories/server/buildings'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import { db } from '~/shared/libs/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Propection - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, can } = await authenticateAndAuthorize(request, [Role.ProspectionViewer, Role.ProspectionManager, Role.TerritoriesManager])
  const canViewProspection = can(Role.ProspectionViewer)
  const canManageProspection = can(Role.ProspectionManager)
  const canManageTerritories = can(Role.TerritoriesManager)

  if (!canViewProspection) {
    throw redirect('/')
  }

  const prospectionValidity = Number(await getSetting(TerritorySettingKey.ProspectionValidity) ?? '0')
  const staleDate = prospectionValidity > 0 ? new Date() : new Date(0)
  if (prospectionValidity > 0) staleDate.setMonth(staleDate.getMonth() - prospectionValidity)
  const inactiveStaleDate = prospectionValidity > 0 ? new Date() : new Date(0)
  if (prospectionValidity > 0) inactiveStaleDate.setMonth(inactiveStaleDate.getMonth() - prospectionValidity * 2)
  const warningDate = new Date()
  warningDate.setMonth(warningDate.getMonth() - 3)

  const totalBuildings = await db.building.count()
  const totalActiveBuildings = await db.building.count({ where: { active: true } })
  const totalRemovedBuildings = await db.building.count({ where: { inOpenData: false, active: true } })
  const totalCreatedBuildings = await db.building.count({
    where: { inOpenData: true, active: true, prospectionDate: null },
  })
  const totalStaleBuildings = await db.building.count({
    where: {
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
    },
  })
  const banoUrl = await db.setting.findFirst({ where: { key: 'bano-url' } })
  const messages = { success: session.get('success'), error: session.get('error') }
  const zips = await getZips()

  return data(
    {
      zips,
      messages,
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
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { messages, openDataAvailable, stats, staleDate, canManageTerritories, zips, canManageProspection } = loaderData

  return (
    <div className="flex flex-col gap-7">
      <AlertMessages messages={messages} />
      <PageHeader
        title="Prospection"
        subtitle="Liste des bâtiments du territoire de l'assemblée locale"
        actions={
          <>
            {canManageTerritories && (
              <Button variant="outline" size="icon" asChild>
                <Link to="../buildings/split-territories" title="Accéder à l'outil de découpage des territoires">
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
                  title="Mettre à jour les données à partir du cadastre"
                  disabled={!openDataAvailable}
                >
                  <RefreshCw className={`size-4 ${openDataAvailable ? 'hover:animate-spin' : ''}`} />
                </Button>
              </Form>
            )}
            {canManageTerritories && (
              <Button asChild>
                <Link to="../building/new">Nouveau batiment</Link>
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
          title="Tous les batiments actifs et donc disponibles pour la prédication."
          caseSensitive
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.active.toLocaleString()}</span>
          <span className="text-sm">batiments actifs</span>
        </NavLink>
        <NavLink
          to={'./all'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title="Tous les batiments enregistrés dans la base de données."
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.total.toLocaleString()}</span>
          <span className="text-sm">batiments enregistrés</span>
        </NavLink>
        <NavLink
          to={'./need-check'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
          }
          title={`Batiments qui ont été prospecté avant le ${staleDate.toLocaleDateString()}. À prospecter de nouveau.`}
          end
        >
          <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.stale.toLocaleString()}</span>
          <span className="text-sm">batiments à vérifier</span>
        </NavLink>
        {openDataAvailable && (
          <NavLink
            to={'./new'}
            className={({ isActive }) =>
              isActive
                ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-background p-4 text-center shadow-sm'
                : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-muted-foreground hover:text-foreground'
            }
            title="Batiments de la Base d'Adresses Nationale Ouverte qui n'ont jamais été prospecté."
            end
          >
            <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.created.toLocaleString()}</span>
            <span className="text-sm">nouveaux batiments</span>
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
            title="Batiments absents de la Base d'Adresses Nationale Ouverte."
            end
          >
            <span className="font-black font-display text-5xl max-sm:text-3xl">{stats.removed.toLocaleString()}</span>
            <span className="text-sm">batiments détruits</span>
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
