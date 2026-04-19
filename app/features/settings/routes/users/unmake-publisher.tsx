import { redirect } from 'react-router'
import { Role } from '~/shared/types/role'
import { togglePublisherStatus } from '~/features/settings/server/publisher-status.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/unmake-publisher'

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const user = await togglePublisherStatus(db, requireParamId(params.userId, '/settings/users'), congregationId, false)
    if (user.isPublisher === true) {
      session.flash('success', m.settings_user_unmake_publisher_success({ email: user.email }))
    } else {
      session.flash('error', m.settings_user_unmake_publisher_error({ email: user.email }))
    }

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/settings/users')
  })
}
