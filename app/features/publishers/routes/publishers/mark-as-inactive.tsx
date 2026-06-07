import { setMemberInactive } from '~/features/publishers/server/set-member-inactive.server'
import * as m from '~/i18n/paraglide/messages'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-inactive'

export function action({ request, params, context }: Route.ActionArgs) {
  return runLifecycleAction({
    request,
    params,
    context,
    action: setMemberInactive,
    successMessage: name => m.publishers_view_mark_as_inactive_success({ name }),
    errorMessage: name => m.publishers_view_mark_as_inactive_error({ name }),
  })
}
