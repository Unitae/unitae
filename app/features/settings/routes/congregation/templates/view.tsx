import { Calendar, Clock, Copy, Pencil, UserCog } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { dayLabel } from '~/features/events/model/day-label'
import {
  duplicateTemplate,
  getTemplateById,
  isTemplateResponsible,
} from '~/features/events/server/programme-templates.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Modèle de programme - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProgramViewer,
    Role.ProgramManager,
  ])

  if (!can(Role.ProgramViewer)) throw redirect('/')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScope(congregationId, async db => {
    const template = await getTemplateById(db, templateId, congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    const canEdit = can(Role.ProgramManager) || responsible != null

    logger.info(`Loading template view. User ID: ${currentUser.id}. Template: ${template.name}.`)

    return { template, canEdit }
  })
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScope(congregationId, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    if (!can(Role.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    const copy = await duplicateTemplate(db, templateId, congregationId)
    if (copy) {
      session.flash('success', `Modèle dupliqué : « ${copy.name} ».`)
      logger.info(`Duplicated template ${templateId} → ${copy.id}. User ID: ${currentUser.id}.`)
      return redirect(`/settings/congregation/templates/${copy.id}`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    session.flash('error', 'Impossible de dupliquer ce modèle.')
    return redirect(`/settings/congregation/templates/${templateId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function TemplateViewPage({ loaderData }: Route.ComponentProps) {
  const { template, canEdit } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={template.name}
        subtitle={template.description || 'Modèle de programme'}
        actions={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="./responsible">
                  <UserCog className="size-4" />
                  Responsable
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="./edit">
                  <Pencil className="size-4" />
                  Modifier
                </Link>
              </Button>
              <Form method="post">
                <Button variant="outline" size="sm" type="submit">
                  <Copy className="size-4" />
                  Dupliquer
                </Button>
              </Form>
            </div>
          )
        }
      />

      <div className="flex items-center gap-3">
        {template.weekDay != null && (
          <Badge variant="outline">
            <Calendar className="mr-1 size-3" />
            {dayLabel(template.weekDay)}
          </Badge>
        )}
        {template.weekDay == null && <Badge variant="secondary">Évènement ponctuel</Badge>}
        {template.responsibles[0] && (
          <Badge variant="outline">
            <UserCog className="mr-1 size-3" />
            {template.responsibles[0].user.firstname} {template.responsibles[0].user.lastname}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programme spirituel</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Partie</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="w-24">Durée</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {template.parts.map(part => (
                <TableRow key={part.id}>
                  <TableCell className="text-muted-foreground">{part.order}</TableCell>
                  <TableCell className="font-medium">
                    {part.name}
                    {part.isVariable && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Variable
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{part.section || '—'}</TableCell>
                  <TableCell>
                    {part.durationMin ? (
                      <span className="flex items-center gap-1 text-muted-foreground text-sm">
                        <Clock className="size-3" />
                        {part.durationMin} min
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">Variable</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rôles de service</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {template.serviceRoles.map(role => (
              <Badge key={role.id} variant="outline">
                {role.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
