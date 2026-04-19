import { data, Outlet } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const session = await getSession(request.headers.get('Cookie'))

  const canUploadDocument = permissions.has(Role.BoardUploader)
  const canViewTerritories = permissions.has(Role.TerritoriesViewer)
  const canManageSettings = permissions.has(Role.SettingsUserManager)
  const canViewPublishers = permissions.has(Role.PublisherViewer)
  const canManageBoard = permissions.has(Role.BoardValidator)
  const canViewProspection = permissions.has(Role.ProspectionViewer)

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
  const { canUploadDocument } = loaderData

  return <Outlet context={{ canUploadDocument }} />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
