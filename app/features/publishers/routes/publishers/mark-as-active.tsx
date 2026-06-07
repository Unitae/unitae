import { setMemberActive } from '~/features/publishers/server/set-member-active.server'
import * as m from '~/i18n/paraglide/messages'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-active'

export function action({ request, params, context }: Route.ActionArgs) {
  return runLifecycleAction({
    request,
    params,
    context,
    action: setMemberActive,
    successMessage: name => m.publishers_view_mark_as_active_success({ name }),
    errorMessage: name => m.publishers_view_mark_as_active_error({ name }),
  })
}
