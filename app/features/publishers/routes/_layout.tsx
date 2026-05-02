import { Outlet, redirect } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_layout_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canViewTerritories = permissions.has(Role.TerritoriesViewer)
  const canManageSettings = permissions.has(Role.SettingsUserManager)
  const canViewPublishers = permissions.has(Role.PublisherViewer)
  const canViewPrograms = permissions.has(Role.ProgramViewer)
  const canViewProspection = permissions.has(Role.ProspectionViewer)

  if (!canViewPublishers && !canViewPrograms) {
    throw redirect('/')
  }

  return { canManageSettings, canViewTerritories, canViewPublishers, canViewPrograms, canViewProspection }
}

export default function CongregationLayout() {
  return <Outlet />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
