import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { togglePublisherStatus } from '~/features/settings/server/publisher-status.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/make-student'

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
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
      session.flash('error', m.settings_user_make_student_error({ email: account?.email ?? '' }))
    } else {
      const member = await togglePublisherStatus(
        db,
        account.memberId,
        currentUser.congregationId,
        false,
        currentUser.id,
      )
      if (member.isPublisher === false) {
        session.flash('success', m.settings_user_make_student_success({ email: account.email }))
      } else {
        session.flash('error', m.settings_user_make_student_error({ email: account.email }))
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
