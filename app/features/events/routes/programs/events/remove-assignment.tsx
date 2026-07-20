import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { unassignPart, unassignServiceRole } from '~/features/events/server/event-part-assignments.server'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import {
  buildAssignmentContext,
  dispatchAssignmentDiffs,
  partAssignmentDiffs,
  serviceRoleAssignmentDiffs,
} from '~/features/events/server/notify-assignment.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/remove-assignment'

export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/programs/events/${params.eventId}`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const assignmentId = Number(url.searchParams.get('id'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const cong = context.get(congregationContext)
    // `didRemove` gates the success flash so a stale double-submit that finds
    // nothing to remove reports honestly instead of pretending it worked.
    let didRemove = false

    if (type === 'part') {
      const assignmentBefore = await db.eventPart.findFirst({
        where: { id: assignmentId, congregationId },
        select: { name: true },
      })
      const result = await unassignPart(db, assignmentId, congregationId)
      logger.info(`Unassigned part. User ID: ${currentUser.id}. Assignment: ${assignmentId}.`)

      if (result) {
        didRemove = true
        // Best-effort notifications — see assign-part.tsx for rationale.
        await dispatchAssignmentDiffs(
          db,
          buildAssignmentContext({
            event,
            assignmentName: assignmentBefore?.name,
            entityType: 'EventPart',
            entityId: assignmentId,
            congregationId,
            actorId: currentUser.id,
            locale: cong.locale,
            timezone: cong.timezone,
          }),
          partAssignmentDiffs(
            { previousAssigneeId: result.previousAssigneeId, previousAssistantId: result.previousAssistantId },
            { assigneeId: null, assistantId: null },
          ),
        ).catch(err =>
          logger.error('Failed to dispatch programme-assignment notifications', {
            err,
            eventId,
            assignmentId,
            congregationId,
          }),
        )
      }
    } else if (type === 'service') {
      const assignmentBefore = await db.eventServiceRole.findFirst({
        where: { id: assignmentId, congregationId },
        select: { name: true },
      })
      const result = await unassignServiceRole(db, assignmentId, congregationId)
      logger.info(`Unassigned service role. User ID: ${currentUser.id}. Assignment: ${assignmentId}.`)

      if (result) {
        didRemove = true
        await dispatchAssignmentDiffs(
          db,
          buildAssignmentContext({
            event,
            assignmentName: assignmentBefore?.name,
            entityType: 'EventServiceRole',
            entityId: assignmentId,
            congregationId,
            actorId: currentUser.id,
            locale: cong.locale,
            timezone: cong.timezone,
          }),
          serviceRoleAssignmentDiffs({ previousAssigneeId: result.previousAssigneeId }, { assigneeId: null }),
        ).catch(err =>
          logger.error('Failed to dispatch programme-assignment notifications', {
            err,
            eventId,
            assignmentId,
            congregationId,
          }),
        )
      }
    }

    if (didRemove) {
      session.flash('success', m.programs_remove_assignment_success())
    }

    return data({ ok: didRemove }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}

export default function RemoveAssignment() {
  return null
}
