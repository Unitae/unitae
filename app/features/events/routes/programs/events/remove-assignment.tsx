import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { unassignPart, unassignServiceRole } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import * as m from '~/paraglide/messages'
import logger from '~/shared/infra/logger.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { Role } from '~/shared/types/role'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/remove-assignment'

export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/congregation/programs/events/${params.eventId}`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))

  const eventId = requireParamId(params.eventId, '/congregation/programs')
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const assignmentId = Number(url.searchParams.get('id'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Role) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/congregation/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/congregation/programs')
    }

    if (type === 'part') {
      await unassignPart(db, assignmentId, congregationId)
      logger.info(`Unassigned part. User ID: ${currentUser.id}. Assignment: ${assignmentId}.`)
    } else if (type === 'service') {
      await unassignServiceRole(db, assignmentId, congregationId)
      logger.info(`Unassigned service role. User ID: ${currentUser.id}. Assignment: ${assignmentId}.`)
    }

    session.flash('success', m.programs_remove_assignment_success())

    return redirect(`/congregation/programs/events/${eventId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function RemoveAssignment() {
  return null
}
