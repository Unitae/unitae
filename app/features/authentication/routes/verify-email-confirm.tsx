import { Form, Link, redirect } from 'react-router'
import {
  consumeEmailVerificationToken,
  verifyEmailVerificationToken,
} from '~/features/authentication/server/email-verification.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

import type { Route } from './+types/verify-email-confirm'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.verify_email_title()} - Unitae` }]
}

// The GET only validates the token — it never consumes it, so link-prefetchers can't burn it.
// Consumption happens in the POST action, triggered by the user clicking the confirm button.
export async function loader({ params }: Route.LoaderArgs) {
  const user = await verifyEmailVerificationToken(params.token ?? '')

  return { valid: user != null }
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
  const valid = isConfirmable(loaderData, actionData)

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-4 font-bold text-2xl text-gray-900">{m.verify_email_title()}</h1>

        {valid ? (
          <>
            <p className="mb-6 text-gray-600">{m.verify_email_confirm_prompt()}</p>
            <Form method="post">
              <Button type="submit" className="w-full">
                {m.verify_email_confirm_button()}
              </Button>
            </Form>
          </>
        ) : (
          <>
            <p className="mb-6 text-gray-600">{m.verify_email_invalid_token()}</p>
            <Link to="/verify-email" className="text-blue-600 text-sm hover:text-blue-700">
              {m.verify_email_try_again()}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
