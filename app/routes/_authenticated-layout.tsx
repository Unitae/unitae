import { useEffect } from 'react'
import { data } from 'react-router'
import { toast } from 'sonner'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { AppLayout } from '~/shared/ui/AppLayout'

import type { Route } from './+types/_authenticated-layout'

export async function loader({ request }: Route.LoaderArgs) {
  const { session, congregation, currentUser } = await verifySession(request)

  const [
    canUploadDocument,
    canManageBoard,
    canViewPublishers,
    canViewTerritories,
    canViewProspection,
    canManageTerritories,
    canManageSettings,
    canManageUsers,
    canViewPrograms,
    canViewActivity,
  ] = await Promise.all([
    verifyRole(request, Role.BoardUploader),
    verifyRole(request, Role.BoardValidator),
    verifyRole(request, Role.PublisherViewer),
    verifyRole(request, Role.TerritoriesViewer),
    verifyRole(request, Role.ProspectionViewer),
    verifyRole(request, Role.TerritoriesManager),
    verifyRole(request, Role.Admin),
    verifyRole(request, Role.SettingsUserManager),
    verifyRole(request, Role.ProgramViewer),
    verifyRole(request, Role.ActivityViewer),
  ])

  const messages = { success: session.get('success'), error: session.get('error') }

  return data(
    {
      permissions: {
        canViewBoard: true,
        canUploadDocument,
        canManageBoard,
        canViewPublishers,
        canViewTerritories,
        canViewProspection,
        canManageTerritories,
        canManageSettings,
        canManageUsers,
        canViewPrograms,
        canViewActivity,
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
