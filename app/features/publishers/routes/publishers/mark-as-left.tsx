import { memberAggregate } from '~/features/publishers/index.server'
import { type DepartureRefusal, departureRefusal } from '~/features/publishers/model/departure-date'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext } from '~/shared/auth/route-context.server'
import { dayOf, startOfDay } from '~/shared/utils/calendar-day'

import { runLifecycleAction } from './_lifecycle-action.server'
import type { Route } from './+types/mark-as-left'

const REFUSAL: Record<DepartureRefusal, () => string> = {
  invalid: m.publishers_form_error_date,
  future: m.publishers_left_error_future,
  'too-old': m.publishers_left_error_too_old,
}

// The departure is dated by the day the record's dialog sends, today by default, and stored from the start of that day
// in the congregation's zone. A day still to come is refused, and so is one further back than DEPARTURE_BACKDATE_DAYS:
// the retention clock starts at the departure, so backdating it would hasten the anonymisation.
export async function action({ request, params, context }: Route.ActionArgs) {
  const timeZone = context.get(congregationContext).timezone
  const value = (await request.formData()).get('leftOn')
  const day = typeof value === 'string' && value !== '' ? value : null
  const refused = day == null ? null : departureRefusal(day, dayOf(new Date(), timeZone))

  return runLifecycleAction({
    request,
    params,
    context,
    refusal: refused ? REFUSAL[refused]() : null,
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
