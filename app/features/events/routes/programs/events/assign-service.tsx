import { useState } from 'react'
import { Form, redirect, useSearchParams } from 'react-router'
import * as m from '~/paraglide/messages'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { assignServiceRole, getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/assign-service'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_assign_service_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const eventId = requireParamId(params.eventId, '/congregation/programs')
  const url = new URL(request.url)
  const assignmentId = Number(url.searchParams.get('assignmentId'))

  return withScope(congregationId, async db => {
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/congregation/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/congregation/programs')
    }

    const assignment = event.serviceRoleAssignments.find(a => a.id === assignmentId)

    const users = await db.user.findMany({
      where: { congregationId, active: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })

    return { event, assignment, users }
  })
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const eventId = requireParamId(params.eventId, '/congregation/programs')
  const form = await request.formData()
  const assignmentId = Number(form.get('assignmentId'))
  const rawAssigneeId = form.get('assigneeId')
  const assigneeId = rawAssigneeId && rawAssigneeId !== 'none' ? Number(rawAssigneeId) : null

  return withScope(congregationId, async db => {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/congregation/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/congregation/programs')
    }

    const result = await assignServiceRole(db, assignmentId, assigneeId, congregationId)

    if ('error' in result && result.error) {
      session.flash('error', result.error)
      logger.warn(`Service role assignment conflict. User ID: ${currentUser.id}. Event: ${eventId}.`)
    } else {
      session.flash('success', m.programs_assign_service_success())
      logger.info(`Assigned service role. User ID: ${currentUser.id}. Event: ${eventId}.`)
    }

    return redirect(`/congregation/programs/events/${eventId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function AssignServicePage({ loaderData }: Route.ComponentProps) {
  const { event, assignment, users } = loaderData
  const [params] = useSearchParams()
  const [selectedAssignee, setSelectedAssignee] = useState(assignment?.assigneeId?.toString() ?? 'none')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.programs_assign_service_page_title()}
        subtitle={`${event.name} — ${new Date(event.startDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{assignment?.name ?? m.programs_assign_service_default()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-4">
              <input type="hidden" name="assignmentId" value={params.get('assignmentId') ?? ''} />

              <div className="flex flex-col gap-2">
                <Label htmlFor="assigneeId">{m.programs_assign_service_publisher_label()}</Label>
                <Select name="assigneeId" value={selectedAssignee} onValueChange={setSelectedAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder={m.programs_assign_service_select_publisher()} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{m.programs_assign_service_none()}</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.firstname} {user.lastname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-fit">
                {m.common_save()}
              </Button>
            </Form>
          </CardContent>
        </Card>

        <PublisherInfoCard eventId={event.id} userId={selectedAssignee} partName={assignment?.name} />
      </div>
    </div>
  )
}
