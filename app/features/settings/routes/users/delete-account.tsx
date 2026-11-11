import { redirect } from 'react-router'
import { deleteAccount } from '~/features/settings/server/delete-account.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { AccountId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import { accountRefusal } from '../_account-refusal.server'
import { redirectWithToast } from '../_toast.server'
import type { Route } from './+types/delete-account'

// Action only, for the account page's dialog: deletes the login; a linked record stays.
export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  requirePermission(permissions, Permission.CanDeleteUserAccounts)
  const accountId = requireParamId<AccountId>(params.accountId, '/settings/users')

  let email: string
  try {
    email = await withScopeFromContext(context, async (db, congregationId) => {
      const account = await db.userAccount.findFirst({
        where: { id: accountId, congregationId },
        select: { email: true },
      })
      if (!account) throw new NotFoundError('UserAccount')
      await deleteAccount(db, accountId, congregationId, currentUser.id, permissions)
      return account.email
    })
  } catch (error) {
    if (error instanceof NotFoundError) throw redirect('/settings/users')
    const reason = accountRefusal(error)
    if (reason) return redirectWithToast(request, `/settings/users/${accountId}`, reason, 'error')
    throw error
  }

  return redirectWithToast(request, '/settings/users', m.settings_user_edit_delete_account_success({ email }))
}
