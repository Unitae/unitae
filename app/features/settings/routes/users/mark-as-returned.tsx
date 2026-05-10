import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { setMemberReturned } from '~/features/publishers/server/set-member-returned.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/mark-as-returned'

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const accountId = requireParamId(params.userId, '/settings/users')

    const account = await db.userAccount.findUnique({
      where: { id_congregationId: { id: accountId, congregationId: currentUser.congregationId } },
      select: { email: true, memberId: true },
    })

    if (account == null || account.memberId == null) {
      session.flash('error', m.settings_user_mark_as_returned_error({ email: account?.email ?? '' }))
    } else {
      try {
        await setMemberReturned(db, account.memberId, currentUser.congregationId, currentUser.id)
        session.flash('success', m.settings_user_mark_as_returned_success({ email: account.email }))
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error
        session.flash('error', m.settings_user_mark_as_returned_error({ email: account.email }))
      }
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/settings/users', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
