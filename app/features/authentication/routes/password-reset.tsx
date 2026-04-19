import { Form, redirect } from 'react-router'
import {
  consumePasswordResetToken,
  verifyPasswordResetToken,
} from '~/features/authentication/server/invalidate-user-password.server'
import { resetUserPassword } from '~/features/authentication/server/reset-user-password.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'
import { getBrandingName, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import type { Route } from './+types/password-reset'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_password_reset_page_title()} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await resolveCongregationFromRequest(request)

  const user = await verifyPasswordResetToken(params.userHash ?? '')

  if (user == null) {
    throw redirect('/')
  }

  const brandingName = await getBrandingName(request)

  return {
    email: user.email,
    id: user.id,
    active: user.active,
    firstname: user.firstname,
    lastname: user.lastname,
    brandingName,
  }
}

export default function PasswordResetPage({ loaderData }: Route.ComponentProps) {
  const { brandingName, ...user } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md overflow-hidden shadow-md">
        <div className="h-1 bg-primary" />
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-2xl tracking-tight">{brandingName}</h1>
          <p className="text-muted-foreground text-sm">{m.auth_password_reset_subtitle()}</p>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{m.auth_password_reset_email_label()}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                defaultValue={user.email}
                required
                readOnly
                className="bg-muted"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{m.auth_password_reset_new_password_label()}</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="repeat-password">{m.auth_password_reset_confirm_password_label()}</Label>
              <Input id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" />
            </div>

            <Button type="submit" className="mt-4 w-full">
              {m.auth_password_reset_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  const username = form.get('email')
  const password = form.get('password')
  const repeatPassword = form.get('repeat-password')

  if (password !== repeatPassword) {
    session.flash('error', m.auth_password_reset_mismatch_error())

    throw redirect(`/password/${params.userHash}/reset`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const user = await verifyPasswordResetToken(params.userHash ?? '')

  if (user == null || user.email !== String(username)) {
    session.flash('error', m.auth_password_reset_invalid_token_error())

    throw redirect('/', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  await resetUserPassword(user.id, String(password))
  await consumePasswordResetToken(params.userHash ?? '')

  session.flash('success', m.auth_password_reset_success_message())
  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
