import { data, Form, redirect } from 'react-router'

import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { setupFirstUser } from '~/features/authentication/server/setup-first-user.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

import type { Route } from './+types/setup'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Installation - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  if (process.env.MULTI_TENANT === 'true') {
    throw redirect('/register')
  }

  const shouldStartSetup = await needSetupProcess()
  if (!shouldStartSetup) {
    throw redirect('/login')
  }

  const session = await getSession(request.headers.get('Cookie'))
  if (session.has('userId')) {
    throw redirect('/')
  }

  return data(
    { error: session.get('error') },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function SignupPage({ loaderData }: Route.ComponentProps) {
  const { error } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-3xl tracking-tight">Unitae</h1>
          <p className="text-muted-foreground text-sm">Création du premier utilisateur pour l'accès à la plateforme.</p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoFocus={true}
                autoComplete="email"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="repeat-password">Répéter le mot de passe</Label>
              <Input id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" />
            </div>

            <Button type="submit" className="mt-4 w-full">
              Créer l'utilisateur
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  const username = form.get('email')
  const password = form.get('password')
  const secondPassword = form.get('repeat-password')

  if (password !== secondPassword) {
    session.flash('error', 'Les mots de passe ne sont pas les mêmes')
    return redirect('/setup', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  if (String(username).length < 5 || !String(username).includes('@')) {
    session.flash('error', 'Utilisez une adresse email valide')
    return redirect('/setup', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const userId = await setupFirstUser(String(username), String(password), 'Ma Congrégation', 'default')

  if (userId == null) {
    session.flash('error', `Quelque chose s'est mal passé. Réessayez.`)

    return redirect('/setup', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return redirect('/login')
}
