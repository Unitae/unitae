import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { setupSchema } from '~/features/authentication/schemas/login.schema'

import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { setupFirstUser } from '~/features/authentication/server/setup-first-user.server'
import * as m from '~/paraglide/messages'
import { locales } from '~/paraglide/runtime'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import type { Route } from './+types/setup'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_setup_page_title()} - Unitae` }]
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
      <Card className="w-full max-w-md overflow-hidden shadow-md">
        <div className="h-1 bg-primary" />
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-2xl tracking-tight">Unitae</h1>
          <p className="text-muted-foreground text-sm">{m.auth_setup_subtitle()}</p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{m.auth_setup_email_label()}</Label>
              <Input id="email" name="email" type="email" autoFocus={true} autoComplete="email" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="locale">{m.auth_setup_locale_label()}</Label>
              <Select name="locale" defaultValue="fr">
                <SelectTrigger id="locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map(locale => (
                    <SelectItem key={locale} value={locale}>
                      {locale === 'fr' ? m.common_locale_fr() : m.common_locale_en()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{m.auth_setup_password_label()}</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="repeat-password">{m.auth_setup_confirm_password_label()}</Label>
              <Input id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" />
            </div>

            <Button type="submit" className="mt-4 w-full">
              {m.auth_setup_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: setupSchema })

  if (submission.status !== 'success') {
    session.flash('error', m.auth_setup_generic_error())
    return redirect('/setup', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const { email: username, password, locale } = submission.value

  const userId = await setupFirstUser(
    username,
    password,
    m.auth_setup_default_congregation_name(),
    'default',
    locale as (typeof locales)[number],
  )

  if (userId == null) {
    session.flash('error', m.auth_setup_generic_error())

    return redirect('/setup', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return redirect('/login')
}
