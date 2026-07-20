import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteEvent } from '~/features/events/server/event-parts.server'
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
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { formatEventDate } from '~/shared/utils/event-time'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un programme — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canManageEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    return { event, timezone: context.get(congregationContext).timezone }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))

  const eventId = requireParamId(params.eventId, '/programs')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canManageEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
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

export default function DeleteEventPage({ loaderData }: Route.ComponentProps) {
  const { event, timezone } = loaderData

  return (
    <DeleteConfirmation title={m.programs_delete_title()} submitLabel={m.programs_delete_submit()} cancelTo="/programs">
      <p>
        {event.name} — {formatEventDate(event.startDate, timezone)}
      </p>
    </DeleteConfirmation>
  )
}
