import { redirect } from 'react-router'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { accountDataDownload, exportAccountData } from '~/shared/domain/export-account-data.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/export-data'

// Loader only: an administrator downloads a person's data. People download their own from « Mon compte ».
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const accountId = requireParamId(params.accountId, '/settings/users')

  const isSelf = currentUser.id === accountId
  const canManageUsers = permissions.has(Permission.CanManageUsers) || permissions.has(Permission.CanDoAnything)

  if (!isSelf && !canManageUsers) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const data = await exportAccountData(db, accountId, congregationId)

    audit({
      action: AuditAction.UserDataExported,
      congregationId,
      actorId: currentUser.id,
      entityType: 'UserAccount',
      entityId: accountId,
    })

    return accountDataDownload(data, accountId)
  })
}
