import { Outlet, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'

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

export default function BoardLayout() {
  return <Outlet />
}
