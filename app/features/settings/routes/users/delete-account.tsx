import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteAccount } from '~/features/settings/server/delete-account.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-account'

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.SettingsUserManager)

  const accountId = requireParamId(params.userId, '/settings/users')

  // Prevent self-deletion — admins shouldn't lock themselves out via this flow
  if (currentUser.id === accountId) {
    throw redirect('/settings/users')
  }

  const session = await getSession(request.headers.get('Cookie'))

  await withScopeFromContext(context, async db => {
    const account = await db.userAccount.findFirst({
      where: { id: accountId, congregationId: currentUser.congregationId },
      select: { email: true },
    })
    if (!account) throw redirect('/settings/users')

    try {
      await deleteAccount(db, accountId, currentUser.congregationId, currentUser.id)
    } catch (error) {
      if (error instanceof NotFoundError) throw redirect('/settings/users')
      throw error
    }

    session.flash('success', m.settings_user_edit_delete_account_success({ email: account.email }))
  })

  return redirect('/settings/users', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
