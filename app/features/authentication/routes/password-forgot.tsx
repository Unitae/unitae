import ResetPassword from 'emails/reset-password'
import { data, Form, Link, redirect } from 'react-router'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-user-password.server'
import { sendResetUserPasswordEmail } from '~/features/authentication/server/send-reset-user-password-email.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { getBrandingName, resolveCongregation } from '~/shared/libs/congregation.server'
import { unscopedDb as db } from '~/shared/libs/db.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

import type { Route } from './+types/password-forgot'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mot de passe oublié - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const brandingName = await getBrandingName(request)

  return data(
    { error: session.get('error'), success: session.get('success'), brandingName },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function ForgotPassword({ loaderData }: Route.ComponentProps) {
  const { error, success, brandingName } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md overflow-hidden shadow-md">
        <div className="h-1 bg-primary" />
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-2xl tracking-tight">{brandingName}</h1>
          <p className="text-muted-foreground text-sm">Indiquez votre adresse email pour retrouver votre compte</p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="mb-4">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="username" autoFocus={true} required />
            </div>

            <Button type="submit" className="mt-4 w-full">
              Envoyer
            </Button>
          </Form>
        </CardContent>
        <CardFooter className="justify-center">
          <Link to="/login" className="text-primary text-sm hover:underline">
            Retour à la connexion
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const username = form.get('email')

  const session = await getSession(request.headers.get('Cookie'))
  session.flash(
    'success',
    'Si votre adresse correspond à un compte utilisateur, vous recevrez un email contenant les instructions pour modifier votre mot de passe.',
  )

  const user = await db.user.findFirst({ where: { email: String(username) } })

  if (user == null) {
    throw redirect('/password/forgot', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const token = await createPasswordResetToken(user.id)
  const congregation = await resolveCongregation(user.congregationId)
  await sendResetUserPasswordEmail(
    user.id,
    <ResetPassword
      email={user.email}
      firstname={user.firstname || undefined}
      token={token}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />,
  )

  return redirect('/password/forgot', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
