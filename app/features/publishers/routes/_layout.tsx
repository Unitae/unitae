import { Outlet, redirect } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_layout_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewTerritories = permissions.has(Permission.CanViewTerritories)
  const canManageSettings = permissions.has(Permission.CanManageUsers)
  const canViewPublishers = permissions.has(Permission.CanViewPublishers)
  const canViewPrograms = permissions.has(Permission.CanViewPrograms)
  const canViewProspection = permissions.has(Permission.CanViewProspection)
  // Group responsibles / deputies and emergency-info holders reach the
  // emergency routes here even without a publisher/program permission. Each
  // child route self-gates, so admitting them to the layout is safe.
  const canReachEmergency =
    permissions.has(Permission.CanViewEmergencyInfo) ||
    permissions.has(Permission.CanManageEmergencyInfo) ||
    currentUser.member?.responsibleFor != null ||
    currentUser.member?.deputyFor != null

  if (!canViewPublishers && !canViewPrograms && !canReachEmergency) {
    throw redirect('/')
  }

  return { canManageSettings, canViewTerritories, canViewPublishers, canViewPrograms, canViewProspection }
}

export default function CongregationLayout() {
  return <Outlet />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
