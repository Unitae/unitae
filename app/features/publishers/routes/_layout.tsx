import { CalendarDateRangeIcon, IdentificationIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { data, Link, Outlet, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
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
  const canManageSettings = await verifyRole(request, Role.SettingsUserManager)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canViewPrograms = await verifyRole(request, Role.ProgramViewer)
  const canViewProspection = await verifyRole(request, Role.ProspectionViewer)

  if (!canViewPublishers && !canViewPrograms) {
    throw redirect('/')
  }

  const messages = { success: session.get('success'), error: session.get('error') }
  return data(
    { canManageSettings, canViewTerritories, canViewPublishers, messages, canViewPrograms, canViewProspection },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function CongregationLayout({ loaderData }: Route.ComponentProps) {
  const { canManageSettings, canViewTerritories, canViewPublishers, canViewPrograms, messages, canViewProspection } =
    loaderData

  return (
    <div className="flex h-screen flex-col">
      <MainNavigation
        showBoard={true}
        showCongregation={canViewPublishers || canViewPrograms}
        showTerritories={canViewTerritories || canViewProspection}
        showSettings={canManageSettings}
      />

      <div className="mx-3 flex flex-row gap-3 max-sm:flex-col">
        <aside className="w-fit self-start rounded-md bg-gray-200 max-sm:w-auto max-sm:grow max-sm:self-stretch">
          <nav className="p-2">
            <ul className="flex list-none flex-col gap-2 max-sm:flex-row max-sm:flex-wrap max-sm:justify-center">
              {canViewPublishers && (
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'/congregation/publishers'} className="flex items-center gap-2">
                    <IdentificationIcon className="inline size-6" /> Proclamateurs
                  </Link>
                </li>
              )}
              {canViewPublishers && (
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'/congregation/publisher-groups'} className="flex items-center gap-2">
                    <UserGroupIcon className="inline size-6" /> Groupes de prédication
                  </Link>
                </li>
              )}
              {canViewPrograms && (
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'/congregation/programs/days-off'} className="flex items-center gap-2">
                    <CalendarDateRangeIcon className="inline size-6" /> Absences
                  </Link>
                  {/* <Link to={'/congregation/programs'} className="flex items-center gap-2">
                    <CalendarDateRangeIcon className="inline size-6" /> Programmes
                  </Link> */}
                </li>
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
