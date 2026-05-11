import { togglePublisherStatus } from '~/features/settings/server/publisher-status.server'
import * as m from '~/i18n/paraglide/messages'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/make-publisher'

export function action({ request, params, context }: Route.ActionArgs) {
  return runLifecycleAction({
    request,
    params,
    context,
    action: (db, memberId, congregationId, actorId) =>
      togglePublisherStatus(db, memberId, congregationId, true, actorId),
    successMessage: name => m.publishers_view_make_publisher_success({ name }),
    errorMessage: name => m.publishers_view_make_publisher_error({ name }),
    assertSuccess: member => member.isPublisher === true,
  })
}
