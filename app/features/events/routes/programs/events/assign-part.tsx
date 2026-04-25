import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect, useSearchParams } from 'react-router'
import { useUnsavedChanges } from '~/shared/hooks/use-unsaved-changes'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { assignPartSchema } from '~/features/events/schemas/assign-part.schema'
import { assignPart, getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Role } from '~/shared/types/role'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/assign-part'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_assign_part_meta_title() }]
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const assignmentId = Number(url.searchParams.get('assignmentId'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Role) => permissions.has(role)
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const assignment = event.partAssignments.find(a => a.id === assignmentId)

    const users = await db.user.findMany({
      where: { congregationId, active: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })

    return { event, assignment, users }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))

  const eventId = requireParamId(params.eventId, '/programs')
  const submission = parseWithZod(await request.formData(), { schema: assignPartSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { assignmentId, assigneeId, assistantId, topic } = submission.value

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Role) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const result = await assignPart(db, assignmentId, assigneeId, assistantId, topic, congregationId)

    if ('error' in result && result.error) {
      session.flash('error', result.error)
      logger.warn(`Assignment conflict. User ID: ${currentUser.id}. Event: ${eventId}. Assignment: ${assignmentId}.`)
    } else {
      session.flash('success', m.programs_assign_part_success())
      logger.info(`Assigned part. User ID: ${currentUser.id}. Event: ${eventId}. Assignment: ${assignmentId}.`)
    }

    return redirect(`/programs/events/${eventId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function AssignPartPage({ loaderData }: Route.ComponentProps) {
  const { event, assignment, users } = loaderData
  const [params] = useSearchParams()
  const [selectedAssignee, setSelectedAssignee] = useState(assignment?.assigneeId?.toString() ?? 'none')
  const [selectedAssistant, setSelectedAssistant] = useState(assignment?.assistantId?.toString() ?? 'none')
  const { blocker, markDirty } = useUnsavedChanges()

  const activeSelection =
    selectedAssignee !== 'none' ? selectedAssignee : selectedAssistant !== 'none' ? selectedAssistant : null

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.programs_assign_part_page_title()}
        subtitle={`${event.name} — ${new Date(event.startDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="assigneeId">{m.programs_assign_part_speaker_label()}</Label>
                <Select name="assigneeId" value={selectedAssignee} onValueChange={setSelectedAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder={m.programs_assign_part_select_publisher()} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{m.programs_assign_part_none()}</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.firstname} {user.lastname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="assistantId">{m.programs_assign_part_reader_label()}</Label>
                <Select name="assistantId" value={selectedAssistant} onValueChange={setSelectedAssistant}>
                  <SelectTrigger>
                    <SelectValue placeholder={m.programs_assign_part_no_reader()} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{m.programs_assign_part_none()}</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.firstname} {user.lastname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
            </Form>
          </CardContent>
        </Card>

        <PublisherInfoCard eventId={event.id} userId={activeSelection} partName={assignment?.name} />
      </div>
    </div>
  )
}
