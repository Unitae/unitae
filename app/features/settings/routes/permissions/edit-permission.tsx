import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { editPermissionsSchema } from '~/features/settings/schemas/permissions.schema'
import { RolePermissionPicker } from '~/features/settings/ui/RolePermissionPicker'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getRole, updateRolePermissions } from '~/shared/domain/roles.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDescription, getRoleDisplayName } from '~/shared/types/role'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-permission'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_permissions_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.PermissionsManager)) throw redirect('/')

  const roleId = requireParamId(params.roleId, '/settings/permissions')

  return withScopeFromContext(context, async db => {
    const role = await getRole(db, roleId, currentUser.congregationId)
    if (!role) throw redirect('/settings/permissions')

    const permissionList = await db.permission.findMany({ orderBy: { key: 'asc' } })
    return { role, permissionList }
  })
}

export default function EditPermissionPage({ loaderData, actionData }: Route.ComponentProps) {
  const { role, permissionList } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)

  const [form] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: editPermissionsSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={getRoleDisplayName(role)}
        subtitle={m.settings_permissions_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings(), to: '/settings' },
          { label: m.sidebar_settings_permissions(), to: '/settings/permissions' },
          { label: getRoleDisplayName(role) },
        ]}
        backTo="/settings/permissions"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{getRoleDisplayName(role)}</CardTitle>
          <CardDescription>{getRoleDescription(role)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={markDirty}>
            <RolePermissionPicker permissions={permissionList} selectedKeys={role.permissionKeys} showHeader={false} />
            <FormActions>
              <SubmitButton>{m.settings_permissions_edit_submit()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.PermissionsManager)) throw redirect('/')

  const roleId = requireParamId(params.roleId, '/settings/permissions')
  const submission = parseWithZod(await request.formData(), { schema: editPermissionsSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    await updateRolePermissions(db, roleId, currentUser.congregationId, currentUser.id, submission.value.permissionKeys)
    session.flash('success', m.settings_permissions_update_success())
    return redirect(`/settings/permissions/${roleId}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
