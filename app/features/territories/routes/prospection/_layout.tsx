import { ArrowPathIcon, MapIcon } from '@heroicons/react/24/outline'
import { data, Form, Link, NavLink, Outlet, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getSetting } from '~/features/settings/server/settings'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import { getZips } from '~/features/territories/server/buildings'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import { db } from '~/shared/libs/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { HeroHeader } from '~/shared/ui/HeroHeader'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Propection - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await verifySession(request)
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
      <HeroHeader
        title="Prospection"
        subtitle="Liste des bâtiments du territoire de l'assemblée locale"
        actions={
          <>
            {canManageTerritories && (
              <Link
                to="../buildings/split-territories"
                title="Accéder à l'outil de découpage des territoires"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                <MapIcon className="inline size-6 max-sm:size-5" />
              </Link>
            )}
            {canManageProspection && canManageTerritories && openDataAvailable && (
              <Form method="post" action="./sync">
                <button
                  type="submit"
                  title="Mettre à jour les données à partir du cadastre"
                  className={
                    openDataAvailable
                      ? 'rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2'
                      : 'cursor-not-allowed rounded-lg bg-teal-600 p-3 font-semibold text-white opacity-50'
                  }
                  disabled={!openDataAvailable}
                >
                  <ArrowPathIcon
                    className={`inline size-6 max-sm:size-5 ${openDataAvailable ? 'hover:animate-spin' : ''}`}
                  />
                </button>
              </Form>
            )}
            {canManageTerritories && (
              <Link
                to="../building/new"
                title="Créer manuellement un nouveau batiment"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                Nouveau batiment
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-wrap justify-around gap-5 rounded-md bg-gray-200 p-2 max-sm:gap-3 max-sm:text-sm max-md:justify-between dark:bg-gray-900">
        <NavLink
          to={'.'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-gray-700 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
          }
          title="Tous les batiments actifs et donc disponibles pour la prédication."
          caseSensitive
          end
        >
          <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
            {stats.active.toLocaleString()}
          </span>
          batiments actifs
        </NavLink>
        <NavLink
          to={'./all'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-gray-700 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
          }
          title="Tous les batiments enregistrés dans la base de données. Permet de retrouver des batiments qui ont été désactivés précédement."
          end
        >
          <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
            {stats.total.toLocaleString()}
          </span>
          batiments enregistrés
        </NavLink>
        <NavLink
          to={'./need-check'}
          className={({ isActive }) =>
            isActive
              ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
              : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-gray-700 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
          }
          title={`Batiments qui ont été prospecté avant le ${staleDate.toLocaleDateString()}. À prospecter de nouveau.`}
          end
        >
          <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
            {stats.stale.toLocaleString()}
          </span>
          batiments à vérifier
        </NavLink>
        {openDataAvailable && (
          <NavLink
            to={'./new'}
            className={({ isActive }) =>
              isActive
                ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
                : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-gray-700 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
            }
            title="Batiments de la Base d'Adresses Nationale Ouverte qui n'ont jamais été prospecté. Potentielement des batiments qui viennent d'être construits."
            end
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
              {stats.created.toLocaleString()}
            </span>
            nouveaux batiments
          </NavLink>
        )}
        {openDataAvailable && canManageTerritories && (
          <NavLink
            to="./missing"
            className={({ isActive }) =>
              isActive
                ? 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md bg-white p-4 text-center text-gray-700 dark:bg-gray-950 dark:text-white'
                : 'flex shrink grow flex-col items-center justify-center gap-1 rounded-md p-4 text-center text-gray-700 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white'
            }
            title="Batiments absents de la Base d'Adresses Nationale Ouverte. Potentiellement des batiments qui viennent d'être détruits."
            end
          >
            <span className="font-black text-6xl max-sm:font-extrabold max-sm:text-3xl">
              {stats.removed.toLocaleString()}
            </span>
            batiments détruits
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
