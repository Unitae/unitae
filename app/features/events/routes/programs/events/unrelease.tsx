import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { unreleaseEvent } from '~/features/events/server/event-status.server'
import { findProgrammeEvent } from '~/features/events/server/programme-event.queries'
import { canPublishEvent } from '~/features/events/server/schedule-rights.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/unrelease'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (p: Permission) => permissions.has(p)
    const event = await findProgrammeEvent(db, eventId, congregationId)
    if (!event) throw redirect('/programs')
    // « Publier », or the responsible of every schedule of the event, until schedules publish one by one (D49).
    if (!(await canPublishEvent(db, can, currentUser.id, event, congregationId))) {
      throw redirect('/programs')
    }

    const result = await unreleaseEvent(db, eventId, congregationId, currentUser.id)
    if (result == null) throw redirect('/programs')

    session.flash('success', m.programs_unrelease_success())
    logger.info(`Event unreleased. User: ${currentUser.id}. Event: ${eventId}.`)
    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
