import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { unpublishEventSchedule } from '~/features/events/server/event-publishing.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/schedule-unpublish'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/** Withdraws one schedule of the event (plan §10, D8): « Publier », or the responsible of its template. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const scheduleId = requireParamId(params.scheduleId, '/programs')

  return withScopeFromContext(context, async db => {
    const can = (p: Permission) => permissions.has(p)
    const outcome = await unpublishEventSchedule(
      db,
      can,
      currentUser.id,
      eventId,
      scheduleId,
      currentUser.congregationId,
    )
    if (outcome == null || 'refused' in outcome) throw redirect('/programs')

    session.flash('success', m.programs_schedule_unpublish_success())
    logger.info(`Schedule unpublished. User: ${currentUser.id}. Event: ${eventId}. Schedule: ${scheduleId}.`)
    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
