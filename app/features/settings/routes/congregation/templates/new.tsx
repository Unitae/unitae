import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createTemplateSchema } from '~/features/settings/schemas/template.schema'
import { createProgrammeTemplate } from '~/features/settings/server/programme-template.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { useUnsavedChanges } from '~/shared/hooks/use-unsaved-changes'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_new_meta_title() }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.Admin)) throw redirect('/')
  return {}
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  if (!permissions.has(Role.Admin)) throw redirect('/')

  const submission = parseWithZod(await request.formData(), { schema: createTemplateSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, key, weekDay } = submission.value
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const existing = await db.programmeTemplate.findFirst({
      where: { key, congregationId: currentUser.congregationId },
    })
    if (existing) {
      session.flash('error', m.settings_template_new_key_exists_error())
      return redirect('/settings/congregation/templates/new', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    const template = await createProgrammeTemplate(db, {
      name,
      key,
      weekDay,
      congregationId: currentUser.congregationId,
    })

    logger.info(`Created template "${name}" (${key}). User ID: ${currentUser.id}.`)
    session.flash('success', m.settings_template_new_success({ name }))

    return redirect(`/settings/congregation/templates/${template.id}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function NewTemplatePage() {
  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_template_new_title()}
        subtitle={m.settings_template_new_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings_assembly(), to: '/settings/congregation' },
          { label: 'Modèles', to: '/settings/congregation/templates' },
          { label: m.settings_template_new_title() },
        ]}
        backTo="/settings/congregation/templates"
      />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_new_info_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{m.settings_template_new_name_label()}</Label>
              <Input id="name" name="name" placeholder={m.settings_template_new_name_placeholder()} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="key">{m.settings_template_new_key_label()}</Label>
              <Input id="key" name="key" placeholder={m.settings_template_new_key_placeholder()} required />
              <p className="text-muted-foreground text-xs">{m.settings_template_new_key_hint()}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="weekDay">{m.settings_template_new_weekday_label()}</Label>
              <Select name="weekDay" defaultValue="none">
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
            <SubmitButton className="w-fit">{m.settings_template_new_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
