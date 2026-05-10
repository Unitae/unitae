import { setMemberLeft } from '~/features/publishers/server/set-member-left.server'
import * as m from '~/i18n/paraglide/messages'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-left'

export function action({ request, params, context }: Route.ActionArgs) {
  return runLifecycleAction({
    request,
    params,
    context,
    action: setMemberLeft,
    successMessage: name => m.publishers_view_mark_as_left_success({ name }),
    errorMessage: name => m.publishers_view_mark_as_left_error({ name }),
  })
}
