import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { publishEventSchedule } from '~/features/events/server/event-publishing.server'
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

import type { Route } from './+types/schedule-publish'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/** Publishes one schedule of the event (plan §10, D8): « Publier », or the responsible of its template. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const cong = context.get(congregationContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const scheduleId = requireParamId(params.scheduleId, '/programs')
  const { congregationId } = currentUser

  // Phase 1 in one scoped tx; the notices go out in Phase 2, outside it (see release.tsx).
  const outcome = await withScopeFromContext(context, db => {
    const can = (p: Permission) => permissions.has(p)
    return publishEventSchedule(db, can, currentUser.id, eventId, scheduleId, congregationId)
  })
  if (outcome == null || 'refused' in outcome) throw redirect('/programs')

  const { event, result } = outcome
  if ('error' in result) {
    session.flash('error', result.error)
    logger.warn(`Schedule publishing blocked. User: ${currentUser.id}. Schedule: ${scheduleId}. ${result.reason}.`)
    return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
  }
  await fireReleaseNotifications(event, result.notifyTargets, congregationId, currentUser.id, {
    locale: cong.locale,
    timezone: cong.timezone,
  })
  session.flash('success', m.programs_schedule_publish_success())
  logger.info(`Schedule published. User: ${currentUser.id}. Event: ${eventId}. Schedule: ${scheduleId}.`)
  return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
