import { redirect } from 'react-router'
import { anonymizeAccount } from '~/features/settings/server/anonymize-account.server'
import { anonymizeMember } from '~/features/settings/server/anonymize-member.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { AccountId, MemberId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import { accountRefusal } from '../_account-refusal.server'
import { redirectWithToast } from '../_toast.server'
import type { Route } from './+types/anonymize'

// Action only, for the account page's dialog: anonymises the account, and its record when it has one.
export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  requirePermission(permissions, Permission.CanAnonymisePeople)
  const accountId = requireParamId<AccountId>(params.accountId, '/settings/users')
  const accountPage = `/settings/users/${accountId}`

  try {
    await withScopeFromContext(context, async (db, congregationId) => {
      const account = await db.userAccount.findUnique({
        where: { id_congregationId: { id: accountId, congregationId } },
        select: { memberId: true },
      })
      if (!account) throw new NotFoundError('UserAccount')
      // The account first: its guard refuses before the record is touched (one transaction either way).
      await anonymizeAccount(db, accountId, congregationId, currentUser.id, permissions)
      if (account.memberId != null) {
        await anonymizeMember(db, account.memberId as MemberId, congregationId, currentUser.id)
      }
    })
  } catch (error) {
    if (error instanceof NotFoundError) throw redirect('/settings/users')
    const reason = accountRefusal(error)
    if (reason) return redirectWithToast(request, accountPage, reason, 'error')
    // The record's own refusals (it leads a group…) are written for the person reading them.
    if (error instanceof ConflictError) return redirectWithToast(request, accountPage, error.message, 'error')
    throw error
  }

  return redirectWithToast(request, accountPage, m.settings_account_anonymised())
}
