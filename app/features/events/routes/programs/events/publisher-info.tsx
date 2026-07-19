import { ProgrammeTemplateKey } from '~/features/events/model/programme-template.type'
import type { PartSlot } from '~/features/events/server/cadence-shared.server'
import { listUserSameEventAssignments } from '~/features/events/server/list-user-same-event-assignments.server'
import { resolvePublisherCadence } from '~/features/events/server/resolve-publisher-cadence.server'
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

// Default 'assignee' — the more common slot and the only one that matters
// for services. Unknown / missing values shouldn't 500 the info panel.
function parsePartSlot(raw: string | null): PartSlot {
  return raw === 'assistant' ? 'assistant' : 'assignee'
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.ProgramViewer)) return Response.json(null, { status: 403 })

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const userId = Number(url.searchParams.get('userId'))
  const excludePartAssignmentId = parseOptionalId(url.searchParams.get('excludePartAssignmentId'))
  const excludeServiceAssignmentId = parseOptionalId(url.searchParams.get('excludeServiceAssignmentId'))
  const partSlot = parsePartSlot(url.searchParams.get('partSlot'))

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
            template: { key: ProgrammeTemplateKey.DayOff },
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

    const cadence = await resolvePublisherCadence(db, {
      userId,
      event,
      congregationId,
      excludePartAssignmentId,
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
        type: user.type,
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
