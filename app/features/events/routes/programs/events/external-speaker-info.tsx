import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/external-speaker-info'

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.ProgramViewer)) return Response.json(null, { status: 403 })

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const externalSpeakerId = Number(url.searchParams.get('externalSpeakerId'))

  if (!externalSpeakerId || Number.isNaN(externalSpeakerId)) return Response.json(null)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) return Response.json(null)

    const speaker = await db.externalSpeaker.findFirst({
      where: { id: externalSpeakerId, congregationId },
    })
    if (!speaker) return Response.json(null)

    const recentHistory = await db.programmePartAssignment.findMany({
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
    })
  })
}
