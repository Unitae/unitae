import { redirect } from 'react-router'
import { reorderPartAssignments } from '~/features/events/server/event-parts.server'
import { canManageEvent } from '~/features/events/server/events-auth.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/reorder-parts'

export function loader({ params }: Route.LoaderArgs) {
  const eventId = requireParamId(params.eventId, '/programs')
  throw redirect(`/programs/events/${eventId}`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const eventId = requireParamId(params.eventId, '/programs')

  const { orderedIds } = (await request.json()) as { orderedIds: number[] }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canManageEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    await reorderPartAssignments(db, congregationId, orderedIds)
    return { ok: true }
  })
}
