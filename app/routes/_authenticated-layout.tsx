import { useEffect } from 'react'
import { data, redirect } from 'react-router'
import { toast } from 'sonner'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { hasDataProcessingConsent } from '~/features/settings/server/consent.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { AppLayout } from '~/shared/ui/AppLayout'

import type { Route } from './+types/_authenticated-layout'

export async function loader({ request }: Route.LoaderArgs) {
  const { session, congregation, currentUser, can } = await authenticateAndAuthorize(request, [
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
  ])

  // Verifier le consentement RGPD avant d'acceder a l'application
  const hasConsent = await hasDataProcessingConsent(currentUser.id)
  if (!hasConsent) {
    throw redirect('/consent')
  }

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
