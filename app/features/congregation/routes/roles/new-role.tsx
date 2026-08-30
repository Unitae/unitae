import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { createRoleSchema } from '~/features/congregation/schemas/role.schema'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { createRole } from '~/shared/domain/roles.server'
import { ConflictError, ValidationError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Textarea } from '~/shared/ui/textarea'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new-role'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.congregation_role_new_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect('/congregation/roles')
  return null
}

export default function NewRolePage({ actionData }: Route.ComponentProps) {
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
        title={m.congregation_role_new_title()}
        subtitle={m.congregation_role_new_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_assembly() },
          { label: m.sidebar_assembly_roles(), to: '/congregation/roles' },
          { label: m.congregation_role_new_title() },
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
                placeholder={m.congregation_role_edit_name_label()}
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
                placeholder={m.congregation_role_edit_description_label()}
              />
              {fields.description.errors && <p className="text-destructive text-sm">{fields.description.errors}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={fields.singlePerson.name} className="size-4" />
                {m.congregation_role_edit_single_person_label()}
              </label>
              <p className="text-muted-foreground text-xs">{m.congregation_role_edit_single_person_hint()}</p>
            </div>
            <FormActions>
              <SubmitButton>{m.congregation_role_edit_submit()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanManageRoles)) throw redirect('/congregation/roles')

  const submission = parseWithZod(await request.formData(), { schema: createRoleSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    try {
      await createRole(db, currentUser.congregationId, currentUser.id, {
        name: submission.value.name,
        description: submission.value.description || null,
        permissionKeys: [],
        isSinglePerson: submission.value.singlePerson,
      })
      session.flash('success', m.congregation_role_create_success())
      return redirect('/congregation/roles', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    } catch (error) {
      if (error instanceof ConflictError) {
        return data(submission.reply({ formErrors: [m.congregation_role_duplicate_error()] }), { status: 409 })
      }
      if (error instanceof ValidationError) {
        return data(submission.reply({ fieldErrors: { [error.field]: [error.message] } }), { status: 400 })
      }
      throw error
    }
  })
}
