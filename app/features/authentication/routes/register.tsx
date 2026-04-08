import { data, Form, Link, redirect } from 'react-router'
import { registerCongregation } from '~/features/authentication/server/register-congregation.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

import type { Route } from './+types/register'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Créer une congrégation - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  if (process.env.MULTI_TENANT !== 'true') {
    throw redirect('/login')
  }

  const session = await getSession(request.headers.get('Cookie'))

  return data(
    { error: session.get('error'), success: session.get('success') },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function RegisterPage({ loaderData }: Route.ComponentProps) {
  const { error, success } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-3xl tracking-tight">Unitae</h1>
          <p className="text-muted-foreground text-sm">Créer un espace pour votre congrégation</p>
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
              <Label htmlFor="congregation-name">Nom de la congrégation</Label>
              <Input
                id="congregation-name"
                name="congregation-name"
                type="text"
                placeholder="Lyon Confluence"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email de l'administrateur</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="repeat-password">Confirmer le mot de passe</Label>
              <Input id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" required />
            </div>

            <Button type="submit" className="mt-4 w-full">
              Créer la congrégation
            </Button>
          </Form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-muted-foreground text-sm">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()

  const congregationName = String(form.get('congregation-name')).trim()
  const email = String(form.get('email')).trim()
  const password = String(form.get('password'))
  const repeatPassword = String(form.get('repeat-password'))

  if (congregationName.length < 2) {
    session.flash('error', 'Le nom de la congrégation doit faire au moins 2 caractères.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  if (!email.includes('@') || email.length < 5) {
    session.flash('error', 'Utilisez une adresse email valide.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  if (password.length < 8) {
    session.flash('error', 'Le mot de passe doit faire au moins 8 caractères.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  if (password !== repeatPassword) {
    session.flash('error', 'Les mots de passe ne correspondent pas.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  const slug = slugify(congregationName)
  if (slug.length < 2) {
    session.flash('error', 'Le nom de la congrégation génère un identifiant invalide.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  const result = await registerCongregation(congregationName, slug, email, password)

  if ('error' in result) {
    session.flash('error', result.error ?? 'Une erreur est survenue.')
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  session.set('userId', String(result.userId))

  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
