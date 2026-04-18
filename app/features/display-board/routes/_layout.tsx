import { data, Outlet } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, can } = await authenticateAndAuthorize(request, [
    Role.BoardUploader,
    Role.TerritoriesViewer,
    Role.SettingsUserManager,
    Role.PublisherViewer,
    Role.BoardValidator,
    Role.ProspectionViewer,
  ])
  const canUploadDocument = can(Role.BoardUploader)
  const canViewTerritories = can(Role.TerritoriesViewer)
  const canManageSettings = can(Role.SettingsUserManager)
  const canViewPublishers = can(Role.PublisherViewer)
  const canManageBoard = can(Role.BoardValidator)
  const canViewProspection = can(Role.ProspectionViewer)

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
