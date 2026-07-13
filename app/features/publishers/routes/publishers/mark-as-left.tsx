import { memberAggregate } from '~/features/publishers/index.server'
import * as m from '~/i18n/paraglide/messages'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-left'

export function action({ request, params, context }: Route.ActionArgs) {
  return runLifecycleAction({
    request,
    params,
    context,
    action: (db, memberId, congregationId, actorId) =>
      memberAggregate.setLifecycle(db, memberId, congregationId, actorId, 'left'),
    successMessage: name => m.publishers_view_mark_as_left_success({ name }),
    errorMessage: name => m.publishers_view_mark_as_left_error({ name }),
  })
}
