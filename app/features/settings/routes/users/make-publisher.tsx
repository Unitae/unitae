import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { togglePublisherStatus } from '~/features/settings/server/publisher-status.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/make-publisher'

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const user = await togglePublisherStatus(db, requireParamId(params.userId, '/settings/users'), currentUser.congregationId, true)
    const session = await getSession(request.headers.get('Cookie'))
    if (user.isPublisher === true) {
      session.flash('success', m.settings_user_make_publisher_success({ email: user.email }))
    } else {
      session.flash('error', m.settings_user_make_publisher_error({ email: user.email }))
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/settings/users', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
