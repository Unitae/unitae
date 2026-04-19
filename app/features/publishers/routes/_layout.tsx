import { data, Outlet, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_layout_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, can } = await authenticateAndAuthorize(request, [
    Role.TerritoriesViewer,
    Role.SettingsUserManager,
    Role.PublisherViewer,
    Role.ProgramViewer,
    Role.ProspectionViewer,
  ])
  const canViewTerritories = can(Role.TerritoriesViewer)
  const canManageSettings = can(Role.SettingsUserManager)
  const canViewPublishers = can(Role.PublisherViewer)
  const canViewPrograms = can(Role.ProgramViewer)
  const canViewProspection = can(Role.ProspectionViewer)

  if (!canViewPublishers && !canViewPrograms) {
    throw redirect('/')
  }

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
