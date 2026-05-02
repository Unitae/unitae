import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { setupSchema } from '~/features/authentication/schemas/login.schema'

import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { setupFirstUser } from '~/features/authentication/server/setup-first-user.server'
import * as m from '~/i18n/paraglide/messages'
import { locales } from '~/i18n/paraglide/runtime'
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
  if (process.env.UNITAE_MULTI_TENANT === 'true') {
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

export default function SignupPage({ loaderData, actionData }: Route.ComponentProps) {
  const { error } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: setupSchema })
    },
  })

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
          <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.email.id}>{m.auth_setup_email_label()}</Label>
              <Input {...getInputProps(fields.email, { type: 'email' })} autoFocus={true} autoComplete="email" />
              {fields.email.errors && <p className="text-destructive text-sm">{fields.email.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.locale.id}>{m.auth_setup_locale_label()}</Label>
              <Select name={fields.locale.name} defaultValue={fields.locale.initialValue ?? 'fr'}>
                <SelectTrigger id={fields.locale.id}>
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
              {fields.locale.errors && <p className="text-destructive text-sm">{fields.locale.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.password.id}>{m.auth_setup_password_label()}</Label>
              <Input {...getInputProps(fields.password, { type: 'password' })} autoComplete="new-password" />
              {fields.password.errors && <p className="text-destructive text-sm">{fields.password.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields['repeat-password'].id}>{m.auth_setup_confirm_password_label()}</Label>
              <Input {...getInputProps(fields['repeat-password'], { type: 'password' })} autoComplete="new-password" />
              {fields['repeat-password'].errors && (
                <p className="text-destructive text-sm">{fields['repeat-password'].errors}</p>
              )}
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
