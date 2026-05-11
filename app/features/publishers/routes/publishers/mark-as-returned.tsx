import { setMemberReturned } from '~/features/publishers/server/set-member-returned.server'
import * as m from '~/i18n/paraglide/messages'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-returned'

export function action({ request, params, context }: Route.ActionArgs) {
  return runLifecycleAction({
    request,
    params,
    context,
    action: setMemberReturned,
    successMessage: name => m.publishers_view_mark_as_returned_success({ name }),
    errorMessage: name => m.publishers_view_mark_as_returned_error({ name }),
  })
}
