import { memberAggregate } from '~/features/publishers/index.server'
import * as m from '~/i18n/paraglide/messages'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-inactive'

export function action({ request, params, context }: Route.ActionArgs) {
  return runLifecycleAction({
    request,
    params,
    context,
    action: (db, memberId, congregationId, actorId) =>
      memberAggregate.setLifecycle(db, memberId, congregationId, actorId, 'inactive'),
    successMessage: name => m.publishers_view_mark_as_inactive_success({ name }),
    errorMessage: name => m.publishers_view_mark_as_inactive_error({ name }),
  })
}
