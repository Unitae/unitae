import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { assignServiceSchema } from '~/features/events/schemas/assign-service.schema'
import { assignServicePart } from '~/features/events/server/event-part-assignments.server'
import { assignmentBelongsToEvent, canEditEvent } from '~/features/events/server/events-auth.server'
import {
  buildAssignmentContext,
  dispatchAssignmentDiffs,
  servicePartAssignmentDiffs,
} from '~/features/events/server/notify-assignment.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/assign-service'

// The assignment form lives in the sheet on the event page; this route
// exists for its action. A bookmark or a hard refresh still lands here, so
// send the visitor to the programme rather than render a blank page.
export function loader({ params }: Route.LoaderArgs) {
  const eventId = requireParamId(params.eventId, '/programs')
  throw redirect(`/programs/events/${eventId}`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))

  const eventId = requireParamId(params.eventId, '/programs')
  const submission = parseWithZod(await request.formData(), { schema: assignServiceSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { assignmentId, assigneeId } = submission.value

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (
      !(await canEditEvent(
        db,
        can,
        currentUser.id,
        event.templateId ?? null,
        congregationId,
        Permission.CanAssignProgramParts,
        ResponsibilityScope.Service,
      ))
    ) {
      throw redirect('/programs')
    }

    if (!(await assignmentBelongsToEvent(db, 'service', assignmentId, eventId, congregationId))) {
      throw redirect('/programs')
    }

    const assignmentBefore = await db.eventServicePart.findFirst({
      where: { id: assignmentId, congregationId },
      select: { name: true },
    })

    const result = await assignServicePart(db, assignmentId, assigneeId, congregationId)

    if ('error' in result) {
      session.flash('error', result.error)
      logger.warn(`Service role assignment conflict. User ID: ${currentUser.id}. Event: ${eventId}.`)
      return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
    }

    session.flash('success', m.programs_assign_service_success())
    logger.info(`Assigned service role. User ID: ${currentUser.id}. Event: ${eventId}.`)

    const cong = context.get(congregationContext)
    // Best-effort: DB write already committed; log-and-continue on queue failures.
    await dispatchAssignmentDiffs(
      db,
      buildAssignmentContext({
        event,
        assignmentName: assignmentBefore?.name,
        entityType: 'EventServicePart',
        entityId: assignmentId,
        congregationId,
        actorId: currentUser.id,
        locale: cong.locale,
        timezone: cong.timezone,
      }),
      servicePartAssignmentDiffs({ previousAssigneeId: result.previousAssigneeId }, { assigneeId }),
    ).catch(err =>
      logger.error('Failed to dispatch programme-assignment notifications', {
        err,
        eventId,
        assignmentId,
        congregationId,
      }),
    )

    return data({ ok: true }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
