import { memberAggregate } from '~/features/publishers/index.server'
import * as m from '~/i18n/paraglide/messages'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/make-student'

export function action({ request, params, context }: Route.ActionArgs) {
  return runLifecycleAction({
    request,
    params,
    context,
    action: (db, memberId, congregationId, actorId) =>
      memberAggregate.togglePublisher(db, memberId, congregationId, false, actorId),
    successMessage: name => m.publishers_view_make_student_success({ name }),
    errorMessage: name => m.publishers_view_make_student_error({ name }),
    assertSuccess: member => member.isPublisher === false,
  })
}
