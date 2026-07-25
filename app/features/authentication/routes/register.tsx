import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { registerSchema } from '~/features/authentication/schemas/login.schema'
import { checkNewPasswordPolicy } from '~/features/authentication/server/password-policy.server'
import { registerCongregation } from '~/features/authentication/server/register-congregation.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { locales } from '~/i18n/paraglide/runtime'
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
  if (process.env.UNITAE_MULTI_TENANT !== 'true') {
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

export default function RegisterPage({ loaderData, actionData }: Route.ComponentProps) {
  const { error, success } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: registerSchema })
    },
  })

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
          <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields['congregation-name'].id}>{m.auth_register_congregation_name_label()}</Label>
              <Input
                {...getInputProps(fields['congregation-name'], { type: 'text' })}
                placeholder={m.auth_register_congregation_name_placeholder()}
              />
              {fields['congregation-name'].errors && (
                <p className="text-destructive text-sm">{fields['congregation-name'].errors}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.locale.id}>{m.auth_register_locale_label()}</Label>
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
              <Label htmlFor={fields.email.id}>{m.auth_register_admin_email_label()}</Label>
              <Input {...getInputProps(fields.email, { type: 'email' })} autoComplete="email" />
              {fields.email.errors && <p className="text-destructive text-sm">{fields.email.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.password.id}>{m.auth_register_password_label()}</Label>
              <Input {...getInputProps(fields.password, { type: 'password' })} autoComplete="new-password" />
              {fields.password.errors && <p className="text-destructive text-sm">{fields.password.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={fields['repeat-password'].id}>{m.auth_register_confirm_password_label()}</Label>
              <Input {...getInputProps(fields['repeat-password'], { type: 'password' })} autoComplete="new-password" />
              {fields['repeat-password'].errors && (
                <p className="text-destructive text-sm">{fields['repeat-password'].errors}</p>
              )}
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
    return data(submission.reply(), { status: 400 })
  }

  const congregationName = submission.value['congregation-name'].trim()
  const locale = submission.value.locale as (typeof locales)[number]
  const email = submission.value.email.trim()
  const password = submission.value.password

  // Brand-new congregation, no policy configured yet: zxcvbn strength only.
  const policyError = await checkNewPasswordPolicy(password, { checkBreached: false })
  if (policyError) {
    return data(submission.reply({ fieldErrors: { password: [policyError] } }), { status: 400 })
  }

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
