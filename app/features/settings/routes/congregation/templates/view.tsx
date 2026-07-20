import { Calendar, CalendarOff, CalendarPlus, Clock, Copy, Pencil, Trash2, UserCog } from 'lucide-react'
import { useState } from 'react'
import { Form, Link, redirect, useFetcher } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { dayLabel, InlineDeleteDialog, isSystemTemplate } from '~/features/events'
import {
  deleteTemplate,
  duplicateTemplate,
  getTemplateById,
  isTemplateResponsible,
} from '~/features/events/index.server'
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
import { EmptyState } from '~/shared/ui/EmptyState'
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

    const [responsible, eventCount] = await Promise.all([
      isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId),
      db.event.count({ where: { templateId, congregationId: currentUser.congregationId } }),
    ])
    const canEdit = permissions.has(Permission.ProgramManager) || responsible != null
    const isSystem = isSystemTemplate(template.key)
    // Deleting a whole template is manager-only and never allowed for system
    // rows; responsibles may edit content but not remove the template.
    const canDelete = permissions.has(Permission.ProgramManager) && !isSystem

    logger.info(`Loading template view. User ID: ${currentUser.id}. Template: ${template.name}.`)

    return { template, canEdit, canDelete, eventCount, isSystem }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  const formData = await request.formData()
  const intent = formData.get('intent')

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles duplicate + delete intents in a single scoped transaction
  return withScopeFromContext(context, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    if (!permissions.has(Permission.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    const session = await getSession(request.headers.get('Cookie'))

    if (intent === 'delete') {
      // Whole-template removal is manager-only; responsibles edit content only.
      if (!permissions.has(Permission.ProgramManager)) {
        throw redirect(`/settings/congregation/templates/${templateId}`)
      }
      const result = await deleteTemplate(db, templateId, currentUser.congregationId)
      if (result.ok) {
        session.flash('success', m.settings_template_view_delete_success({ name: result.name }))
        logger.info(`Deleted template ${templateId}. User ID: ${currentUser.id}.`)
        return redirect('/settings/congregation/templates', {
          headers: { 'Set-Cookie': await commitSession(session) },
        })
      }
      session.flash(
        'error',
        result.reason === 'in-use'
          ? m.settings_template_view_delete_in_use({ count: String(result.eventCount) })
          : m.settings_template_view_delete_error(),
      )
      return redirect(`/settings/congregation/templates/${templateId}`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

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
  const { template, canEdit, canDelete, eventCount, isSystem } = loaderData
  const [confirmOpen, setConfirmOpen] = useState(false)
  const deleteFetcher = useFetcher()

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
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={eventCount > 0}
                  title={
                    eventCount > 0 ? m.settings_template_view_delete_in_use({ count: String(eventCount) }) : undefined
                  }
                >
                  <Trash2 className="size-4" />
                  {m.common_delete()}
                </Button>
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
        <EmptyState
          icon={template.key === 'day-off' ? CalendarOff : CalendarPlus}
          title={m.settings_templates_system_badge()}
          description={
            template.key === 'day-off'
              ? m.settings_template_system_body_day_off()
              : m.settings_template_system_body_freeform()
          }
        />
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
                {template.serviceParts.map(role => (
                  <Badge key={role.id} variant="outline">
                    {role.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <InlineDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        itemName={template.name}
        onConfirm={() => deleteFetcher.submit({ intent: 'delete' }, { method: 'post' })}
        isDeleting={deleteFetcher.state !== 'idle'}
      />
    </div>
  )
}
