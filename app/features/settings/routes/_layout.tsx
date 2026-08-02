import { Outlet, redirect } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_layout_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canViewTerritories = permissions.has(Permission.TerritoriesViewer)
  const canManageTerritories = permissions.has(Permission.TerritoriesManager)
  const canManageUsers = permissions.has(Permission.SettingsUserManager)
  const canViewPublishers = permissions.has(Permission.PublisherViewer)
  const canManageSettings = permissions.has(Permission.Admin)
  const canViewProspection = permissions.has(Permission.ProspectionViewer)
  const canViewRoles = permissions.has(Permission.RolesViewer) || permissions.has(Permission.RolesManager)
  const canManageRoles = permissions.has(Permission.RolesManager)
  const canManagePermissions = permissions.has(Permission.PermissionsManager)
  const canManagePioneerGoals = permissions.has(Permission.PioneerGoalManager)

  if (!canManageUsers && !canManageSettings && !canManagePermissions && !canManagePioneerGoals) {
    throw redirect('/')
  }

  return {
    canManageUsers,
    canViewTerritories,
    canManageTerritories,
    canViewPublishers,
    canManageSettings,
    canViewProspection,
    canViewRoles,
    canManageRoles,
    canManagePermissions,
  }
}

export default function SettingsLayout() {
  return <Outlet />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
