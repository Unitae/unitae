import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { unreleaseEvent } from '~/features/events/server/event-status.server'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
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
    const event = await db.event.findFirst({ where: { id: eventId, congregationId }, select: { templateId: true } })
    if (!event) throw redirect('/programs')
    if (
      !(await canEditEvent(
        db,
        can,
        currentUser.id,
        event.templateId ?? null,
        congregationId,
        Permission.CanPublishPrograms,
      ))
    ) {
      throw redirect('/programs')
    }

    const result = await unreleaseEvent(db, eventId, congregationId, currentUser.id)
    if (result == null) throw redirect('/programs')

    session.flash('success', m.programs_unrelease_success())
    logger.info(`Event unreleased. User: ${currentUser.id}. Event: ${eventId}.`)
    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
