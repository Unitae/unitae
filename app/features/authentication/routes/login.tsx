import { data, Form, Link, redirect } from 'react-router'

import { getBrandingName, resolveCongregationFromRequest } from '~/shared/libs/congregation.server'
import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  recordLoginAttempt,
} from '~/features/authentication/server/rate-limit.server'
import { commitSession, destroySession, getSession } from '~/features/authentication/server/session.server'
import { validateCredentials } from '~/features/authentication/server/validate-credentials.server'
import { unscopedDb } from '~/shared/libs/db.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'

import type { Route } from './+types/login'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Connexion - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const shouldStartSetup = await needSetupProcess()
  if (shouldStartSetup) {
    return redirect(process.env.MULTI_TENANT === 'true' ? '/register' : '/setup')
  }

  const session = await getSession(request.headers.get('Cookie'))
  if (session.has('userId') === true) {
    // En mode multi-tenant, vérifier que la session correspond à l'assemblée du sous-domaine
    const urlCongregation = await resolveCongregationFromRequest(request)
    if (urlCongregation) {
      const uid = Number(session.get('userId'))
      const user = await unscopedDb.user.findUnique({
        where: { id: uid },
        select: { congregationId: true },
      })
      if (!user || user.congregationId !== urlCongregation.id) {
        return data(
          { error: undefined, brandingName: await getBrandingName(request) },
          { headers: { 'Set-Cookie': await destroySession(session) } },
        )
      }
    }
    throw redirect('/')
  }

  const brandingName = await getBrandingName(request)

  return data(
    { error: session.get('error'), brandingName },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const { error, brandingName } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md overflow-hidden shadow-md">
        <div className="h-1 bg-primary" />
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-2xl tracking-tight">{brandingName}</h1>
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
              <Input id="email" name="email" type="email" autoFocus={true} autoComplete="username" required />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link to="/password/forgot" className="text-primary text-xs hover:underline">
                  Mot de passe oublié
                </Link>
              </div>
              <Input id="password" name="password" type="password" autoComplete="current-password" />
            </div>

            <Button type="submit" className="mt-4 w-full">
              Connexion
            </Button>
          </Form>
        </CardContent>
        <CardFooter />
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const form = await request.formData()
  const username = String(form.get('email'))
  const password = form.get('password')

  const allowed = await checkLoginRateLimit(username)
  if (!allowed) {
    session.flash('error', 'Trop de tentatives. Réessayez dans quelques minutes.')

    return redirect('/login', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const urlCongregation = await resolveCongregationFromRequest(request)
  const userId = await validateCredentials(username, String(password), urlCongregation?.id)

  if (userId == null) {
    await recordLoginAttempt(username)
    session.flash('error', 'Email ou mot de passe invalide')

    return redirect('/login', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  await clearLoginAttempts(username)
  session.set('userId', String(userId))

  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
