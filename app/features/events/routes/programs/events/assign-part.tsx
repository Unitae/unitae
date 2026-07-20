import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, Link, redirect, useSearchParams } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { assignPartSchema } from '~/features/events/schemas/assign-part.schema'
import { loadPartAssignmentCandidates } from '~/features/events/server/assign-part-loader.server'
import { assignPart, getEventProgramme } from '~/features/events/server/event-part-assignments.server'
import { canEditEvent } from '~/features/events/server/events-auth.server'
import {
  buildAssignmentContext,
  dispatchAssignmentDiffs,
  partAssignmentDiffs,
} from '~/features/events/server/notify-assignment.server'
import { ExternalSpeakerInfoCard } from '~/features/events/ui/ExternalSpeakerInfoCard'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatEventDate } from '~/shared/utils/event-time'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/assign-part'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_assign_part_meta_title() }]
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const assignmentId = Number(url.searchParams.get('assignmentId'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const assignment = event.eventParts.find(a => a.id === assignmentId)
    const candidates = await loadPartAssignmentCandidates(db, assignment, congregationId)

    return {
      event,
      assignment,
      speakerCandidates: candidates.speakerCandidates,
      readerCandidates: candidates.readerCandidates,
      externalSpeakers: candidates.externalSpeakers,
      timezone: context.get(congregationContext).timezone,
    }
  })
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

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
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

export default function AssignPartPage({ loaderData }: Route.ComponentProps) {
  const { event, assignment, speakerCandidates, readerCandidates, externalSpeakers, timezone } = loaderData
  const [params] = useSearchParams()
  const [selectedAssignee, setSelectedAssignee] = useState(assignment?.assigneeId?.toString() ?? '')
  const [selectedAssistant, setSelectedAssistant] = useState(assignment?.assistantId?.toString() ?? '')
  const [selectedExternalSpeaker, setSelectedExternalSpeaker] = useState(
    assignment?.externalSpeakerId?.toString() ?? 'none',
  )
  const [speakerType, setSpeakerType] = useState<'internal' | 'external'>(
    assignment?.externalSpeakerId ? 'external' : 'internal',
  )
  const { blocker, markDirty } = useUnsavedChanges()
  const hasRegistry = externalSpeakers.length > 0
  const commonCardProps = { eventId: event.id, excludePartAssignmentId: assignment?.id ?? null }

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.programs_assign_part_page_title()}
        subtitle={`${event.name} — ${formatEventDate(event.startDate, timezone, 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: m.programs_assign_part_page_title() }]}
        backTo={`/programs/events/${event.id}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{assignment?.name ?? m.programs_assign_part_default()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
              <input type="hidden" name="assignmentId" value={params.get('assignmentId') ?? ''} />

              <div className="flex flex-col gap-2">
                <Label htmlFor="topic">{m.programs_assign_part_topic_label()}</Label>
                <Input id="topic" name="topic" defaultValue={assignment?.topic ?? ''} />
              </div>

              {assignment?.allowExternalSpeaker && (
                <div className="flex flex-col gap-2">
                  <Label>{m.programs_assign_part_speaker_type_label()}</Label>
                  <RadioGroup
                    name="speakerType"
                    value={speakerType}
                    onValueChange={v => setSpeakerType(v as 'internal' | 'external')}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="internal" id="speakerInternal" />
                      <Label htmlFor="speakerInternal">{m.programs_assign_part_speaker_type_internal()}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="external" id="speakerExternal" />
                      <Label htmlFor="speakerExternal">{m.programs_assign_part_speaker_type_external()}</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {speakerType === 'external' ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="externalSpeakerId">{m.programs_assign_part_speaker_label()}</Label>
                  <Select
                    name="externalSpeakerId"
                    value={selectedExternalSpeaker}
                    onValueChange={setSelectedExternalSpeaker}
                    disabled={!hasRegistry}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          hasRegistry
                            ? m.programs_assign_part_external_select_placeholder()
                            : m.programs_assign_part_external_empty()
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{m.programs_assign_part_none()}</SelectItem>
                      {externalSpeakers.map(speaker => (
                        <SelectItem key={speaker.id} value={speaker.id.toString()}>
                          {speaker.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!hasRegistry && (
                    <Link to="/programs/external-speakers/new" className="text-primary text-sm hover:underline">
                      {m.programs_assign_part_external_manage_link()}
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="assigneeId">{m.programs_assign_part_speaker_label()}</Label>
                    <PersonDropdown
                      id="assigneeId"
                      name="assigneeId"
                      people={speakerCandidates}
                      value={selectedAssignee}
                      onValueChange={setSelectedAssignee}
                      placeholder={m.programs_assign_part_select_publisher()}
                      noneLabel={m.programs_assign_part_none()}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="assistantId">{m.programs_assign_part_reader_label()}</Label>
                    <PersonDropdown
                      id="assistantId"
                      name="assistantId"
                      people={readerCandidates}
                      value={selectedAssistant}
                      onValueChange={setSelectedAssistant}
                      placeholder={m.programs_assign_part_no_reader()}
                      noneLabel={m.programs_assign_part_none()}
                    />
                  </div>
                </>
              )}

              <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
            </Form>
          </CardContent>
        </Card>

        {speakerType === 'internal' ? (
          <div className="flex flex-col gap-6">
            <PublisherInfoCard {...commonCardProps} userId={selectedAssignee} partSlot="assignee" />
            <PublisherInfoCard {...commonCardProps} userId={selectedAssistant} partSlot="assistant" />
          </div>
        ) : (
          <ExternalSpeakerInfoCard
            eventId={event.id}
            externalSpeakerId={selectedExternalSpeaker}
            excludePartAssignmentId={assignment?.id ?? null}
          />
        )}
      </div>
    </div>
  )
}
