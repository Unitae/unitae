import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { fireReleaseNotifications } from '~/features/events/server/event-status.server'
import { PROGRAMME_ASSIGNMENT_TYPE } from '~/features/events/server/notifications.server'
import { deleteEventSchedule } from '~/features/events/server/schedule-changes.server'
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

import type { Route } from './+types/schedule-delete'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/programs')
}

/**
 * Deletes one schedule of the event, never the event (D6): « Gérer », or the responsible of its template. The
 * assignees of a published schedule are told « Attribution annulée » once it is gone (D41).
 */
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
    return deleteEventSchedule(db, can, currentUser.id, eventId, scheduleId, congregationId)
  })
  if (outcome == null || 'refused' in outcome) throw redirect('/programs')

  await fireReleaseNotifications(
    outcome.event,
    outcome.result.notifyTargets,
    congregationId,
    currentUser.id,
    { locale: cong.locale, timezone: cong.timezone },
    PROGRAMME_ASSIGNMENT_TYPE.unassigned,
  )
  session.flash('success', m.programs_schedule_deleted())
  logger.info(`Schedule deleted. User: ${currentUser.id}. Event: ${eventId}. Schedule: ${scheduleId}.`)
  return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
