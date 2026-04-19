import { useEffect } from 'react'
import { data } from 'react-router'
import { toast } from 'sonner'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { congregationContext, permissionsContext, userContext } from '~/shared/auth/route-context.server'
import { requireAuth } from '~/shared/middleware/auth.server'
import { Role } from '~/shared/types/role'
import { AppLayout } from '~/shared/ui/AppLayout'
import { RouteErrorBoundary } from '~/shared/ui/RouteErrorBoundary'

import type { Route } from './+types/_authenticated-layout'

export const middleware: Route.MiddlewareFunction[] = [
  requireAuth([
    Role.BoardUploader,
    Role.BoardValidator,
    Role.PublisherViewer,
    Role.TerritoriesViewer,
    Role.ProspectionViewer,
    Role.TerritoriesManager,
    Role.Admin,
    Role.SettingsUserManager,
    Role.ProgramViewer,
    Role.ActivityViewer,
  ]),
]

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)
  const congregation = context.get(congregationContext)
  const permissions = context.get(permissionsContext)
  const session = await getSession(request.headers.get('Cookie'))

  const can = (role: Role) => permissions.has(role)
  const messages = { success: session.get('success'), error: session.get('error') }

  return data(
    {
      permissions: {
        canViewBoard: true,
        canUploadDocument: can(Role.BoardUploader),
        canManageBoard: can(Role.BoardValidator),
        canViewPublishers: can(Role.PublisherViewer),
        canViewTerritories: can(Role.TerritoriesViewer),
        canViewProspection: can(Role.ProspectionViewer),
        canManageTerritories: can(Role.TerritoriesManager),
        canManageSettings: can(Role.Admin),
        canManageUsers: can(Role.SettingsUserManager),
        canViewPrograms: can(Role.ProgramViewer),
        canViewActivity: can(Role.ActivityViewer),
        isPlatformAdmin: currentUser.platformAdmin ?? false,
      },
      congregationName: congregation.displayName ?? congregation.name,
      messages,
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function AuthenticatedLayout({ loaderData }: Route.ComponentProps) {
  const { permissions, congregationName, messages } = loaderData

  useEffect(() => {
    if (messages.success) {
      toast.success(messages.success)
    }
    if (messages.error) {
      toast.error(messages.error)
    }
  }, [messages])

  return <AppLayout permissions={permissions} congregationName={congregationName} />
}

export { RouteErrorBoundary as ErrorBoundary }
