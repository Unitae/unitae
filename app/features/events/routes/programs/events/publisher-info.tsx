import { listAbsencesOverRange } from '~/features/events/server/absences.queries'
import type { PartSlot } from '~/features/events/server/cadence-shared.server'
import { mayReadSlotFacts } from '~/features/events/server/events-auth.server'
import { listUserSameEventAssignments } from '~/features/events/server/list-user-same-event-assignments.server'
import { findProgrammeEvent } from '~/features/events/server/programme-event.queries'
import { resolvePublisherCadence } from '~/features/events/server/resolve-publisher-cadence.server'
import { standingTypeFromEnrolments } from '~/features/publishers'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { Permission } from '~/shared/types/permission'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/publisher-info'

function parseOptionalId(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

// Default 'assignee' — the more common slot and the only one that matters
// for services. Unknown / missing values shouldn't 500 the info panel.
function parsePartSlot(raw: string | null): PartSlot {
  return raw === 'assistant' ? 'assistant' : 'assignee'
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const userId = Number(url.searchParams.get('userId'))
  // Item ids, under names of their own (plan T12).
  const excludePartAssignmentId = parseOptionalId(url.searchParams.get('excludePartItemId'))
  const excludeServiceAssignmentId = parseOptionalId(url.searchParams.get('excludeServiceItemId'))
  const partSlot = parsePartSlot(url.searchParams.get('partSlot'))
  // The room of the part being assigned (parallel rooms); none, its only or main room.
  const roomId = parseOptionalId(url.searchParams.get('roomId'))

  if (!userId || Number.isNaN(userId)) return Response.json(null)
  // One slot per request: the check and the data must be about the same one.
  if (excludePartAssignmentId != null && excludeServiceAssignmentId != null) return Response.json(null, { status: 400 })

  return withScopeFromContext(context, async db => {
    const currentUser = context.get(currentAccountContext)
    const { congregationId } = currentUser
    const event = await findProgrammeEvent(db, eventId, congregationId)
    if (!event) return Response.json(null)
    // Absences and rotation are for whoever may assign this slot of this event.
    const slot =
      excludeServiceAssignmentId != null
        ? { kind: 'service' as const, assignmentId: excludeServiceAssignmentId }
        : { kind: 'part' as const, assignmentId: excludePartAssignmentId }
    const can = (role: Permission) => permissions.has(role)
    if (!(await mayReadSlotFacts(db, can, currentUser.id, event, congregationId, slot))) {
      return Response.json(null, { status: 403 })
    }

    // Publisher profile
    const user = await db.member.findFirst({
      where: { id: userId, congregationId },
      include: { publisherGroup: true, pioneerEnrolments: true },
    })
    if (!user) return Response.json(null)

    // The publisher's absences over this event, read as the list of people to pick from reads them.
    const daysOff = await listAbsencesOverRange(db, userId, event.startDate, event.endDate, congregationId)

    const sameEventAssignments = await listUserSameEventAssignments(db, {
      userId,
      eventId,
      congregationId,
      excludePartAssignmentId,
      roomId,
      excludeServiceAssignmentId,
    })

    const cadence = await resolvePublisherCadence(db, {
      userId,
      event,
      congregationId,
      excludePartAssignmentId,
      roomId,
      excludeServiceAssignmentId,
      partSlot,
    })

    return Response.json({
      profile: {
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        isHelder: user.isHelder,
        isServant: user.isServant,
        type: standingTypeFromEnrolments(user.pioneerEnrolments),
        group: user.publisherGroup ? formatGroupName(user.publisherGroup.name) : null,
      },
      daysOff: daysOff.map(d => ({
        startDate: d.startDate.toISOString(),
        endDate: d.endDate.toISOString(),
      })),
      sameEventAssignments,
      cadence,
    })
  })
}
