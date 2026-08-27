import { redirect } from 'react-router'
import { exportAccountData } from '~/features/settings/server/export-account-data.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/export-data'

// Route loader-only : renvoie un fichier JSON avec les donnees personnelles de l'utilisateur
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const accountId = requireParamId(params.accountId, '/settings/users')

  // Seul un admin/gestionnaire peut exporter, ou l'utilisateur lui-meme
  const isSelf = currentUser.id === accountId
  const canManageUsers = permissions.has(Permission.CanManageUsers) || permissions.has(Permission.CanDoAnything)

  if (!isSelf && !canManageUsers) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const data = await exportAccountData(db, accountId, congregationId)
    const json = JSON.stringify(data, null, 2)

    audit({
      action: AuditAction.UserDataExported,
      congregationId,
      actorId: currentUser.id,
      entityType: 'UserAccount',
      entityId: accountId,
    })

    return new Response(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="donnees-utilisateur-${accountId}.json"`,
      },
    })
  })
}
