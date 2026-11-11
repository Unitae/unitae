import { data, redirect } from 'react-router'
import { resetAccountTwoFactor } from '~/features/settings/server/reset-account-two-factor.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { GrantBeyondActorError } from '~/shared/domain/role-grant-limits.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { AccountId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import { okWithToast } from '../_toast.server'
import type { Route } from './+types/reset-2fa'

// Action only, for the account page's dialog: turns the account's two-step verification off.
export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  requirePermission(permissions, Permission.CanManageUsers)
  const accountId = requireParamId<AccountId>(params.accountId, '/settings/users')

  try {
    const account = await withScopeFromContext(context, db =>
      resetAccountTwoFactor(db, accountId, currentUser.congregationId, currentUser.id, permissions),
    )
    return okWithToast(request, m.settings_user_2fa_reset_success({ email: account.email }))
  } catch (error) {
    if (error instanceof NotFoundError) throw redirect('/settings/users')
    if (error instanceof GrantBeyondActorError) {
      return data({ ok: false as const, error: m.settings_user_admin_only() }, { status: 403 })
    }
    throw error
  }
}
