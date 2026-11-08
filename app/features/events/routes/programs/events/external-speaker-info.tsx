import { mayReadSlotFacts } from '~/features/events/server/events-auth.server'
import { resolveExternalSpeakerCadence } from '~/features/events/server/resolve-external-speaker-cadence.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/external-speaker-info'

function parseOptionalId(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const externalSpeakerId = Number(url.searchParams.get('externalSpeakerId'))
  const excludePartAssignmentId = parseOptionalId(url.searchParams.get('excludePartAssignmentId'))

  if (!externalSpeakerId || Number.isNaN(externalSpeakerId)) return Response.json(null)

  return withScopeFromContext(context, async db => {
    const currentUser = context.get(currentAccountContext)
    const { congregationId } = currentUser
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) return Response.json(null)
    // A speaker's contact details and visits are for whoever may assign this part of this event.
    const can = (role: Permission) => permissions.has(role)
    const slot = { kind: 'part' as const, assignmentId: excludePartAssignmentId }
    if (!(await mayReadSlotFacts(db, can, currentUser.id, event, congregationId, slot))) {
      return Response.json(null, { status: 403 })
    }

    const speaker = await db.externalSpeaker.findFirst({
      where: { id: externalSpeakerId, congregationId },
    })
    if (!speaker) return Response.json(null)

    const recentHistory = await db.eventPart.findMany({
      where: {
        congregationId,
        externalSpeakerId,
        event: { startDate: { lt: new Date() } },
      },
      select: {
        name: true,
        topic: true,
        event: { select: { startDate: true } },
      },
      orderBy: { event: { startDate: 'desc' } },
      take: 5,
    })

    const cadence = await resolveExternalSpeakerCadence(db, {
      externalSpeakerId,
      event,
      congregationId,
      excludePartAssignmentId,
    })

    return Response.json({
      profile: {
        id: speaker.id,
        name: speaker.name,
        congregationName: speaker.congregationName,
        phone: speaker.phone,
        email: speaker.email,
        notes: speaker.notes,
        isIncomplete: speaker.congregationName === '',
      },
      recentHistory: recentHistory.map(h => ({
        date: h.event.startDate.toISOString(),
        partName: h.name,
        topic: h.topic,
      })),
      cadence,
    })
  })
}
