import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { unpublishEvent } from '~/features/events/server/event-publishing.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/unrelease'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/** « Tout retirer » (D43): every published schedule of the event the person may withdraw. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (p: Permission) => permissions.has(p)
    const result = await unpublishEvent(db, can, currentUser.id, eventId, congregationId)
    if (result == null || 'refused' in result) throw redirect('/programs')

    logger.info(
      `Event unpublished. User: ${currentUser.id}. Event: ${eventId}. Schedules withdrawn: ${result.withdrawn.length}; skipped: ${result.skipped}.`,
    )
    const held = result.skipped > 0 ? m.programs_schedules_withdraw_skipped({ count: result.skipped }) : null
    // Nothing withdrawn and someone else's still published: say so, never report a success.
    if (!result.changed && held != null) {
      session.flash('error', held)
      return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
    }
    session.flash('success', m.programs_unrelease_success())
    if (held != null) session.flash('error', held)
    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
