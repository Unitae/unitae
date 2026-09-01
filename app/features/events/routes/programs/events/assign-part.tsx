import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { assignPartSchema } from '~/features/events/schemas/assign-part.schema'
import { assignPart } from '~/features/events/server/event-part-assignments.server'
import { assignmentBelongsToEvent, canEditEvent } from '~/features/events/server/events-auth.server'
import {
  buildAssignmentContext,
  dispatchAssignmentDiffs,
  partAssignmentDiffs,
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
import type { Route } from './+types/assign-part'

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
  const submission = parseWithZod(await request.formData(), { schema: assignPartSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { assignmentId, speakerType, assigneeId, assistantId, externalSpeakerId, topic, durationMin } = submission.value

  const resolvedExternalSpeakerId = speakerType === 'external' ? externalSpeakerId : null
  const resolvedAssigneeId = speakerType === 'external' ? null : assigneeId
  const resolvedAssistantId = speakerType === 'external' ? null : assistantId

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
      ))
    ) {
      throw redirect('/programs')
    }

    if (!(await assignmentBelongsToEvent(db, 'part', assignmentId, eventId, congregationId))) {
      throw redirect('/programs')
    }

    const assignmentBefore = await db.eventPart.findFirst({
      where: { id: assignmentId, congregationId },
      select: { name: true },
    })

    const result = await assignPart(
      db,
      assignmentId,
      resolvedAssigneeId,
      resolvedAssistantId,
      resolvedExternalSpeakerId,
      topic,
      congregationId,
      durationMin,
    )

    if ('error' in result) {
      session.flash('error', result.error)
      logger.warn(`Assignment conflict. User ID: ${currentUser.id}. Event: ${eventId}. Assignment: ${assignmentId}.`)
      return data({ ok: false }, { headers: { 'Set-Cookie': await commitSession(session) } })
    }

    session.flash('success', m.programs_assign_part_success())
    logger.info(`Assigned part. User ID: ${currentUser.id}. Event: ${eventId}. Assignment: ${assignmentId}.`)

    // Best-effort notifications: DB write already committed; log-and-continue on queue failures.
    const cong = context.get(congregationContext)
    const notifyCtx = buildAssignmentContext({
      event,
      assignmentName: assignmentBefore?.name,
      entityType: 'EventPart',
      entityId: assignmentId,
      congregationId,
      actorId: currentUser.id,
      locale: cong.locale,
      timezone: cong.timezone,
    })
    const diffs = partAssignmentDiffs(
      { previousAssigneeId: result.previousAssigneeId, previousAssistantId: result.previousAssistantId },
      { assigneeId: resolvedAssigneeId, assistantId: resolvedAssistantId },
    )
    await dispatchAssignmentDiffs(db, notifyCtx, diffs).catch(err =>
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
