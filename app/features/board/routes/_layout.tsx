import { data, Outlet } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
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
  const { canUploadDocument } = loaderData

  return <Outlet context={{ canUploadDocument }} />
}
