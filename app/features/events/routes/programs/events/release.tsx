import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { publishEvent } from '~/features/events/server/event-publishing.server'
import { fireReleaseNotifications } from '~/features/events/server/event-status.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/release'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/**
 * « Tout publier » (D43): every schedule of the event the person may publish, even on an event already published
 * while one is still a draft (D52); an event holding no schedule publishes as a whole.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const cong = context.get(congregationContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const { congregationId } = currentUser

  // Phase 1: who may publish what, and the publishing itself (state flips + audit), in one scoped tx. The notices go
  // out in Phase 2, outside it, so a queue or Postgres error inside a notify cannot poison it.
  const result = await withScopeFromContext(context, db => {
    const can = (p: Permission) => permissions.has(p)
    return publishEvent(db, can, currentUser.id, eventId, congregationId)
  })
  if (result == null || 'refused' in result) throw redirect('/programs')

  // Phase 2: notifications, outside the publishing tx.
  await fireReleaseNotifications(result.event, result.notifyTargets, congregationId, currentUser.id, {
    locale: cong.locale,
    timezone: cong.timezone,
  })

  const held = [
    ...result.blocked.map(blocked => blocked.error),
    ...(result.skipped > 0 ? [m.programs_schedules_skipped({ count: result.skipped })] : []),
  ]
  logger.info(
    `Event published. User: ${currentUser.id}. Event: ${eventId}. Schedules published: ${result.published.length}; blocked: ${result.blocked.length}; skipped: ${result.skipped}.`,
  )
  // Nothing published and something held back: say why, never report a success.
  if (!result.changed && held.length > 0) {
    session.flash('error', held.join(' '))
    return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
  }
  session.flash('success', m.programs_release_success())
  if (held.length > 0) session.flash('error', held.join(' '))
  return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
