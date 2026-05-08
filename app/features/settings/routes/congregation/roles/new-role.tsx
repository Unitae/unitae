import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createRoleSchema } from '~/features/settings/schemas/role.schema'
import { createRole } from '~/features/settings/server/roles.server'
import { RolePermissionPicker } from '~/features/settings/ui/RolePermissionPicker'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { ConflictError, ValidationError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Separator } from '~/shared/ui/separator'
import { Textarea } from '~/shared/ui/textarea'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new-role'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_role_new_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.RolesManager)) throw redirect('/settings/congregation/roles')

  return withScopeFromContext(context, async db => {
    const permissionList = await db.permission.findMany({ orderBy: { key: 'asc' } })
    return { permissionList }
  })
}

export default function NewRolePage({ loaderData, actionData }: Route.ComponentProps) {
  const { permissionList } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createRoleSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_role_new_title()}
        subtitle={m.settings_role_new_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_settings(), to: '/settings' },
          { label: m.sidebar_settings_roles(), to: '/settings/congregation/roles' },
          { label: m.settings_role_new_title() },
        ]}
        backTo="/settings/congregation/roles"
      />

      <Card>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={markDirty}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.name.id}>{m.settings_role_edit_name_label()}</Label>
              <Input
                {...getInputProps(fields.name, { type: 'text' })}
                key={fields.name.id}
                placeholder={m.settings_role_edit_name_label()}
                required
              />
              {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.description.id}>{m.settings_role_edit_description_label()}</Label>
              <Textarea
                id={fields.description.id}
                name={fields.description.name}
                rows={3}
                placeholder={m.settings_role_edit_description_label()}
              />
              {fields.description.errors && <p className="text-destructive text-sm">{fields.description.errors}</p>}
            </div>

            <Separator />

            <RolePermissionPicker permissions={permissionList} selectedKeys={[]} />

            <SubmitButton className="self-start">{m.settings_role_edit_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  if (!permissions.has(Permission.RolesManager)) throw redirect('/settings/congregation/roles')

  const submission = parseWithZod(await request.formData(), { schema: createRoleSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    try {
      const role = await createRole(db, currentUser.congregationId, currentUser.id, {
        name: submission.value.name,
        description: submission.value.description || null,
        permissionKeys: submission.value.permissionKeys,
      })
      session.flash('success', m.settings_role_create_success())
      return redirect(`/settings/congregation/roles/${role.id}/edit`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    } catch (error) {
      if (error instanceof ConflictError) {
        return data(submission.reply({ formErrors: [m.settings_role_duplicate_error()] }), { status: 409 })
      }
      if (error instanceof ValidationError) {
        return data(submission.reply({ fieldErrors: { [error.field]: [error.message] } }), { status: 400 })
      }
      throw error
    }
  })
}
