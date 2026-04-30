import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import {
  getTemplateById,
  removeTemplateResponsible,
  setTemplateResponsible,
} from '~/features/events/server/programme-templates.server'
import { templateResponsibleSchema } from '~/features/settings/schemas/template.schema'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/responsible'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_responsible_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.ProgramManager)) throw redirect('/settings/congregation/templates')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const template = await getTemplateById(db, templateId, currentUser.congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const users = await db.user.findMany({
      where: { congregationId: currentUser.congregationId, active: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })

    return {
      template,
      users,
      currentResponsibleId: template.responsibles[0]?.userId ?? null,
    }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.ProgramManager)) throw redirect('/settings/congregation/templates')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  const submission = parseWithZod(await request.formData(), { schema: templateResponsibleSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { userId } = submission.value

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    if (userId) {
      await setTemplateResponsible(db, templateId, userId, currentUser.congregationId)
      session.flash('success', m.settings_template_responsible_assigned_success())
      logger.info(
        `Set template responsible. User ID: ${currentUser.id}. Template: ${templateId}. Responsible: ${userId}.`,
      )
    } else {
      await removeTemplateResponsible(db, templateId, currentUser.congregationId)
      session.flash('success', m.settings_template_responsible_removed_success())
      logger.info(`Removed template responsible. User ID: ${currentUser.id}. Template: ${templateId}.`)
    }

    return redirect(`/settings/congregation/templates/${templateId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function ResponsiblePage({ loaderData }: Route.ComponentProps) {
  const { template, users, currentResponsibleId } = loaderData

  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_template_responsible_title({ name: template.name })}
        subtitle={m.settings_template_responsible_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings_assembly(), to: '/settings/congregation' },
          { label: 'Modèles', to: '/settings/congregation/templates' },
          { label: template.name, to: `/settings/congregation/templates/${template.id}` },
        ]}
        backTo={`/settings/congregation/templates/${template.id}`}
      />

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">{m.settings_template_responsible_choose_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="userId">{m.settings_template_responsible_label()}</Label>
              <Select name="userId" defaultValue={currentResponsibleId?.toString() ?? 'none'}>
                <SelectTrigger>
                  <SelectValue placeholder={m.settings_template_responsible_none()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{m.settings_template_responsible_none()}</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.firstname} {user.lastname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
