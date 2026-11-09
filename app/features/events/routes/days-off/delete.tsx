import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { absenceDays, absenceLength, formatAbsencePeriod } from '~/features/events/model/absence'
import { findOwnDayOff } from '~/features/events/server/days-off.queries'
import { deleteDayOff } from '~/features/events/server/days-off.server'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.days_off_delete_dialog_title()} - Unitae` }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const eventId = requireParamId(params.eventId, '/me/days-off')

  return withScopeFromContext(context, async db => {
    const absence = await findOwnDayOff(db, {
      eventId,
      accountId: currentUser.id,
      congregationId: currentUser.congregationId,
    })
    if (absence == null) throw redirect('/me/days-off')
    return { absence, timeZone: timezone, now: new Date() }
  })
}

export default function DeleteDayOff({ loaderData }: Route.ComponentProps) {
  const { absence, timeZone, now } = loaderData

  return (
    <DeleteConfirmation
      title={m.days_off_delete_dialog_title()}
      submitLabel={m.days_off_delete_submit()}
      cancelTo="/me/days-off"
      impact={m.days_off_delete_dialog_description()}
    >
      <p>
        <span className="font-medium">
          {formatAbsencePeriod(absence.startDate, absence.endDate, timeZone, new Date(now))}
        </span>
        {' · '}
        <span className="tabular-nums">
          {absenceLength(absenceDays(absence.startDate, absence.endDate, timeZone).count)}
        </span>
      </p>
    </DeleteConfirmation>
  )
}

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
