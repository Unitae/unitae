import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { getTemplateById, removeTemplateResponsible, setTemplateResponsible } from '~/features/events/index.server'
import { templateResponsibleSchema } from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import { findMembersWithAnyRole } from '~/shared/auth/permissions.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { fullName } from '~/shared/utils/display-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/responsible'

const NONE_VALUE = 'none'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_responsible_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.CanManageProgramTemplates)) throw redirect('/settings/congregation/templates')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')

  return withScopeFromContext(context, async db => {
    const template = await getTemplateById(db, templateId, currentUser.congregationId)
    if (!template) throw redirect('/settings/congregation/templates')

    const roles = await listDelegatableRoles(db, currentUser.congregationId)
    const currentRole = template.responsibles[0]?.role ?? null

    // Who the delegation actually lands on today. A role with nobody in it is a silent
    // "nobody can edit this template", so the page has to say so rather than look assigned.
    const holderIds = currentRole ? await findMembersWithAnyRole(db, [currentRole.id], currentUser.congregationId) : []
    const holders = await db.member.findMany({
      where: { id: { in: holderIds }, congregationId: currentUser.congregationId },
      select: { id: true, firstname: true, lastname: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })

    return {
      template,
      roles: roles.map(role => ({ id: role.id, label: getRoleDisplayName(role) })),
      currentResponsibleRoleId: currentRole?.id ?? null,
      holders: holders.map(holder => ({ id: holder.id, name: fullName(holder) })),
    }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.CanManageProgramTemplates)) throw redirect('/settings/congregation/templates')

  const templateId = requireParamId(params.templateId, '/settings/congregation/templates')
  const submission = parseWithZod(await request.formData(), { schema: templateResponsibleSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { roleId } = submission.value

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    if (roleId) {
      await setTemplateResponsible(db, templateId, roleId, currentUser.congregationId)
      session.flash('success', m.settings_template_responsible_assigned_success())
      logger.info(
        `Set template responsible. User ID: ${currentUser.id}. Template: ${templateId}. Responsible role: ${roleId}.`,
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
  const { template, roles, currentResponsibleRoleId, holders } = loaderData

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
              <Label htmlFor="roleId">{m.settings_template_responsible_label()}</Label>
              <Select name="roleId" defaultValue={currentResponsibleRoleId?.toString() ?? NONE_VALUE}>
                <SelectTrigger id="roleId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>{m.settings_template_responsible_none()}</SelectItem>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.id.toString()}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentResponsibleRoleId != null && (
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{m.settings_template_responsible_holders()}</span>
                {holders.length > 0 ? (
                  <span>{holders.map(holder => holder.name).join(', ')}</span>
                ) : (
                  <span className="text-destructive">{m.settings_template_responsible_holders_none()}</span>
                )}
              </div>
            )}

            <FormActions>
              <SubmitButton>{m.common_save()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
