import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { ResponsibleScope } from '~/features/events'
import { getTemplateById, removeTemplateResponsible, setTemplateResponsible } from '~/features/events/index.server'
import { templateResponsibleSchema } from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { resolveAccountName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/responsible'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_responsible_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.ProgramManager)) throw redirect('/settings/congregation/templates')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const template = await getTemplateById(db, templateId, currentUser.congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const accounts = await db.userAccount.findMany({
      where: { congregationId: currentUser.congregationId, active: true },
      include: { member: { select: { firstname: true, lastname: true } } },
    })

    const users = accounts.map(account => ({ id: account.id, ...resolveAccountName(account) }))

    return {
      template,
      users,
      currentResponsibleId: template.responsibles.find(r => r.scope === ResponsibleScope.Full)?.userId ?? null,
      currentServiceResponsibleId:
        template.responsibles.find(r => r.scope === ResponsibleScope.Service)?.userId ?? null,
    }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.ProgramManager)) throw redirect('/settings/congregation/templates')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  const submission = parseWithZod(await request.formData(), { schema: templateResponsibleSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { userId, serviceUserId } = submission.value
  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))

    if (userId) await setTemplateResponsible(db, templateId, userId, congregationId, ResponsibleScope.Full)
    else await removeTemplateResponsible(db, templateId, congregationId, ResponsibleScope.Full)

    if (serviceUserId)
      await setTemplateResponsible(db, templateId, serviceUserId, congregationId, ResponsibleScope.Service)
    else await removeTemplateResponsible(db, templateId, congregationId, ResponsibleScope.Service)

    session.flash('success', m.settings_template_responsible_saved_success())
    logger.info(
      `Saved template responsibles. Actor: ${currentUser.id}. Template: ${templateId}. Full: ${userId ?? 'none'}. Service: ${serviceUserId ?? 'none'}.`,
    )

    return redirect(`/settings/congregation/templates/${templateId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function ResponsiblePage({ loaderData }: Route.ComponentProps) {
  const { template, users, currentResponsibleId, currentServiceResponsibleId } = loaderData

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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="userId">{m.settings_template_responsible_full_label()}</Label>
              <PersonDropdown
                id="userId"
                name="userId"
                people={users}
                defaultValue={currentResponsibleId?.toString() ?? ''}
                placeholder={m.settings_template_responsible_none()}
                noneLabel={m.settings_template_responsible_none()}
              />
              <p className="text-muted-foreground text-xs">{m.settings_template_responsible_full_hint()}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="serviceUserId">{m.settings_template_responsible_service_label()}</Label>
              <PersonDropdown
                id="serviceUserId"
                name="serviceUserId"
                people={users}
                defaultValue={currentServiceResponsibleId?.toString() ?? ''}
                placeholder={m.settings_template_responsible_service_none()}
                noneLabel={m.settings_template_responsible_service_none()}
              />
              <p className="text-muted-foreground text-xs">{m.settings_template_responsible_service_hint()}</p>
            </div>
            <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
