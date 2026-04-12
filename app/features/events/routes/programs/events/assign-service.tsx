import { Form, redirect, useSearchParams } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { assignServiceRole, getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { isTemplateResponsible } from '~/features/events/server/programme-templates.server'
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
  return [{ title: 'Attribuer un service - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const eventId = requireParamId(params.eventId, '/congregation/programs')
  const url = new URL(request.url)
  const serviceRoleId = Number(url.searchParams.get('serviceRoleId'))

  return withScope(congregationId, async db => {
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/congregation/programs')

    const responsible = event.templateId
      ? await isTemplateResponsible(db, event.templateId, currentUser.id, congregationId)
      : null
    if (!can(Role.ProgramManager) && !responsible) throw redirect('/congregation/programs')

    const assignment = event.serviceRoleAssignments.find(a => a.serviceRoleId === serviceRoleId)

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
  const serviceRoleId = Number(form.get('serviceRoleId'))
  const assigneeId = form.get('assigneeId') ? Number(form.get('assigneeId')) : null

  return withScope(congregationId, async db => {
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/congregation/programs')

    const responsible = event.templateId
      ? await isTemplateResponsible(db, event.templateId, currentUser.id, congregationId)
      : null
    if (!can(Role.ProgramManager) && !responsible) throw redirect('/congregation/programs')

    const result = await assignServiceRole(db, eventId, serviceRoleId, assigneeId, congregationId)

    if ('error' in result && result.error) {
      session.flash('error', result.error)
      logger.warn(`Service role assignment conflict. User ID: ${currentUser.id}. Event: ${eventId}.`)
    } else {
      session.flash('success', 'Attribution de service enregistrée.')
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attribuer un service"
        subtitle={`${event.name} — ${new Date(event.startDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
      />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{assignment?.serviceRole.name ?? 'Service'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="serviceRoleId" value={params.get('serviceRoleId') ?? ''} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="assigneeId">Proclamateur</Label>
              <Select name="assigneeId" defaultValue={assignment?.assigneeId?.toString() ?? ''}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un proclamateur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun</SelectItem>
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
    </div>
  )
}
