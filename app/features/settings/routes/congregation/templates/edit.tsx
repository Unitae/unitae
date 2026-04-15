import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import {
  deleteTemplatePart,
  deleteTemplateServiceRole,
  getTemplateById,
  isTemplateResponsible,
  updateTemplate,
  upsertTemplatePart,
  upsertTemplateServiceRole,
} from '~/features/events/server/programme-templates.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { type TransactionClient, withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_edit_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProgramViewer,
    Role.ProgramManager,
  ])

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScope(congregationId, async db => {
    const template = await getTemplateById(db, templateId, congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    if (!can(Role.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    return { template }
  })
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.ProgramManager])

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  const form = await request.formData()
  const intent = form.get('intent')

  return withScope(congregationId, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, congregationId)
    if (!can(Role.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    if (intent === 'update-template') {
      const name = String(form.get('name') ?? '')
      const rawWeekDay = form.get('weekDay')
      const weekDay = rawWeekDay && rawWeekDay !== 'none' ? Number(rawWeekDay) : null
      await updateTemplate(db, templateId, { name, weekDay }, congregationId)
      session.flash('success', m.settings_template_edit_update_success())
      logger.info(`Updated template. User ID: ${currentUser.id}. Template ID: ${templateId}.`)
    }

    const partMessage = await handlePartIntent(intent, form, db, templateId, congregationId)
    if (partMessage) session.flash('success', partMessage)

    const serviceMessage = await handleServiceRoleIntent(intent, form, db, templateId, congregationId)
    if (serviceMessage) session.flash('success', serviceMessage)

    return redirect(`/settings/congregation/templates/${templateId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

async function handlePartIntent(
  intent: FormDataEntryValue | null,
  form: FormData,
  db: TransactionClient,
  templateId: number,
  congregationId: number,
) {
  if (intent === 'upsert-part') {
    const partId = form.get('partId') ? Number(form.get('partId')) : undefined
    await upsertTemplatePart(
      db,
      templateId,
      {
        id: partId,
        name: String(form.get('partName') ?? ''),
        section: String(form.get('partSection') ?? ''),
        order: Number(form.get('partOrder') ?? 0),
        durationMin: form.get('partDuration') ? Number(form.get('partDuration')) : null,
        isVariable: form.get('partIsVariable') === 'on',
      },
      congregationId,
    )
    return partId ? m.settings_template_edit_part_updated() : m.settings_template_edit_part_added()
  }
  if (intent === 'delete-part') {
    await deleteTemplatePart(db, Number(form.get('partId')), congregationId)
    return m.settings_template_edit_part_deleted()
  }
  return null
}

async function handleServiceRoleIntent(
  intent: FormDataEntryValue | null,
  form: FormData,
  db: TransactionClient,
  templateId: number,
  congregationId: number,
) {
  if (intent === 'upsert-service-role') {
    const roleId = form.get('roleId') ? Number(form.get('roleId')) : undefined
    await upsertTemplateServiceRole(
      db,
      templateId,
      { id: roleId, name: String(form.get('roleName') ?? ''), key: String(form.get('roleKey') ?? '') },
      congregationId,
    )
    return roleId ? m.settings_template_edit_service_role_updated() : m.settings_template_edit_service_role_added()
  }
  if (intent === 'delete-service-role') {
    await deleteTemplateServiceRole(db, Number(form.get('roleId')), congregationId)
    return m.settings_template_edit_service_role_deleted()
  }
  return null
}

export default function TemplateEditPage({ loaderData }: Route.ComponentProps) {
  const { template } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.settings_template_edit_title({ name: template.name })}
        subtitle={m.settings_template_edit_subtitle()}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_edit_general_info()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="update-template" />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{m.settings_template_edit_name_label()}</Label>
              <Input id="name" name="name" defaultValue={template.name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="weekDay">{m.settings_template_edit_weekday_label()}</Label>
              <Select name="weekDay" defaultValue={template.weekDay?.toString() ?? 'none'}>
                <SelectTrigger>
                  <SelectValue placeholder={m.settings_template_edit_weekday_none()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{m.settings_template_edit_weekday_none()}</SelectItem>
                  <SelectItem value="0">{m.settings_template_edit_day_sunday()}</SelectItem>
                  <SelectItem value="1">{m.settings_template_edit_day_monday()}</SelectItem>
                  <SelectItem value="2">{m.settings_template_edit_day_tuesday()}</SelectItem>
                  <SelectItem value="3">{m.settings_template_edit_day_wednesday()}</SelectItem>
                  <SelectItem value="4">{m.settings_template_edit_day_thursday()}</SelectItem>
                  <SelectItem value="5">{m.settings_template_edit_day_friday()}</SelectItem>
                  <SelectItem value="6">{m.settings_template_edit_day_saturday()}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-fit">
              {m.common_save()}
            </Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_edit_parts_title()}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {template.parts.map(part => (
            <div key={part.id} className="flex items-end gap-2 border-b pb-3">
              <Form method="post" className="flex flex-1 flex-wrap items-end gap-2">
                <input type="hidden" name="intent" value="upsert-part" />
                <input type="hidden" name="partId" value={part.id} />
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{m.settings_template_edit_part_name_label()}</Label>
                  <Input name="partName" defaultValue={part.name} className="w-40" required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{m.settings_template_edit_part_section_label()}</Label>
                  <Input name="partSection" defaultValue={part.section} className="w-40" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{m.settings_template_edit_part_order_label()}</Label>
                  <Input name="partOrder" type="number" defaultValue={part.order} className="w-16" required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{m.settings_template_edit_part_duration_label()}</Label>
                  <Input name="partDuration" type="number" defaultValue={part.durationMin ?? ''} className="w-20" />
                </div>
                <div className="flex items-center gap-1">
                  <input type="checkbox" name="partIsVariable" id={`var-${part.id}`} defaultChecked={part.isVariable} />
                  <Label htmlFor={`var-${part.id}`} className="text-xs">
                    {m.settings_template_edit_part_variable_label()}
                  </Label>
                </div>
                <Button type="submit" variant="outline" size="sm">
                  {m.common_save()}
                </Button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="delete-part" />
                <input type="hidden" name="partId" value={part.id} />
                <Button type="submit" variant="destructive" size="sm">
                  {m.common_delete()}
                </Button>
              </Form>
            </div>
          ))}

          <Form method="post" className="flex flex-wrap items-end gap-2 border-t pt-3">
            <input type="hidden" name="intent" value="upsert-part" />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.settings_template_edit_part_name_label()}</Label>
              <Input
                name="partName"
                placeholder={m.settings_template_edit_part_new_placeholder()}
                className="w-40"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.settings_template_edit_part_section_label()}</Label>
              <Input name="partSection" className="w-40" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.settings_template_edit_part_order_label()}</Label>
              <Input
                name="partOrder"
                type="number"
                defaultValue={template.parts.length + 1}
                className="w-16"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.settings_template_edit_part_duration_label()}</Label>
              <Input name="partDuration" type="number" className="w-20" />
            </div>
            <div className="flex items-center gap-1">
              <input type="checkbox" name="partIsVariable" id="var-new" />
              <Label htmlFor="var-new" className="text-xs">
                {m.settings_template_edit_part_variable_label()}
              </Label>
            </div>
            <Button type="submit" size="sm">
              {m.settings_template_edit_add_button()}
            </Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_edit_service_roles_title()}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {template.serviceRoles.map(role => (
            <div key={role.id} className="flex items-end gap-2 border-b pb-3">
              <Form method="post" className="flex flex-1 items-end gap-2">
                <input type="hidden" name="intent" value="upsert-service-role" />
                <input type="hidden" name="roleId" value={role.id} />
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{m.settings_template_edit_role_name_label()}</Label>
                  <Input name="roleName" defaultValue={role.name} className="w-40" required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{m.settings_template_edit_role_key_label()}</Label>
                  <Input name="roleKey" defaultValue={role.key} className="w-32" required />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  {m.common_save()}
                </Button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="delete-service-role" />
                <input type="hidden" name="roleId" value={role.id} />
                <Button type="submit" variant="destructive" size="sm">
                  {m.common_delete()}
                </Button>
              </Form>
            </div>
          ))}

          <Form method="post" className="flex items-end gap-2 border-t pt-3">
            <input type="hidden" name="intent" value="upsert-service-role" />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.settings_template_edit_role_name_label()}</Label>
              <Input
                name="roleName"
                placeholder={m.settings_template_edit_role_new_name_placeholder()}
                className="w-40"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{m.settings_template_edit_role_key_label()}</Label>
              <Input
                name="roleKey"
                placeholder={m.settings_template_edit_role_new_key_placeholder()}
                className="w-32"
                required
              />
            </div>
            <Button type="submit" size="sm">
              {m.settings_template_edit_add_button()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
