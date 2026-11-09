import { memberAggregate } from '~/features/publishers/index.server'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext } from '~/shared/auth/route-context.server'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-left'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// The departure is dated by the day the record's dialog sends, today by default, and stored from the start of that day
// in the congregation's zone. A day still to come is refused: the person has not left yet.
export async function action({ request, params, context }: Route.ActionArgs) {
  const timeZone = context.get(congregationContext).timezone
  const value = (await request.formData()).get('leftOn')
  const day = typeof value === 'string' && DAY_RE.test(value) ? value : null
  const inFuture = day != null && day > dayOf(new Date(), timeZone)

  return runLifecycleAction({
    request,
    params,
    context,
    refusal: inFuture ? m.publishers_left_error_future() : null,
    action: (db, memberId, congregationId, actorId) =>
      memberAggregate.setLifecycle(
        db,
        memberId,
        congregationId,
        actorId,
        'left',
        undefined,
        day ? startOfDay(day, timeZone) : undefined,
      ),
    successMessage: name => m.publishers_view_mark_as_left_success({ name }),
    errorMessage: name => m.publishers_view_mark_as_left_error({ name }),
  })
}
