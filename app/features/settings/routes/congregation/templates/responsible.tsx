import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { findResponsible, ResponsibilityScope } from '~/features/events'
import { getTemplateById, removeTemplateResponsible, setTemplateResponsible } from '~/features/events/index.server'
import { templateResponsibleSchema } from '~/features/settings/schemas/template.schema'
import { ResponsibleRoleField } from '~/features/settings/ui/ResponsibleRoleField'
import * as m from '~/i18n/paraglide/messages'
import { findMembersWithAnyRole } from '~/shared/auth/permissions.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { listDelegatableRoles } from '~/shared/domain/roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { fullName } from '~/shared/utils/display-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/responsible'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_template_responsible_meta_title() }]
}

// Who the delegation actually lands on today. A role with nobody in it is a silent
// "nobody can edit this", so the page has to say so rather than look assigned.
async function listHolders(db: TransactionClient, roleId: number | null, congregationId: number) {
  if (roleId == null) return []

  const holderIds = await findMembersWithAnyRole(db, [roleId], congregationId)
  const holders = await db.member.findMany({
    where: { id: { in: holderIds }, congregationId },
    select: { id: true, firstname: true, lastname: true },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  })
  return holders.map(holder => ({ id: holder.id, name: fullName(holder) }))
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
    const programmeRole = findResponsible(template.responsibles, ResponsibilityScope.Programme)?.role ?? null
    const serviceRole = findResponsible(template.responsibles, ResponsibilityScope.Service)?.role ?? null

    const [programmeHolders, serviceHolders] = await Promise.all([
      listHolders(db, programmeRole?.id ?? null, currentUser.congregationId),
      listHolders(db, serviceRole?.id ?? null, currentUser.congregationId),
    ])

    return {
      template,
      roles: roles.map(role => ({ id: role.id, label: getRoleDisplayName(role) })),
      programmeRoleId: programmeRole?.id ?? null,
      serviceRoleId: serviceRole?.id ?? null,
      programmeHolders,
      serviceHolders,
    }
  })
}

// Each scope is written independently: clearing the service picker must not
// disturb the programme delegation, and vice versa.
async function saveResponsible(
  db: TransactionClient,
  templateId: number,
  roleId: number | null,
  congregationId: number,
  scope: ResponsibilityScope,
) {
  if (roleId) {
    await setTemplateResponsible(db, templateId, roleId, congregationId, scope)
  } else {
    await removeTemplateResponsible(db, templateId, congregationId, scope)
  }
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

  const { roleId, serviceRoleId } = submission.value

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    const { congregationId } = currentUser

    await saveResponsible(db, templateId, roleId, congregationId, ResponsibilityScope.Programme)
    await saveResponsible(db, templateId, serviceRoleId, congregationId, ResponsibilityScope.Service)

    session.flash('success', m.settings_template_responsible_saved_success())
    logger.info(
      `Saved template responsibles. User ID: ${currentUser.id}. Template: ${templateId}. Programme role: ${roleId ?? 'none'}. Service role: ${serviceRoleId ?? 'none'}.`,
    )

    return redirect(`/settings/congregation/templates/${templateId}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}

export default function ResponsiblePage({ loaderData }: Route.ComponentProps) {
  const { template, roles, programmeRoleId, serviceRoleId, programmeHolders, serviceHolders } = loaderData

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
          <Form method="post" className="flex flex-col gap-6" onChange={markDirty}>
            <ResponsibleRoleField
              name="roleId"
              label={m.settings_template_responsible_programme_label()}
              hint={m.settings_template_responsible_programme_hint()}
              roles={roles}
              currentRoleId={programmeRoleId}
              holders={programmeHolders}
            />

            <ResponsibleRoleField
              name="serviceRoleId"
              label={m.settings_template_responsible_service_label()}
              hint={m.settings_template_responsible_service_hint()}
              roles={roles}
              currentRoleId={serviceRoleId}
              holders={serviceHolders}
            />

            <FormActions>
              <SubmitButton>{m.common_save()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
