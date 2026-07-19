import { Calendar, Clock, Copy, Pencil, UserCog } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { dayLabel, isSystemTemplate } from '~/features/events'
import { duplicateTemplate, getTemplateById, isTemplateResponsible } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { formatPersonName, resolveAccountName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_view_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.ProgramViewer)

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const template = await getTemplateById(db, templateId, currentUser.congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    const canEdit = permissions.has(Permission.ProgramManager) || responsible != null

    logger.info(`Loading template view. User ID: ${currentUser.id}. Template: ${template.name}.`)

    return { template, canEdit, isSystem: isSystemTemplate(template.key) }
  })
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    if (!permissions.has(Permission.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    const session = await getSession(request.headers.get('Cookie'))
    const copy = await duplicateTemplate(db, templateId, currentUser.congregationId)
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
  const { template, canEdit, isSystem } = loaderData

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
              {!isSystem && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="./responsible">
                    <UserCog className="size-4" />
                    {m.settings_template_view_responsible_button()}
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to="./edit">
                  <Pencil className="size-4" />
                  {m.settings_template_view_edit_button()}
                </Link>
              </Button>
              {!isSystem && (
                <Form method="post">
                  <Button variant="outline" size="sm" type="submit">
                    <Copy className="size-4" />
                    {m.settings_template_view_duplicate_button()}
                  </Button>
                </Form>
              )}
            </div>
          )
        }
      />

      {!isSystem && (
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
              {formatPersonName(resolveAccountName(template.responsibles[0].user))}
            </Badge>
          )}
        </div>
      )}

      {isSystem ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid gap-0 md:min-h-[340px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            {/* Specimen — the colour is the identity. Clicking it edits it. */}
            <Link
              to="./edit"
              className="group relative flex aspect-[5/3] items-end justify-start p-6 outline-none transition-[filter] duration-200 md:aspect-auto hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              style={{ backgroundColor: template.color }}
              aria-label={m.settings_template_edit_colour_action()}
            >
              <span className="pointer-events-none inline-flex translate-y-1 items-center gap-1.5 rounded-full border bg-card/95 px-3 py-1 font-medium text-card-foreground text-xs opacity-85 shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-hover:shadow-md group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                <Pencil className="size-3" aria-hidden="true" />
                {m.settings_template_edit_colour_action()}
              </span>
            </Link>

            {/* Museum label */}
            <div className="flex flex-col gap-6 border-t p-6 md:border-t-0 md:border-l md:p-10">
              <div className="inline-flex w-fit items-baseline gap-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                <span aria-hidden="true" className="opacity-60">
                  [
                </span>
                {m.settings_template_system_tag()}
                <span aria-hidden="true" className="opacity-60">
                  ]
                </span>
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="font-display font-normal text-4xl text-foreground leading-none tracking-tight md:text-5xl">
                  {template.name}
                </h2>
                <div className="h-px w-12 bg-foreground/25" aria-hidden="true" />
                <p className="max-w-prose text-muted-foreground text-sm leading-relaxed">
                  {template.key === 'day-off'
                    ? m.settings_template_system_body_day_off()
                    : m.settings_template_system_body_freeform()}
                </p>
              </div>

              <dl className="mt-auto grid grid-cols-1 gap-x-8 gap-y-5 border-t pt-6 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <dt className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
                    {m.settings_template_identifier_label()}
                  </dt>
                  <dd className="font-mono text-sm">{template.key}</dd>
                </div>
                <div className="flex flex-col gap-1.5">
                  <dt className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
                    {m.settings_template_usage_label()}
                  </dt>
                  <dd className="text-sm">
                    {template.key === 'day-off'
                      ? m.settings_template_usage_day_off()
                      : m.settings_template_usage_freeform()}
                  </dd>
                </div>
                <div className="flex flex-col gap-1.5">
                  <dt className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
                    {m.settings_template_colour_label()}
                  </dt>
                  <dd className="font-mono text-sm uppercase">{template.color}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
