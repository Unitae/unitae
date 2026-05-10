import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { togglePublisherStatus } from '~/features/settings/server/publisher-status.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/make-publisher'

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

    if (account == null) {
      session.flash('error', m.settings_user_make_publisher_error({ email: '' }))
    } else if (account.memberId == null) {
      // Account-only admin: send the operator to a form that collects the
      // Member fields, then linkMemberToAccount will be called on submit.
      return redirect(`/settings/users/${accountId}/add-to-congregation`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    } else {
      const member = await togglePublisherStatus(
        db,
        account.memberId,
        currentUser.congregationId,
        true,
        currentUser.id,
      )
      if (member.isPublisher === true) {
        session.flash('success', m.settings_user_make_publisher_success({ email: account.email }))
      } else {
        session.flash('error', m.settings_user_make_publisher_error({ email: account.email }))
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
