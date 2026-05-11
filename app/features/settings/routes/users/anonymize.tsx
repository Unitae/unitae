import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { anonymizeAccount } from '~/features/settings/server/anonymize-account.server'
import { anonymizeMember } from '~/features/settings/server/anonymize-member.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import logger from '~/shared/infra/logger.server'
import type { AccountId, MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/anonymize'

// Action-only route : anonymise un utilisateur (admin uniquement)
export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const congregationId = currentUser.congregationId

  requirePermission(permissions, Permission.Admin)

  const accountId = requireParamId<AccountId>(params.accountId, '/settings/users')

  if (currentUser.id === accountId) {
    throw redirect('/settings/users')
  }

  const session = await getSession(request.headers.get('Cookie'))

  try {
    await withScopeFromContext(context, async db => {
      const account = await db.userAccount.findUnique({
        where: { id_congregationId: { id: accountId, congregationId } },
        select: { id: true, congregationId: true, memberId: true },
      })
      if (!account) throw new NotFoundError('UserAccount')

      if (account.memberId != null) {
        await anonymizeMember(db, account.memberId as MemberId, account.congregationId, currentUser.id)
      }
      await anonymizeAccount(db, accountId, account.congregationId, currentUser.id)
    })
  } catch (error) {
    if (error instanceof NotFoundError) throw redirect('/settings/users')
    if (error instanceof ConflictError) {
      session.flash('error', error.message)
      return redirect(`/settings/users/${accountId}/edit`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }
    throw error
  }

  logger.info(`User anonymized. UserAccount ID: ${accountId}. By admin ID: ${currentUser.id}.`)

  return redirect('/settings/users')
}
