import { data, Outlet, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'

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

export default function CongregationLayout() {
  return <Outlet />
}
