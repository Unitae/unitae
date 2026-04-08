import { MapIcon, UserGroupIcon, UsersIcon } from '@heroicons/react/24/outline'
import { Link, Outlet, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { MainNavigation } from '~/shared/ui/MainNavigation'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Réglages - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await verifySession(request)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)
  const canManageUsers = await verifyRole(request, Role.SettingsUserManager)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManageSettings = await verifyRole(request, Role.Admin)
  const canViewProspection = await verifyRole(request, Role.ProspectionViewer)

  if (!canManageUsers && !canManageSettings) {
    throw redirect('/')
  }

  const messages = { error: session.get('error'), success: session.get('success') }

  return {
    canManageUsers,
    canViewTerritories,
    canManageTerritories,
    canViewPublishers,
    canManageSettings,
    messages,
    canViewProspection,
  }
}

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  const { canManageUsers, canViewTerritories, messages, canViewPublishers, canManageSettings, canViewProspection } =
    loaderData

  return (
    <div className="flex h-screen flex-col">
      <MainNavigation
        showBoard={true}
        showCongregation={canViewPublishers}
        showTerritories={canViewTerritories || canViewProspection}
        showSettings={canManageUsers || canManageSettings}
      />

      <div className="mx-3 flex flex-row gap-3 max-sm:flex-col">
        <aside className="w-fit self-start rounded-md bg-gray-200 max-sm:w-auto max-sm:grow max-sm:self-stretch">
          <nav className="p-2">
            <ul className="flex list-none flex-col gap-2 max-sm:flex-row max-sm:flex-wrap max-sm:justify-center">
              {canManageUsers && (
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'/settings/users'} className="flex items-center gap-2">
                    <UsersIcon className="inline size-6" /> Utilisateurs
                  </Link>
                </li>
              )}
              {canManageSettings && (
                <>
                  <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                    <Link to={'/settings/territories'} className="flex items-center gap-2">
                      <MapIcon className="inline size-6" /> Territoires
                    </Link>
                  </li>
                  <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                    <Link to={'/settings/congregation'} className="flex items-center gap-2">
                      <UserGroupIcon className="inline size-6" /> Assemblée
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </aside>
        <div className="grow">
          <AlertMessages messages={messages} />

          <Outlet />
        </div>
      </div>
    </div>
  )
}
