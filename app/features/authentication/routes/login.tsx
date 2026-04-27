import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { loginSchema } from '~/features/authentication/schemas/login.schema'
import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  recordLoginAttempt,
} from '~/features/authentication/server/rate-limit.server'
import { commitSession, destroySession, getSession } from '~/features/authentication/server/session.server'
import { validateCredentials } from '~/features/authentication/server/validate-credentials.server'
import * as m from '~/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { getBrandingName, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import type { Route } from './+types/login'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_login_page_title()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  // Verify that the subdomain matches an existing congregation
  await resolveCongregationFromRequest(request)

  const shouldStartSetup = await needSetupProcess()
  if (shouldStartSetup) {
    return redirect(process.env.UNITAE_MULTI_TENANT === 'true' ? '/register' : '/setup')
  }

  const session = await getSession(request.headers.get('Cookie'))
  if (session.has('userId') === true) {
    const uid = Number(session.get('userId'))
    if (Number.isNaN(uid) || uid <= 0) {
      return data(
        { error: undefined, brandingName: await getBrandingName(request) },
        { headers: { 'Set-Cookie': await destroySession(session) } },
      )
    }

    // In multi-tenant mode, verify the session matches the subdomain's congregation
    const urlCongregation = await resolveCongregationFromRequest(request)
    if (urlCongregation) {
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

export default function LoginPage({ loaderData, actionData }: Route.ComponentProps) {
  const { error, brandingName } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: loginSchema })
    },
  })

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
          <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.email.id}>{m.auth_login_email()}</Label>
              <Input {...getInputProps(fields.email, { type: 'email' })} autoFocus={true} autoComplete="username" />
              {fields.email.errors && <p className="text-destructive text-sm">{fields.email.errors}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={fields.password.id}>{m.auth_login_password()}</Label>
                <Link to="/password/forgot" className="text-primary text-xs hover:underline">
                  {m.auth_login_forgot_password()}
                </Link>
              </div>
              <Input {...getInputProps(fields.password, { type: 'password' })} autoComplete="current-password" />
              {fields.password.errors && <p className="text-destructive text-sm">{fields.password.errors}</p>}
            </div>

            <Button type="submit" className="mt-4 w-full">
              {m.auth_login_submit()}
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
  const submission = parseWithZod(await request.formData(), { schema: loginSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { email: username, password } = submission.value

  const allowed = await checkLoginRateLimit(username)
  if (!allowed) {
    session.flash('error', m.auth_login_rate_limit_error())

    return redirect('/login', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const urlCongregation = await resolveCongregationFromRequest(request)
  const userId = await validateCredentials(username, password, urlCongregation?.id)

  if (userId == null) {
    await recordLoginAttempt(username)
    if (urlCongregation) {
      audit({
        action: AuditAction.UserLoginFailed,
        congregationId: urlCongregation.id,
        actorEmail: username,
      })
    }
    session.flash('error', m.auth_login_invalid_credentials_error())

    return redirect('/login', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  await clearLoginAttempts(username)
  session.set('userId', String(userId))

  if (urlCongregation) {
    audit({
      action: AuditAction.UserLogin,
      congregationId: urlCongregation.id,
      actorId: userId,
      actorEmail: username,
    })
  }

  return redirect('/', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
