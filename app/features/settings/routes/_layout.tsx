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
  const canViewTerritories = permissions.has(Permission.CanViewTerritories)
  const canManageTerritories = permissions.has(Permission.CanManageTerritories)
  const canManageUsers = permissions.has(Permission.CanManageUsers)
  const canViewPublishers = permissions.has(Permission.CanViewPublishers)
  const canManageSettings = permissions.has(Permission.CanConfigureCongregation)
  const canViewProspection = permissions.has(Permission.CanViewProspection)
  const canViewRoles = permissions.has(Permission.CanViewRoles) || permissions.has(Permission.CanManageRoles)
  const canManageRoles = permissions.has(Permission.CanManageRoles)
  const canManagePermissions = permissions.has(Permission.CanConfigurePermissions)
  const canManagePioneerGoals = permissions.has(Permission.CanSetPioneerGoals)

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
