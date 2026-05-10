import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createUserSchema } from '~/features/settings/schemas/user.schema'
import { createUser, UserAlreadyExistsError } from '~/features/settings/server/create-user.server'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  permissionsContext,
  currentAccountContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { handleAppError } from '~/shared/utils/handle-app-error.server'
import type { Route } from './+types/new-user'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_users_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canManageUser = permissions.has(Permission.SettingsUserManager)

  if (!canManageUser) {
    throw redirect('/')
  }

  return null
}

export default function SettingsLayout({ actionData }: Route.ComponentProps) {
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createUserSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_user_new_title()}
        subtitle={m.settings_user_new_subtitle()}
        breadcrumbs={[{ label: m.sidebar_users(), to: '/settings/users' }, { label: m.settings_user_new_title() }]}
        backTo="/settings/users"
      />

      <Card>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <div className="space-y-2">
              <Label htmlFor={fields.firstname.id}>{m.settings_user_new_firstname_label()}</Label>
              <Input
                {...getInputProps(fields.firstname, { type: 'text' })}
                placeholder={m.settings_user_new_firstname_label()}
              />
              {fields.firstname.errors && <p className="text-destructive text-sm">{fields.firstname.errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.lastname.id}>{m.settings_user_new_lastname_label()}</Label>
              <Input
                {...getInputProps(fields.lastname, { type: 'text' })}
                placeholder={m.settings_user_new_lastname_label()}
              />
              {fields.lastname.errors && <p className="text-destructive text-sm">{fields.lastname.errors}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.email.id}>{m.settings_user_new_email_label()}</Label>
              <Input
                {...getInputProps(fields.email, { type: 'email' })}
                placeholder={m.settings_user_new_email_label()}
              />
              {fields.email.errors && <p className="text-destructive text-sm">{fields.email.errors}</p>}
            </div>
            <SubmitButton className="mt-2">{m.settings_user_new_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)
  const submission = parseWithZod(await request.formData(), { schema: createUserSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { firstname, lastname, email } = submission.value

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      const ResetPasswordRequired = (await import('~/features/authentication/emails/reset-password-required')).default
      const result = await createUser(
        db,
        congregation,
        currentUser.id,
        { firstname, lastname, email, congregationId: currentUser.congregationId },
        (_userId, token) => (
          <ResetPasswordRequired
            email={email}
            firstname={firstname || undefined}
            token={token}
            baseUrl={congregation.baseUrl}
            platformName={congregation.displayName}
          />
        ),
      )

      if (!result.emailSent) {
        session.flash('error', m.auth_email_send_warning_user_created())
      }
    } catch (error) {
      if (error instanceof UserAlreadyExistsError) {
        session.flash('error', m.error_conflict())
        throw redirect('/settings/users/new', {
          headers: { 'Set-Cookie': await commitSession(session) },
        })
      }
      await handleAppError(error, session, '/settings/users/new')
    }

    return redirect('/settings/users', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
