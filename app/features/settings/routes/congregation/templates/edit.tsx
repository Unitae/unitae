import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import {
  deleteTemplatePart,
  deleteTemplateServiceRole,
  getTemplateById,
  isTemplateResponsible,
  updateTemplate,
  upsertTemplatePart,
  upsertTemplateServiceRole,
} from '~/features/events/server/programme-templates.server'
import {
  deletePartSchema,
  deleteServiceRoleSchema,
  updateTemplateSchema,
  upsertPartSchema,
  upsertServiceRoleSchema,
} from '~/features/settings/schemas/template.schema'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { useUnsavedChanges } from '~/shared/hooks/use-unsaved-changes'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_edit_meta_title() }]
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const template = await getTemplateById(db, templateId, currentUser.congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    if (!permissions.has(Role.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    return { template }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  const formData = await request.formData()
  const intent = formData.get('intent')

  return withScopeFromContext(context, async db => {
    const responsible = await isTemplateResponsible(db, templateId, currentUser.id, currentUser.congregationId)
    if (!permissions.has(Role.ProgramManager) && !responsible) throw redirect('/settings/congregation/templates')

    const session = await getSession(request.headers.get('Cookie'))
    if (intent === 'update-template') {
      const submission = parseWithZod(formData, { schema: updateTemplateSchema })
      if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

      const { name, weekDay } = submission.value
      await updateTemplate(db, templateId, { name, weekDay }, currentUser.congregationId)
      session.flash('success', m.settings_template_edit_update_success())
      logger.info(`Updated template. User ID: ${currentUser.id}. Template ID: ${templateId}.`)
    }

    const partResult = await handlePartIntent(intent, formData, db, templateId, currentUser.congregationId)
    if (partResult && 'reply' in partResult) return data(partResult.reply(), { status: 400 })
    if (partResult?.message) session.flash('success', partResult.message)

    const serviceResult = await handleServiceRoleIntent(intent, formData, db, templateId, currentUser.congregationId)
    if (serviceResult && 'reply' in serviceResult) return data(serviceResult.reply(), { status: 400 })
    if (serviceResult?.message) session.flash('success', serviceResult.message)

    return redirect(`/settings/congregation/templates/${templateId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

type IntentResult = { message: string | null } | { reply: () => unknown }

async function handlePartIntent(
  intent: FormDataEntryValue | null,
  formData: FormData,
  db: TransactionClient,
  templateId: number,
  congregationId: number,
): Promise<IntentResult | null> {
  if (intent === 'upsert-part') {
    const submission = parseWithZod(formData, { schema: upsertPartSchema })
    if (submission.status !== 'success') return submission

    const { partId, partName, partSection, partTrack, partOrder, partDuration, partIsVariable } = submission.value
    await upsertTemplatePart(
      db,
      templateId,
      {
        id: partId,
        name: partName,
        section: partSection,
        track: partTrack,
        order: partOrder,
        durationMin: partDuration ?? null,
        isVariable: partIsVariable,
      },
      congregationId,
    )
    return { message: partId ? m.settings_template_edit_part_updated() : m.settings_template_edit_part_added() }
  }
  if (intent === 'delete-part') {
    const submission = parseWithZod(formData, { schema: deletePartSchema })
    if (submission.status !== 'success') return submission

    await deleteTemplatePart(db, submission.value.partId, congregationId)
    return { message: m.settings_template_edit_part_deleted() }
  }
  return null
}

async function handleServiceRoleIntent(
  intent: FormDataEntryValue | null,
  formData: FormData,
  db: TransactionClient,
  templateId: number,
  congregationId: number,
): Promise<IntentResult | null> {
  if (intent === 'upsert-service-role') {
    const submission = parseWithZod(formData, { schema: upsertServiceRoleSchema })
    if (submission.status !== 'success') return submission

    const { roleId, roleName, roleKey } = submission.value
    await upsertTemplateServiceRole(db, templateId, { id: roleId, name: roleName, key: roleKey }, congregationId)
    return {
      message: roleId ? m.settings_template_edit_service_role_updated() : m.settings_template_edit_service_role_added(),
    }
  }
  if (intent === 'delete-service-role') {
    const submission = parseWithZod(formData, { schema: deleteServiceRoleSchema })
    if (submission.status !== 'success') return submission

    await deleteTemplateServiceRole(db, submission.value.roleId, congregationId)
    return { message: m.settings_template_edit_service_role_deleted() }
  }
  return null
}

export default function TemplateEditPage({ loaderData }: Route.ComponentProps) {
  const { template } = loaderData

  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_template_edit_title({ name: template.name })}
        subtitle={m.settings_template_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings_assembly(), to: '/settings/congregation' },
          { label: 'Modèles', to: '/settings/congregation/templates' },
          { label: m.settings_template_edit_title({ name: template.name }) },
        ]}
        backTo="/settings/congregation/templates"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_edit_general_info()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
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
                  <Label className="text-xs">{m.settings_template_edit_part_track_label()}</Label>
                  <Input name="partTrack" defaultValue={part.track} className="w-40" />
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
              <Label className="text-xs">{m.settings_template_edit_part_track_label()}</Label>
              <Input name="partTrack" className="w-40" />
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
