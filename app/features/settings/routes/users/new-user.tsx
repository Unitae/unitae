import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { createUserSchema } from '~/features/settings/schemas/user.schema'
import { createUser, UserAlreadyExistsError } from '~/features/settings/server/create-user.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/new-user'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_users_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.SettingsUserManager])
  const canManageUser = can(Role.SettingsUserManager)

  if (!canManageUser) {
    throw redirect('/')
  }

  return null
}

export default function SettingsLayout({ loaderData, actionData }: Route.ComponentProps) {
  const _users = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createUserSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.settings_user_new_title()} subtitle={m.settings_user_new_subtitle()} />

      <Card>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4">
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
            <Button type="submit" className="mt-2">
              {m.settings_user_new_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, congregation, congregationId, session } = await authenticateAndAuthorize(request)
  const submission = parseWithZod(await request.formData(), { schema: createUserSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { firstname, lastname, email } = submission.value

  return withScope(congregationId, async db => {
    try {
      const ResetPasswordRequired = (await import('emails/reset-password-required')).default
      const result = await createUser(
        db,
        congregation,
        currentUser.id,
        { firstname, lastname, email, congregationId },
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
        throw redirect('/settings/users/new')
      }
      throw error
    }

    return redirect('/settings/users', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
