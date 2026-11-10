import { Clock } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import {
  consumeEmailVerificationToken,
  verifyEmailVerificationToken,
} from '~/features/authentication/server/email-verification.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { AuthShell } from '~/features/authentication/ui/AuthShell'
import { AUTH_SUBMIT } from '~/features/authentication/ui/auth-parts'
import * as m from '~/i18n/paraglide/messages'
import { getCongregationBrand } from '~/shared/domain/congregation.server'
import { Button } from '~/shared/ui/button'
import { SubmitButton } from '~/shared/ui/SubmitButton'

import type { Route } from './+types/verify-email-confirm'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.verify_email_title()} - Unitae` }]
}

// The GET only validates the token — it never consumes it, so link-prefetchers can't burn it.
// Consumption happens in the POST action, triggered by the user clicking the confirm button.
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await verifyEmailVerificationToken(params.token ?? '')

  return { valid: user != null, email: user?.email ?? null, congregation: await getCongregationBrand(request) }
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token ?? ''
  const user = await verifyEmailVerificationToken(token)

  if (user == null) {
    return { valid: false }
  }

  await consumeEmailVerificationToken(token)

  // If the user has an active session, redirect home
  const session = await getSession(request.headers.get('Cookie'))
  const sessionUserId = Number(session.get('userId'))

  if (sessionUserId === user.id) {
    throw redirect('/')
  }

  // Otherwise redirect to the login page
  session.flash('success', m.verify_email_confirmed())
  throw redirect('/login', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}

/**
 * Whether to show the confirm form. The GET must have validated the token, and a POST must not
 * have since found it invalid (token expired/consumed between the GET and the click).
 */
export function isConfirmable(loaderData: { valid: boolean }, actionData?: { valid: boolean }): boolean {
  return loaderData.valid && actionData?.valid !== false
}

export default function VerifyEmailConfirmPage({ loaderData, actionData }: Route.ComponentProps) {
  const { email, congregation } = loaderData

  if (!isConfirmable(loaderData, actionData)) {
    return (
      <AuthShell
        congregation={congregation}
        icon={Clock}
        title={m.auth_link_expired_title()}
        description={m.verify_email_invalid_token()}
      >
        <Button asChild className={AUTH_SUBMIT}>
          <Link to="/verify-email">{m.verify_email_try_again()}</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      congregation={congregation}
      title={m.verify_email_confirm_title()}
      description={email == null ? undefined : m.verify_email_confirm_prompt({ email })}
    >
      <Form method="post">
        <SubmitButton className={AUTH_SUBMIT}>{m.verify_email_confirm_button()}</SubmitButton>
      </Form>
    </AuthShell>
  )
}
