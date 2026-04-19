import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { createProgrammeTemplate } from '~/features/settings/server/programme-template.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_new_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.Admin])
  if (!can(Role.Admin)) throw redirect('/')
  return {}
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, can, session, congregationId } = await authenticateAndAuthorize(request, [Role.Admin])
  if (!can(Role.Admin)) throw redirect('/')

  const form = await request.formData()
  const name = String(form.get('name') ?? '').trim()
  const key = String(form.get('key') ?? '').trim()
  const rawWeekDay = form.get('weekDay')
  const weekDay = rawWeekDay && rawWeekDay !== 'none' ? Number(rawWeekDay) : null

  if (!name || !key) {
    session.flash('error', m.settings_template_new_name_key_required_error())
    return redirect('/settings/congregation/templates/new', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  return withScope(congregationId, async db => {
    const existing = await db.programmeTemplate.findFirst({ where: { key, congregationId } })
    if (existing) {
      session.flash('error', m.settings_template_new_key_exists_error())
      return redirect('/settings/congregation/templates/new', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }

    const template = await createProgrammeTemplate(db, { name, key, weekDay, congregationId })

    logger.info(`Created template "${name}" (${key}). User ID: ${currentUser.id}.`)
    session.flash('success', m.settings_template_new_success({ name }))

    return redirect(`/settings/congregation/templates/${template.id}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function NewTemplatePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.settings_template_new_title()} subtitle={m.settings_template_new_subtitle()} />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_new_info_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
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
            <Button type="submit" className="w-fit">
              {m.settings_template_new_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
