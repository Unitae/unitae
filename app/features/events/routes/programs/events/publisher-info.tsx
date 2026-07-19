import { EventKind } from '~/features/events/model/event-kind.type'
import { listUserSameEventAssignments } from '~/features/events/server/list-user-same-event-assignments.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/publisher-info'

function parseOptionalId(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.ProgramViewer)) return Response.json(null, { status: 403 })

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const userId = Number(url.searchParams.get('userId'))
  const partName = url.searchParams.get('partName') ?? ''
  const excludePartAssignmentId = parseOptionalId(url.searchParams.get('excludePartAssignmentId'))
  const excludeServiceAssignmentId = parseOptionalId(url.searchParams.get('excludeServiceAssignmentId'))

  if (!userId || Number.isNaN(userId)) return Response.json(null)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) return Response.json(null)

    // Publisher profile
    const user = await db.member.findFirst({
      where: { id: userId, congregationId },
      include: { publisherGroup: true, account: { select: { id: true } } },
    })
    if (!user) return Response.json(null)

    // Days-off overlapping this event — created by the publisher's account
    const accountId = user.account?.id
    const daysOff = accountId
      ? await db.event.findMany({
          where: {
            congregationId,
            createdById: accountId,
            kind: { key: EventKind.Off },
            startDate: { lte: event.endDate },
            endDate: { gte: event.startDate },
          },
          select: { id: true, startDate: true, endDate: true },
        })
      : []

    const sameEventAssignments = await listUserSameEventAssignments(db, {
      userId,
      eventId,
      congregationId,
      excludePartAssignmentId,
      excludeServiceAssignmentId,
    })

    // Recent history: last 5 assignments with the same part name
    const recentHistory = partName
      ? await db.programmePartAssignment.findMany({
          where: {
            congregationId,
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
        group: user.publisherGroup ? formatGroupName(user.publisherGroup.name) : null,
      },
      daysOff: daysOff.map(d => ({
        startDate: d.startDate.toISOString(),
        endDate: d.endDate.toISOString(),
      })),
      sameEventAssignments,
      recentHistory: recentHistory.map(a => ({
        date: a.event.startDate.toISOString(),
      })),
    })
  })
}
