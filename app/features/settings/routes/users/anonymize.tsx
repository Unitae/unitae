import { redirect } from 'react-router'
import { anonymizeAccount } from '~/features/settings/server/anonymize-account.server'
import { anonymizeMember } from '~/features/settings/server/anonymize-member.server'
import {
  permissionsContext,
  requirePermission,
  currentAccountContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import logger from '~/shared/infra/logger.server'
import type { AccountId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/anonymize'

// Action-only route : anonymise un utilisateur (admin uniquement)
export async function action({ params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const congregationId = currentUser.congregationId

  requirePermission(permissions, Permission.Admin)

  const accountId = requireParamId<AccountId>(params.accountId, '/settings/users')

  if (currentUser.id === accountId) {
    throw redirect('/settings/users')
  }

  await withScopeFromContext(context, async db => {
    const account = await db.userAccount.findUnique({
      where: { id_congregationId: { id: accountId, congregationId } },
      select: { id: true, congregationId: true, memberId: true },
    })
    if (!account) throw new NotFoundError('UserAccount')

    if (account.memberId != null) {
      await anonymizeMember(db, account.memberId, account.congregationId, `admin:${currentUser.id}`)
    }
    await anonymizeAccount(db, account.id, account.congregationId, `admin:${currentUser.id}`)
  })

  logger.info(`User anonymized. UserAccount ID: ${accountId}. By admin ID: ${currentUser.id}.`)
  audit({
    action: AuditAction.UserAnonymized,
    congregationId,
    actorId: currentUser.id,
    entityType: 'UserAccount',
    entityId: accountId,
  })

  return redirect('/settings/users')
}
