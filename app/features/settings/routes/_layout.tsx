import { Outlet, redirect } from 'react-router'
import * as m from '~/paraglide/messages'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_layout_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canViewTerritories = permissions.has(Role.TerritoriesViewer)
  const canManageTerritories = permissions.has(Role.TerritoriesManager)
  const canManageUsers = permissions.has(Role.SettingsUserManager)
  const canViewPublishers = permissions.has(Role.PublisherViewer)
  const canManageSettings = permissions.has(Role.Admin)
  const canViewProspection = permissions.has(Role.ProspectionViewer)

  if (!canManageUsers && !canManageSettings) {
    throw redirect('/')
  }

  return {
    canManageUsers,
    canViewTerritories,
    canManageTerritories,
    canViewPublishers,
    canManageSettings,
    canViewProspection,
  }
}

export default function SettingsLayout() {
  return <Outlet />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
