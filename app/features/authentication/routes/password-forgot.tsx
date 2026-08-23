import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { forgotPasswordSchema } from '~/features/authentication/schemas/login.schema'
import { requestPasswordReset } from '~/features/authentication/server/request-password-reset.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { AuthShell } from '~/features/authentication/ui/AuthShell'
import * as m from '~/i18n/paraglide/messages'
import { getBrandingName, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import type { Route } from './+types/password-forgot'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_password_forgot_page_title()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await resolveCongregationFromRequest(request)

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
    <AuthShell>
      <CardHeader className="items-center space-y-2 text-center">
        <h1 className="font-bold font-display text-2xl tracking-tight">{brandingName}</h1>
        <p className="text-muted-foreground text-sm">{m.auth_password_forgot_subtitle()}</p>
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
            <Label htmlFor="email">{m.auth_password_forgot_email_label()}</Label>
            <Input id="email" name="email" type="email" autoComplete="username" autoFocus={true} required />
          </div>

          <Button type="submit" className="mt-4 w-full">
            {m.auth_password_forgot_submit()}
          </Button>
        </Form>
      </CardContent>
      <CardFooter className="justify-center">
        <Link to="/login" className="text-primary text-sm hover:underline">
          {m.auth_password_forgot_back_to_login()}
        </Link>
      </CardFooter>
    </AuthShell>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: forgotPasswordSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  // Flash the same success message for every email — unknown, rate-limited, or real —
  // so the happy path can't be used to enumerate accounts. The only deliberate
  // deviation is the send-failure error below, which is reachable solely for a real
  // account and is not attacker-controllable per address.
  session.flash('success', m.auth_password_forgot_success_message())

  const result = await requestPasswordReset(submission.value.email)

  if (result.status === 'processed' && !result.emailDelivered) {
    session.flash('error', m.auth_email_send_error())
  }

  return redirect('/password/forgot', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
