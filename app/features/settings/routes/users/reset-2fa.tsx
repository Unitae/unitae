import { redirect } from 'react-router'
import { commitSession, disableTwoFactor, getSession } from '~/features/authentication/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { AccountId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/reset-2fa'

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.SettingsUserManager)

  const accountId = requireParamId<AccountId>(params.accountId, '/settings/users')
  const session = await getSession(request.headers.get('Cookie'))

  await withScopeFromContext(context, async db => {
    const account = await db.userAccount.findFirst({
      where: { id: accountId, congregationId: currentUser.congregationId },
      select: { email: true },
    })
    if (!account) throw redirect('/settings/users')

    await disableTwoFactor(db, accountId)

    audit({
      action: AuditAction.TwoFactorReset,
      congregationId: currentUser.congregationId,
      actorId: currentUser.id,
      entityType: 'User',
      entityId: accountId,
    })

    session.flash('success', m.settings_user_2fa_reset_success({ email: account.email }))
  })

  return redirect(`/settings/users/${accountId}/edit`, {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
