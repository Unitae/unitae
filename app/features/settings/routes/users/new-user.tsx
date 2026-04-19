import { data, Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { createUser, UserAlreadyExistsError } from '~/features/settings/server/create-user.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
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

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  const _users = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.settings_user_new_title()} subtitle={m.settings_user_new_subtitle()} />

      <Card>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstname">{m.settings_user_new_firstname_label()}</Label>
              <Input id="firstname" name="firstname" type="text" placeholder={m.settings_user_new_firstname_label()} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastname">{m.settings_user_new_lastname_label()}</Label>
              <Input id="lastname" name="lastname" type="text" placeholder={m.settings_user_new_lastname_label()} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{m.settings_user_new_email_label()}</Label>
              <Input id="email" name="email" type="email" placeholder={m.settings_user_new_email_label()} />
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
  const form = await request.formData()
  const firstname = String(form.get('firstname'))
  const lastname = String(form.get('lastname'))
  const email = String(form.get('email'))

  if (firstname.length < 1 || lastname.length < 1 || email.length < 1) {
    throw redirect('/settings/users/new')
  }

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
