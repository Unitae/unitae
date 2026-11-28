import { mayReadSlotFacts } from '~/features/events/server/events-auth.server'
import { PART_ITEMS, SERVICE_ITEMS } from '~/features/events/server/item-projection.server'
import { findProgrammeEvent } from '~/features/events/server/programme-event.queries'
import { listSlotCandidateFacts, type SlotTarget } from '~/features/events/server/slot-candidate-facts.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/candidate-facts'

function parseOptionalId(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * What can be said about each person for one slot of the event — when they last held it, an absence over the
 * event, what else they do at it — for the list of people to pick from. Read by whoever may assign that slot.
 */
export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  // Item ids, under names of their own (plan T12): a page the previous image rendered asks under the old names and
  // reads nothing, never another item's facts.
  const partAssignmentId = parseOptionalId(url.searchParams.get('partItemId'))
  const serviceAssignmentId = parseOptionalId(url.searchParams.get('serviceItemId'))
  const slot = url.searchParams.get('slot') === 'assistant' ? 'assistant' : 'assignee'
  // The room being assigned (parallel rooms); none, the part's only or main room.
  const roomId = parseOptionalId(url.searchParams.get('roomId'))

  // One slot per request: the check and the data must be about the same one.
  if (partAssignmentId != null && serviceAssignmentId != null) return Response.json(null, { status: 400 })
  const kind = serviceAssignmentId != null ? 'service' : 'part'
  const assignmentId = serviceAssignmentId ?? partAssignmentId
  if (assignmentId == null) return Response.json(null, { status: 400 })

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await findProgrammeEvent(db, eventId, congregationId)
    if (!event) return Response.json(null, { status: 404 })
    if (!(await mayReadSlotFacts(db, can, currentUser.id, event, congregationId, { kind, assignmentId }))) {
      return Response.json(null, { status: 403 })
    }

    let target: SlotTarget
    if (kind === 'part') {
      const part = await db.item.findFirst({
        where: { id: assignmentId, congregationId, ...PART_ITEMS },
        select: { name: true, section: true },
      })
      if (!part) return Response.json(null, { status: 404 })
      target = { kind, assignmentId, partName: part.name, partSection: part.section, slot, roomId }
    } else {
      const service = await db.item.findFirst({
        where: { id: assignmentId, congregationId, ...SERVICE_ITEMS },
        select: { name: true },
      })
      if (!service) return Response.json(null, { status: 404 })
      target = { kind, assignmentId, serviceName: service.name }
    }

    return Response.json(await listSlotCandidateFacts(db, { event, congregationId, target }))
  })
}
