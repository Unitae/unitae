import { useState } from 'react'
import { Form, redirect, useSearchParams } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { assignPart, getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/assign-part'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Attribuer une partie - Unitae' }]
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

    const assignment = event.partAssignments.find(a => a.id === assignmentId)

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
  const rawAssistantId = form.get('assistantId')
  const assistantId = rawAssistantId && rawAssistantId !== 'none' ? Number(rawAssistantId) : null
  const topic = String(form.get('topic') ?? '')

  return withScope(congregationId, async db => {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/congregation/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/congregation/programs')
    }

    const result = await assignPart(db, assignmentId, assigneeId, assistantId, topic, congregationId)

    if ('error' in result && result.error) {
      session.flash('error', result.error)
      logger.warn(`Assignment conflict. User ID: ${currentUser.id}. Event: ${eventId}. Assignment: ${assignmentId}.`)
    } else {
      session.flash('success', 'Attribution enregistrée.')
      logger.info(`Assigned part. User ID: ${currentUser.id}. Event: ${eventId}. Assignment: ${assignmentId}.`)
    }

    return redirect(`/congregation/programs/events/${eventId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function AssignPartPage({ loaderData }: Route.ComponentProps) {
  const { event, assignment, users } = loaderData
  const [params] = useSearchParams()
  const [selectedAssignee, setSelectedAssignee] = useState(assignment?.assigneeId?.toString() ?? 'none')
  const [selectedAssistant, setSelectedAssistant] = useState(assignment?.assistantId?.toString() ?? 'none')

  const activeSelection =
    selectedAssignee !== 'none' ? selectedAssignee : selectedAssistant !== 'none' ? selectedAssistant : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attribuer une partie"
        subtitle={`${event.name} — ${new Date(event.startDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{assignment?.name ?? 'Partie'}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-4">
              <input type="hidden" name="assignmentId" value={params.get('assignmentId') ?? ''} />

              <div className="flex flex-col gap-2">
                <Label htmlFor="topic">Sujet / Titre</Label>
                <Input id="topic" name="topic" defaultValue={assignment?.topic ?? ''} />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="assigneeId">Intervenant</Label>
                <Select name="assigneeId" value={selectedAssignee} onValueChange={setSelectedAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un proclamateur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.firstname} {user.lastname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="assistantId">Lecteur (facultatif)</Label>
                <Select name="assistantId" value={selectedAssistant} onValueChange={setSelectedAssistant}>
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun lecteur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.firstname} {user.lastname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-fit">
                Enregistrer
              </Button>
            </Form>
          </CardContent>
        </Card>

        <PublisherInfoCard eventId={event.id} userId={activeSelection} partName={assignment?.name} />
      </div>
    </div>
  )
}
