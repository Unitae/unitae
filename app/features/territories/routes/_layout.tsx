import { BuildingOffice2Icon, CalendarDateRangeIcon, ChartPieIcon, MapIcon } from '@heroicons/react/24/outline'
import { Link, Outlet, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { MainNavigation } from '~/shared/ui/MainNavigation'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Territoires - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)
  const canManageSettings = await verifyRole(request, Role.SettingsUserManager)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canViewProspection = await verifyRole(request, Role.ProspectionViewer)

  if (!canViewTerritories && !canViewProspection) {
    throw redirect('/')
  }

  return {
    canManageTerritories,
    canViewTerritories,
    canManageSettings,
    canViewPublishers,
    canViewProspection,
  }
}

export default function BoardLayout({ loaderData }: Route.ComponentProps) {
  const { canManageTerritories, canViewTerritories, canManageSettings, canViewPublishers, canViewProspection } =
    loaderData

  return (
    <div className="flex h-screen flex-col">
      <MainNavigation
        showBoard={true}
        showCongregation={canViewPublishers}
        showTerritories={canViewTerritories || canViewProspection}
        showSettings={canManageSettings}
      />

      <div className="mx-3 flex flex-row gap-3 max-sm:flex-col">
        <aside className="w-fit self-start rounded-md bg-gray-200 max-sm:w-auto max-sm:grow max-sm:self-stretch">
          <nav className="p-2">
            <ul className="flex list-none flex-col gap-2 max-sm:flex-row max-sm:flex-wrap max-sm:justify-center">
              {canViewTerritories && (
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'./attributions'} className="flex items-center gap-2">
                    <CalendarDateRangeIcon className="inline size-6" /> Attributions
                  </Link>
                </li>
              )}
              {canViewTerritories && (
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'.'} className="flex items-center gap-2">
                    <MapIcon className="inline size-6" /> Territoires
                  </Link>
                </li>
              )}
              {canViewProspection && (
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'./buildings'} className="flex items-center gap-2">
                    <BuildingOffice2Icon className="inline size-6" /> Prospection
                  </Link>
                </li>
              )}
              {canManageTerritories && (
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'./stats'} className="flex items-center gap-2">
                    <ChartPieIcon className="inline size-6" /> Statistiques
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </aside>
        <div className="grow">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
