import { Outlet, redirect } from 'react-router'
import * as m from '~/paraglide/messages'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.territories_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canViewTerritories = permissions.has(Role.TerritoriesViewer)
  const canManageTerritories = permissions.has(Role.TerritoriesManager)
  const canManageSettings = permissions.has(Role.SettingsUserManager)
  const canViewPublishers = permissions.has(Role.PublisherViewer)
  const canViewProspection = permissions.has(Role.ProspectionViewer)

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

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
