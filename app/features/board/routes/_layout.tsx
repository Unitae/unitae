import { DocumentTextIcon, FolderOpenIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import { data, Link, Outlet } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { MainNavigation } from '~/shared/ui/MainNavigation'
import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await verifySession(request)
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)
  const canManageSettings = await verifyRole(request, Role.SettingsUserManager)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)
  const canViewProspection = await verifyRole(request, Role.ProspectionViewer)

  const messages = { success: session.get('success'), error: session.get('error') }
  return data(
    {
      canManageSettings,
      canViewTerritories,
      canViewPublishers,
      canUploadDocument,
      canManageBoard,
      messages,
      canViewProspection,
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function BoardLayout({ loaderData }: Route.ComponentProps) {
  const {
    canUploadDocument,
    canManageSettings,
    canViewTerritories,
    canViewPublishers,
    canManageBoard,
    messages,
    canViewProspection,
  } = loaderData

  return (
    <div className="flex h-screen flex-col">
      <MainNavigation
        showBoard={true}
        showCongregation={canViewPublishers}
        showTerritories={canViewTerritories || canViewProspection}
        showSettings={canManageSettings}
      />

      <div className="mx-3 flex flex-row gap-3 max-sm:flex-col">
        {canUploadDocument && (
          <aside className="w-fit self-start rounded-md bg-gray-200 max-sm:w-auto max-sm:grow max-sm:self-stretch">
            <nav className="p-2">
              <ul className="flex list-none flex-col gap-2 max-sm:flex-row max-sm:flex-wrap max-sm:justify-center">
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'/board'} className="flex items-center gap-2">
                    <Squares2X2Icon className="inline size-6" /> Tableau d'affichage
                  </Link>
                </li>
                {canManageBoard && (
                  <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                    <Link to={'/board/sections'} className="flex items-center gap-2">
                      <FolderOpenIcon className="inline size-6" /> Sections
                    </Link>
                  </li>
                )}
                <li className="block rounded-md p-3 hover:bg-teal-700 hover:bg-opacity-50 dark:text-slate-900">
                  <Link to={'/board/documents'} className="flex items-center gap-2">
                    <DocumentTextIcon className="inline size-6" /> Documents
                  </Link>
                </li>
              </ul>
            </nav>
          </aside>
        )}
        <div className="grow">
          <AlertMessages messages={messages} />
          <Outlet context={{ canUploadDocument }} />
        </div>
      </div>
    </div>
  )
}
