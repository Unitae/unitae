import { data, Outlet, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_layout_meta_title() }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canViewTerritories = permissions.has(Role.TerritoriesViewer)
  const canManageSettings = permissions.has(Role.SettingsUserManager)
  const canViewPublishers = permissions.has(Role.PublisherViewer)
  const canViewPrograms = permissions.has(Role.ProgramViewer)
  const canViewProspection = permissions.has(Role.ProspectionViewer)

  if (!canViewPublishers && !canViewPrograms) {
    throw redirect('/')
  }

  const session = await getSession(request.headers.get('Cookie'))
  const messages = { success: session.get('success'), error: session.get('error') }
  return data(
    { canManageSettings, canViewTerritories, canViewPublishers, messages, canViewPrograms, canViewProspection },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function CongregationLayout() {
  return <Outlet />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
