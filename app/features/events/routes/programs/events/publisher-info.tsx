import { EventKind } from '~/features/events/model/event-kind.type'
import { listUserCadence } from '~/features/events/server/list-user-cadence.server'
import { listUserSameEventAssignments } from '~/features/events/server/list-user-same-event-assignments.server'
import { listUserServiceCadence } from '~/features/events/server/list-user-service-cadence.server'
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

const EMPTY_CADENCE = { past: [], future: [] } as const

type ResolveCadenceArgs = {
  userId: number
  event: { templateId: number | null; id: number; startDate: Date }
  congregationId: number
  excludePartAssignmentId: number | null
  excludeServiceAssignmentId: number | null
  partSlot: 'assignee' | 'assistant'
}

async function resolveCadence(
  db: Parameters<typeof listUserCadence>[0],
  { userId, event, congregationId, excludePartAssignmentId, excludeServiceAssignmentId, partSlot }: ResolveCadenceArgs,
) {
  if (excludePartAssignmentId != null) {
    const current = await db.programmePartAssignment.findFirst({
      where: { id: excludePartAssignmentId, congregationId },
      select: { name: true, section: true },
    })
    if (!current) return EMPTY_CADENCE
    return listUserCadence(db, {
      userId,
      event,
      congregationId,
      partName: current.name,
      partSection: current.section,
      slot: partSlot,
      pastCount: 6,
      futureCount: 6,
    })
  }

  if (excludeServiceAssignmentId != null) {
    const current = await db.programmeServiceRoleAssignment.findFirst({
      where: { id: excludeServiceAssignmentId, congregationId },
      select: { name: true },
    })
    if (!current) return EMPTY_CADENCE
    return listUserServiceCadence(db, {
      userId,
      event,
      congregationId,
      serviceRoleName: current.name,
      pastCount: 6,
      futureCount: 6,
    })
  }

  return EMPTY_CADENCE
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.ProgramViewer)) return Response.json(null, { status: 403 })

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const userId = Number(url.searchParams.get('userId'))
  const excludePartAssignmentId = parseOptionalId(url.searchParams.get('excludePartAssignmentId'))
  const excludeServiceAssignmentId = parseOptionalId(url.searchParams.get('excludeServiceAssignmentId'))
  const partSlot = url.searchParams.get('partSlot') === 'assistant' ? 'assistant' : 'assignee'

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

    // Look up the canonical anchor (name / section) from the assignment the
    // sheet is editing rather than trusting client-supplied values — this way
    // trimming, casing, or accent differences on the client don't leak into
    // the query, and the SAME normalization runs on both sides in the helper.
    const cadence = await resolveCadence(db, {
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
