import { Calendar, Clock, Copy, Pencil, UserCog } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { dayLabel } from '~/features/events/model/day-label'
import {
  duplicateTemplate,
  getTemplateById,
  isTemplateResponsible,
} from '~/features/events/server/programme-templates.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_view_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.ProgramViewer)) throw redirect('/')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const template = await getTemplateById(db, templateId, currentUser.congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    const canEdit = permissions.has(Role.ProgramManager) || responsible != null

    logger.info(`Loading template view. User ID: ${currentUser.id}. Template: ${template.name}.`)

    return { template, canEdit }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    if (!permissions.has(Role.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    const session = await getSession(request.headers.get('Cookie'))
    const copy = await duplicateTemplate(db, templateId, currentUser.congregationId, currentUser.id)
    if (copy) {
      session.flash('success', m.settings_template_view_duplicate_success({ name: copy.name }))
      logger.info(`Duplicated template ${templateId} → ${copy.id}. User ID: ${currentUser.id}.`)
      return redirect(`/settings/congregation/templates/${copy.id}`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    session.flash('error', m.settings_template_view_duplicate_error())
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
        subtitle={template.description || m.settings_template_view_default_subtitle()}
        breadcrumbs={[{ label: m.sidebar_settings_assembly(), to: '/settings/congregation' }, { label: template.name }]}
        backTo="/settings/congregation/templates"
        actions={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="./responsible">
                  <UserCog className="size-4" />
                  {m.settings_template_view_responsible_button()}
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="./edit">
                  <Pencil className="size-4" />
                  {m.settings_template_view_edit_button()}
                </Link>
              </Button>
              <Form method="post">
                <Button variant="outline" size="sm" type="submit">
                  <Copy className="size-4" />
                  {m.settings_template_view_duplicate_button()}
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
        {template.weekDay == null && <Badge variant="secondary">{m.settings_template_view_one_time_event()}</Badge>}
        {template.responsibles[0] && (
          <Badge variant="outline">
            <UserCog className="mr-1 size-3" />
            {template.responsibles[0].user.firstname} {template.responsibles[0].user.lastname}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_view_spiritual_program()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{m.settings_template_view_part_column()}</TableHead>
                <TableHead>{m.settings_template_view_section_column()}</TableHead>
                <TableHead className="w-24">{m.settings_template_view_duration_column()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {template.parts.map(part => (
                <TableRow key={part.id}>
                  <TableCell className="text-muted-foreground">{part.order}</TableCell>
                  <TableCell className="font-medium">{part.name}</TableCell>
                  <TableCell className="text-muted-foreground">{part.section || '—'}</TableCell>
                  <TableCell>
                    {part.durationMin ? (
                      <span className="flex items-center gap-1 text-muted-foreground text-sm">
                        <Clock className="size-3" />
                        {m.settings_template_view_duration_min({ minutes: String(part.durationMin) })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
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
          <CardTitle className="text-base">{m.settings_template_view_service_roles_title()}</CardTitle>
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
