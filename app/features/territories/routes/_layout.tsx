import { Outlet, redirect } from 'react-router'
import { Role } from '~/shared/types/role'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.territories_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [
    Role.TerritoriesViewer,
    Role.TerritoriesManager,
    Role.SettingsUserManager,
    Role.PublisherViewer,
    Role.ProspectionViewer,
  ])
  const canViewTerritories = can(Role.TerritoriesViewer)
  const canManageTerritories = can(Role.TerritoriesManager)
  const canManageSettings = can(Role.SettingsUserManager)
  const canViewPublishers = can(Role.PublisherViewer)
  const canViewProspection = can(Role.ProspectionViewer)

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
