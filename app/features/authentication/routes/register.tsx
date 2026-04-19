import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { registerSchema } from '~/features/authentication/schemas/login.schema'
import { registerCongregation } from '~/features/authentication/server/register-congregation.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'
import { locales } from '~/paraglide/runtime'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import type { Route } from './+types/register'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_register_page_title()} - Unitae` }]
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
      <Card className="w-full max-w-md overflow-hidden shadow-md">
        <div className="h-1 bg-primary" />
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-2xl tracking-tight">Unitae</h1>
          <p className="text-muted-foreground text-sm">{m.auth_register_subtitle()}</p>
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
              <Label htmlFor="congregation-name">{m.auth_register_congregation_name_label()}</Label>
              <Input
                id="congregation-name"
                name="congregation-name"
                type="text"
                placeholder={m.auth_register_congregation_name_placeholder()}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="locale">{m.auth_register_locale_label()}</Label>
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
              <Label htmlFor="email">{m.auth_register_admin_email_label()}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{m.auth_register_password_label()}</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="repeat-password">{m.auth_register_confirm_password_label()}</Label>
              <Input id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" required />
            </div>

            <Button type="submit" className="mt-4 w-full">
              {m.auth_register_submit()}
            </Button>
          </Form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-muted-foreground text-sm">
            {m.auth_register_existing_account()}{' '}
            <Link to="/login" className="text-primary hover:underline">
              {m.auth_register_login_link()}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: registerSchema })

  if (submission.status !== 'success') {
    session.flash('error', m.auth_register_generic_error())
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  const congregationName = submission.value['congregation-name'].trim()
  const locale = submission.value.locale as (typeof locales)[number]
  const email = submission.value.email.trim()
  const password = submission.value.password

  const slug = slugify(congregationName)
  if (slug.length < 2) {
    session.flash('error', m.auth_register_slug_invalid_error())
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  const result = await registerCongregation(congregationName, slug, email, password, locale)

  if ('error' in result) {
    session.flash('error', result.error ?? m.auth_register_generic_error())
    return redirect('/register', { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  session.set('userId', String(result.userId))

  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
