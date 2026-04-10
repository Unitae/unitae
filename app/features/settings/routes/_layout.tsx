import { Outlet, redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Réglages - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, can } = await authenticateAndAuthorize(request, [Role.TerritoriesViewer, Role.TerritoriesManager, Role.SettingsUserManager, Role.PublisherViewer, Role.Admin, Role.ProspectionViewer])
  const canViewTerritories = can(Role.TerritoriesViewer)
  const canManageTerritories = can(Role.TerritoriesManager)
  const canManageUsers = can(Role.SettingsUserManager)
  const canViewPublishers = can(Role.PublisherViewer)
  const canManageSettings = can(Role.Admin)
  const canViewProspection = can(Role.ProspectionViewer)

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
