import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import {
  getTemplateById,
  removeTemplateResponsible,
  setTemplateResponsible,
} from '~/features/events/server/programme-templates.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/responsible'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Responsable du programme - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  if (!can(Role.ProgramManager)) throw redirect('/settings/congregation/templates')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScope(congregationId, async db => {
    const template = await getTemplateById(db, templateId, congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const users = await db.user.findMany({
      where: { congregationId, active: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })

    return {
      template,
      users,
      currentResponsibleId: template.responsibles[0]?.userId ?? null,
    }
  })
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  if (!can(Role.ProgramManager)) throw redirect('/settings/congregation/templates')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  const form = await request.formData()
  const userId = form.get('userId') ? Number(form.get('userId')) : null

  return withScope(congregationId, async db => {
    if (userId) {
      await setTemplateResponsible(db, templateId, userId, congregationId)
      session.flash('success', 'Responsable assigné.')
      logger.info(
        `Set template responsible. User ID: ${currentUser.id}. Template: ${templateId}. Responsible: ${userId}.`,
      )
    } else {
      await removeTemplateResponsible(db, templateId, congregationId)
      session.flash('success', 'Responsable retiré.')
      logger.info(`Removed template responsible. User ID: ${currentUser.id}. Template: ${templateId}.`)
    }

    return redirect(`/settings/congregation/templates/${templateId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function ResponsiblePage({ loaderData }: Route.ComponentProps) {
  const { template, users, currentResponsibleId } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Responsable : ${template.name}`}
        subtitle="Désignez un frère responsable de ce programme. Il pourra gérer les évènements et les attributions sans avoir le rôle de gestionnaire de programmes."
      />

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Choisir un responsable</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="userId">Responsable</Label>
              <Select name="userId" defaultValue={currentResponsibleId?.toString() ?? ''}>
                <SelectTrigger>
                  <SelectValue placeholder="Aucun responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun responsable</SelectItem>
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
