import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { togglePublisherStatus } from '~/features/settings/server/publisher-status.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/make-publisher'

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const user = await togglePublisherStatus(
      db,
      requireParamId(params.userId, '/settings/users'),
      currentUser.congregationId,
      true,
      currentUser.id,
    )
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
