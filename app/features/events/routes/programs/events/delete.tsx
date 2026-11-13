import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteEvent } from '~/features/events/server/event-parts.server'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import { findProgrammeEvent } from '~/features/events/server/programme-event.queries'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

// Deleting is a dialog on the programme's page; an old link to this address lands on that page.
export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/programs/events/${params.eventId}`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))

  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await findProgrammeEvent(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    await deleteEvent(db, eventId, congregationId)

    logger.info(`Deleted event ${eventId}. User ID: ${currentUser.id}.`)
    session.flash('success', m.programs_delete_success({ name: event.name }))

    return redirect('/programs', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
