import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { releaseEvent } from '~/features/events/server/event-status.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
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

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (p: Permission) => permissions.has(p)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { templateId: true } })
    if (!event) throw redirect('/programs')
    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const result = await releaseEvent(db, eventId, congregationId, currentUser.id, {
      locale: cong.locale,
      timezone: cong.timezone,
    })
    if (result == null) throw redirect('/programs')

    if ('error' in result) {
      session.flash('error', result.error)
      logger.warn(`Event release blocked. User: ${currentUser.id}. Event: ${eventId}.`)
      return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
    }

    session.flash('success', m.programs_release_success())
    logger.info(`Event released. User: ${currentUser.id}. Event: ${eventId}.`)
    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
