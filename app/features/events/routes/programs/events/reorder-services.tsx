import { redirect } from 'react-router'
import { canFillSchedule } from '~/features/events/server/events-auth.server'
import { findProgrammeEvent } from '~/features/events/server/programme-event.queries'
import { reorderServiceAssignments } from '~/features/events/server/reorder-services.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/reorder-services'

export function loader({ params }: Route.LoaderArgs) {
  const eventId = requireParamId(params.eventId, '/programs')
  throw redirect(`/programs/events/${eventId}`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const eventId = requireParamId(params.eventId, '/programs')

  // Item ids, under a name of their own (plan T12): a page the previous image rendered posts the old rows' ids as
  // `orderedIds`, refused here rather than read as items.
  const { itemIds: orderedIds } = (await request.json()) as { itemIds: number[] }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await findProgrammeEvent(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    // « Attribuer », « Gérer », or the responsible of this schedule's template (plan §10, D7).
    if (!(await canFillSchedule(db, can, currentUser.id, event, 'service', congregationId))) {
      throw redirect('/programs')
    }

    const done = await reorderServiceAssignments(db, congregationId, eventId, orderedIds)
    return { ok: done }
  })
}
