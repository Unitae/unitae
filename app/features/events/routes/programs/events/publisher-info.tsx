import { EventKind } from '~/features/events/model/event-kind.type'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/publisher-info'

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.ProgramViewer)) return Response.json(null, { status: 403 })

  const eventId = requireParamId(params.eventId, '/congregation/programs')
  const url = new URL(request.url)
  const userId = Number(url.searchParams.get('userId'))
  const partName = url.searchParams.get('partName') ?? ''

  if (!userId || Number.isNaN(userId)) return Response.json(null)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) return Response.json(null)

    // Publisher profile
    const user = await db.user.findFirst({
      where: { id: userId, congregationId },
      include: { publisherGroup: true },
    })
    if (!user) return Response.json(null)

    // Days-off overlapping this event
    const daysOff = await db.event.findMany({
      where: {
        congregationId,
        createdById: userId,
        kind: { key: EventKind.Off },
        startDate: { lte: event.endDate },
        endDate: { gte: event.startDate },
      },
      select: { id: true, startDate: true, endDate: true },
    })

    // Other assignments on the same event
    const sameEventParts = await db.programmePartAssignment.findMany({
      where: {
        eventId,
        congregationId,
        // biome-ignore lint/style/useNamingConvention: prisma syntax
        OR: [{ assigneeId: userId }, { assistantId: userId }],
      },
      select: { id: true, name: true, section: true },
    })

    const sameEventServices = await db.programmeServiceRoleAssignment.findMany({
      where: { eventId, assigneeId: userId, congregationId },
      select: { id: true, name: true },
    })

    // Recent history: last 5 assignments with the same part name
    const recentHistory = partName
      ? await db.programmePartAssignment.findMany({
          where: {
            congregationId,
            // biome-ignore lint/style/useNamingConvention: prisma syntax
            OR: [{ assigneeId: userId }, { assistantId: userId }],
            name: partName,
            event: { startDate: { lt: new Date() } },
          },
          include: { event: { select: { startDate: true } } },
          orderBy: { event: { startDate: 'desc' } },
          take: 5,
        })
      : []

    return Response.json({
      profile: {
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        isHelder: user.isHelder,
        isServant: user.isServant,
        type: user.type,
        group: user.publisherGroup?.name ?? null,
      },
      daysOff: daysOff.map(d => ({
        startDate: d.startDate.toISOString(),
        endDate: d.endDate.toISOString(),
      })),
      sameEventAssignments: [
        ...sameEventParts.map(a => ({ type: 'part' as const, name: a.name, section: a.section })),
        ...sameEventServices.map(a => ({ type: 'service' as const, name: a.name })),
      ],
      recentHistory: recentHistory.map(a => ({
        date: a.event.startDate.toISOString(),
      })),
    })
  })
}
