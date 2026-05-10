import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { editRoleSchema } from '~/features/congregation/schemas/role.schema'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getRole, updateRoleIdentity } from '~/shared/domain/roles.server'
import { ConflictError, ForbiddenError, ValidationError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Textarea } from '~/shared/ui/textarea'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-role'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.congregation_role_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.RolesManager)) throw redirect('/congregation/roles')

  const roleId = requireParamId(params.roleId, '/congregation/roles')

  return withScopeFromContext(context, async db => {
    const role = await getRole(db, roleId, currentUser.congregationId)
    if (!role || role.isBuiltIn) throw redirect('/congregation/roles')
    return { role }
  })
}

export default function EditRolePage({ loaderData, actionData }: Route.ComponentProps) {
  const { role } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: editRoleSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={getRoleDisplayName(role)}
        subtitle={m.congregation_role_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_assembly() },
          { label: m.sidebar_assembly_roles(), to: '/congregation/roles' },
          { label: getRoleDisplayName(role) },
        ]}
        backTo="/congregation/roles"
      />

      <Card>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.name.id}>{m.congregation_role_edit_name_label()}</Label>
              <Input
                {...getInputProps(fields.name, { type: 'text' })}
                key={fields.name.id}
                defaultValue={role.name ?? ''}
                required
              />
              {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.description.id}>{m.congregation_role_edit_description_label()}</Label>
              <Textarea
                id={fields.description.id}
                name={fields.description.name}
                rows={3}
                defaultValue={role.description ?? ''}
              />
              {fields.description.errors && <p className="text-destructive text-sm">{fields.description.errors}</p>}
            </div>
            <SubmitButton className="self-start">{m.congregation_role_edit_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <p className="text-muted-foreground text-sm">
            {role.memberCount === 0
              ? m.congregation_role_edit_member_count_zero()
              : role.memberCount === 1
                ? m.congregation_role_edit_member_count_one()
                : m.congregation_role_edit_member_count({ count: role.memberCount })}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="shrink-0">
                <Trash2 className="mr-1 size-4" />
                {m.congregation_role_delete_button()}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{m.congregation_role_delete_dialog_title()}</AlertDialogTitle>
                <AlertDialogDescription>
                  {role.memberCount > 0
                    ? m.congregation_role_delete_dialog_description_with_members({ count: role.memberCount })
                    : m.congregation_role_delete_dialog_description_empty()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                <Form method="post" action={`/congregation/roles/${role.id}/delete`}>
                  <AlertDialogAction
                    type="submit"
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {m.congregation_role_delete_confirm()}
                  </AlertDialogAction>
                </Form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.RolesManager)) throw redirect('/congregation/roles')

  const roleId = requireParamId(params.roleId, '/congregation/roles')
  const submission = parseWithZod(await request.formData(), { schema: editRoleSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    try {
      await updateRoleIdentity(db, roleId, currentUser.congregationId, currentUser.id, {
        name: submission.value.name,
        description: submission.value.description || null,
      })
      session.flash('success', m.congregation_role_update_success())
      return redirect(`/congregation/roles/${roleId}/edit`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    } catch (error) {
      if (error instanceof ConflictError) {
        return data(submission.reply({ formErrors: [m.congregation_role_duplicate_error()] }), { status: 409 })
      }
      if (error instanceof ValidationError) {
        return data(submission.reply({ fieldErrors: { [error.field]: [error.message] } }), { status: 400 })
      }
      if (error instanceof ForbiddenError) {
        throw redirect('/congregation/roles')
      }
      throw error
    }
  })
}
