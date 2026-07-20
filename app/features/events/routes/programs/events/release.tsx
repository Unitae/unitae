import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { fireReleaseNotifications, releaseEvent } from '~/features/events/server/event-status.server'
import { canManageEvent } from '~/features/events/server/events-auth.server'
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

export async function action({ request, params, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const cong = context.get(congregationContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const { congregationId } = currentUser

  // Phase 1: auth + release (state flip + audit) in one scoped tx.
  // releaseEvent returns notifyTargets — notifications fire in Phase 2 OUTSIDE
  // this tx so a queue/Postgres error inside a notify cannot poison it.
  const result = await withScopeFromContext(context, async db => {
    const can = (p: Permission) => permissions.has(p)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { templateId: true } })
    if (!event) throw redirect('/programs')
    if (!(await canManageEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }
    return releaseEvent(db, eventId, congregationId, currentUser.id)
  })
  if (result == null) throw redirect('/programs')

  if ('error' in result) {
    session.flash('error', result.error)
    logger.warn(`Event release blocked. User: ${currentUser.id}. Event: ${eventId}.`)
    return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  // Phase 2: notifications, outside the release tx.
  await fireReleaseNotifications(result.event, result.notifyTargets, congregationId, currentUser.id, {
    locale: cong.locale,
    timezone: cong.timezone,
  })

  session.flash('success', m.programs_release_success())
  logger.info(`Event released. User: ${currentUser.id}. Event: ${eventId}.`)
  return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
