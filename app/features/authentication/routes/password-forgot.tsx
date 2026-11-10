import { parseWithZod } from '@conform-to/zod/v4'
import { MailCheck } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { forgotPasswordSchema } from '~/features/authentication/schemas/login.schema'
import { requestPasswordReset } from '~/features/authentication/server/request-password-reset.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { AuthShell } from '~/features/authentication/ui/AuthShell'
import { AUTH_SUBMIT, AuthField, AuthLink, AuthMessage } from '~/features/authentication/ui/auth-parts'
import * as m from '~/i18n/paraglide/messages'
import { getCongregationBrand, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { getClientIp } from '~/shared/utils/get-client-ip'
import type { Route } from './+types/password-forgot'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_password_forgot_page_title()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await resolveCongregationFromRequest(request)

  const session = await getSession(request.headers.get('Cookie'))
  const congregation = await getCongregationBrand(request)

  return data(
    { error: session.get('error'), sentTo: session.get('resetSentTo'), congregation },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function ForgotPassword({ loaderData }: Route.ComponentProps) {
  const { error, sentTo, congregation } = loaderData

  if (sentTo != null) {
    return (
      <AuthShell
        congregation={congregation}
        icon={MailCheck}
        title={m.auth_password_forgot_sent_title()}
        description={m.auth_password_forgot_sent_body({ email: sentTo })}
      >
        {error && <AuthMessage tone="error">{error}</AuthMessage>}
        <p className="text-faint text-sm leading-relaxed">{m.auth_password_forgot_sent_hint()}</p>
        <Button asChild variant="outline" className={AUTH_SUBMIT}>
          <Link to="/login">{m.auth_back_to_login()}</Link>
        </Button>
        <AuthLink to="/password/forgot">{m.auth_password_forgot_other_address()}</AuthLink>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      congregation={congregation}
      title={m.auth_password_forgot_page_title()}
      description={m.auth_password_forgot_subtitle()}
    >
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      <Form method="post" className="flex flex-col gap-4">
        <AuthField id="email" label={m.auth_password_forgot_email_label()}>
          <Input id="email" name="email" type="email" autoComplete="username" autoFocus={true} required />
        </AuthField>
        <SubmitButton className={AUTH_SUBMIT}>{m.auth_password_forgot_submit()}</SubmitButton>
      </Form>
      <AuthLink to="/login">{m.auth_back_to_login()}</AuthLink>
    </AuthShell>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const submission = parseWithZod(await request.formData(), { schema: forgotPasswordSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const result = await requestPasswordReset(submission.value.email, getClientIp(request))

  if (result.status === 'unavailable') {
    // The limiter could not be reached, so nothing was sent. This is decided before any account
    // lookup and is the same for every address, so saying so reveals nothing.
    session.flash('error', m.auth_password_forgot_unavailable_error())
  } else {
    // The same confirmation for every email — unknown, rate-limited, or real — so the happy
    // path can't be used to enumerate accounts: it names the address the person typed, which
    // they already know. The only deliberate deviation is the send-failure error below, which
    // is reachable solely for a real account and is not attacker-controllable per address.
    session.flash('resetSentTo', submission.value.email)
    if (result.status === 'processed' && !result.emailDelivered) {
      session.flash('error', m.auth_email_send_error())
    }
  }

  return redirect('/password/forgot', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
