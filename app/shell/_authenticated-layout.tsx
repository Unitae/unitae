import { useEffect } from 'react'
import { data } from 'react-router'
import { toast } from 'sonner'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { requireAuth } from '~/shared/auth/middleware.server'
import { congregationContext, currentAccountContext, permissionsContext } from '~/shared/auth/route-context.server'
import { billingPortalLink } from '~/shared/domain/billing-link.server'
import { Permission } from '~/shared/types/permission'
import { AppLayout } from '~/shared/ui/AppLayout'
import { RouteErrorBoundary } from '~/shared/ui/RouteErrorBoundary'

import type { Route } from './+types/_authenticated-layout'

export const middleware: Route.MiddlewareFunction[] = [
  requireAuth([
    Permission.Admin,
    Permission.BoardViewer,
    Permission.BoardUploader,
    Permission.BoardValidator,
    Permission.PublisherViewer,
    Permission.PublisherManager,
    Permission.TerritoriesViewer,
    Permission.TerritoriesManager,
    Permission.ProspectionViewer,
    Permission.ProspectionManager,
    Permission.SettingsUserManager,
    Permission.ProgramViewer,
    Permission.ProgramManager,
    Permission.AbsenceViewer,
    Permission.ActivityViewer,
    Permission.ActivityManager,
    Permission.ExternalSpeakerViewer,
    Permission.ExternalSpeakerManager,
    Permission.RolesViewer,
    Permission.RolesManager,
    Permission.PermissionsManager,
  ]),
]

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)
  const permissions = context.get(permissionsContext)
  const session = await getSession(request.headers.get('Cookie'))

  const can = (role: Permission) => permissions.has(role)
  const messages = { success: session.get('success'), error: session.get('error') }

  return data(
    {
      permissions: {
        canViewBoard: can(Permission.BoardViewer),
        canUploadDocument: can(Permission.BoardUploader),
        canManageBoard: can(Permission.BoardValidator),
        canViewPublishers: can(Permission.PublisherViewer),
        canViewTerritories: can(Permission.TerritoriesViewer),
        canViewProspection: can(Permission.ProspectionViewer),
        canManageTerritories: can(Permission.TerritoriesManager),
        canManageSettings: can(Permission.Admin),
        canManageUsers: can(Permission.SettingsUserManager),
        canViewPrograms: can(Permission.ProgramViewer),
        canViewAbsences: can(Permission.AbsenceViewer),
        canViewActivity: can(Permission.ActivityViewer),
        canViewExternalSpeakers: can(Permission.ExternalSpeakerViewer) || can(Permission.ExternalSpeakerManager),
        canManageExternalSpeakers: can(Permission.ExternalSpeakerManager),
        canViewRoles: can(Permission.RolesViewer) || can(Permission.RolesManager),
        canManageRoles: can(Permission.RolesManager),
        canManagePermissions: can(Permission.PermissionsManager),
        isPlatformAdmin: currentUser.platformAdmin ?? false,
      },
      congregationName: congregation.displayName ?? congregation.name,
      // SaaS billing link: admin-only, config-driven (null when self-hosted), AND only when the
      // congregation has a Stripe customer — the portal returns 410 otherwise (trial / never subscribed).
      billingUrl: can(Permission.Admin) && congregation.stripeCustomerId ? billingPortalLink(congregation.slug) : null,
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
  const { permissions, congregationName, billingUrl, messages } = loaderData

  useEffect(() => {
    if (messages.success) {
      toast.success(messages.success)
    }
    if (messages.error) {
      toast.error(messages.error)
    }
  }, [messages])

  return <AppLayout permissions={permissions} congregationName={congregationName} billingUrl={billingUrl} />
}

export { RouteErrorBoundary as ErrorBoundary }
