import { Form, redirect } from 'react-router'

import {
  consumePasswordResetToken,
  verifyPasswordResetToken,
} from '~/features/authentication/server/invalidate-user-password.server'
import { resetUserPassword } from '~/features/authentication/server/reset-user-password.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

import type { Route } from './+types/password-reset'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Réinitialiser le mot de passe - Unitae' }]
}

export async function loader({ params }: Route.LoaderArgs) {
  const user = await verifyPasswordResetToken(params.userHash ?? '')

  if (user == null) {
    throw redirect('/')
  }

  return {
    email: user.email,
    id: user.id,
    active: user.active,
    firstname: user.firstname,
    lastname: user.lastname,
  }
}

export default function PasswordResetPage({ loaderData }: Route.ComponentProps) {
  const user = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-3xl tracking-tight">Unitae</h1>
          <p className="text-muted-foreground text-sm">Réinitialiser votre mot de passe</p>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="repeat-password">Confirmer le mot de passe</Label>
              <Input id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" />
            </div>

            <Button type="submit" className="mt-4 w-full">
              Modifier le mot de passe
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
    session.flash('error', 'Les mots de passe ne correspondent pas')

    throw redirect(`/password/${params.userHash}/reset`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const user = await verifyPasswordResetToken(params.userHash ?? '')

  if (user == null || user.email !== String(username)) {
    session.flash('error', 'Le lien de réinitialisation est invalide ou expiré')

    throw redirect('/', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  await resetUserPassword(user.id, String(password))
  await consumePasswordResetToken(params.userHash ?? '')

  session.flash('success', 'Mot de passe modifié avec succès')
  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
