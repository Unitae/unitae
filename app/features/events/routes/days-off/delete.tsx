import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { formatAbsencePeriod } from '~/features/events/model/absence'
import { deleteDayOff } from '~/features/events/server/days-off.server'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

// Deleting is a dialog on the absences list; an old link to this address lands on the list.
export function loader(_args: Route.LoaderArgs) {
  throw redirect('/me/days-off')
}

/** Deletes the caller's own absence and goes back to the list. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const eventId = requireParamId(params.eventId, '/me/days-off')
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    // Only the caller's own absence goes; anything else, absence or not, is left as it is.
    const deleted = await deleteDayOff(db, {
      eventId,
      accountId: currentUser.id,
      memberId: currentUser.member?.id ?? null,
      congregationId: currentUser.congregationId,
    })

    if (deleted == null) {
      session.flash('error', m.days_off_delete_unauthorized())
    } else {
      const period = formatAbsencePeriod(deleted.startDate, deleted.endDate, timezone)
      session.flash('success', m.days_off_delete_success({ period }))
    }
    return redirect('/me/days-off', { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
