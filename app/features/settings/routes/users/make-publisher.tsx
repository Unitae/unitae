import { redirect } from 'react-router'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/make-publisher'

/**
 * Thin redirector kept under /settings/users so the user-list "make publisher"
 * row affordance and the edit-user "create publisher" button still work.
 *
 * - If the account has no linked Member, the operator needs to collect the
 *   Member fields first → 302 to /settings/users/:accountId/add-to-congregation.
 * - If the account already has a Member, just hop to the canonical Member
 *   lifecycle route under /publishers/:memberId/make-publisher (which gates
 *   on PublisherManager and does the actual write).
 */
export function action({ params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.PublisherManager)) {
    throw redirect('/')
  }

  const accountId = requireParamId(params.accountId, '/settings/users')

  return withScopeFromContext(context, async db => {
    const account = await db.userAccount.findUnique({
      where: { id_congregationId: { id: accountId, congregationId: currentUser.congregationId } },
      select: { memberId: true },
    })

    if (!account) throw redirect('/settings/users')

    if (account.memberId == null) {
      throw redirect(`/settings/users/${accountId}/add-to-congregation`)
    }

    throw redirect(`/publishers/${account.memberId}/make-publisher`)
  })
}
