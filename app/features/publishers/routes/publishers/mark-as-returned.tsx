import { memberAggregate } from '~/features/publishers/index.server'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext } from '~/shared/auth/route-context.server'
import { formatDateForInput } from '~/shared/utils/event-time'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-returned'

export function action({ request, params, context }: Route.ActionArgs) {
  const { timezone } = context.get(congregationContext)
  // The return day on the congregation's calendar: it becomes the arrival date after a long absence.
  const returnedOn = new Date(`${formatDateForInput(new Date(), timezone)}T00:00:00Z`)
  return runLifecycleAction({
    request,
    params,
    context,
    action: (db, memberId, congregationId, actorId) =>
      memberAggregate.setLifecycle(db, memberId, congregationId, actorId, 'returned', undefined, returnedOn),
    successMessage: name => m.publishers_view_mark_as_returned_success({ name }),
    errorMessage: name => m.publishers_view_mark_as_returned_error({ name }),
  })
}
