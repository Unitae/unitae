import { Outlet, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'

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

export default function SettingsLayout() {
  return <Outlet />
}
