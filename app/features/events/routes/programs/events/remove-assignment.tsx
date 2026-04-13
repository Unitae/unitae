import { redirect } from 'react-router'
import * as m from '~/paraglide/messages'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { unassignPart, unassignServiceRole } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/remove-assignment'

export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/congregation/programs/events/${params.eventId}`)
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const eventId = requireParamId(params.eventId, '/congregation/programs')
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const assignmentId = Number(url.searchParams.get('id'))

  return withScope(congregationId, async db => {
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
