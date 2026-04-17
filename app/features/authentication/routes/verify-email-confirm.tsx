import { Link, redirect } from 'react-router'
import {
  consumeEmailVerificationToken,
  verifyEmailVerificationToken,
} from '~/features/authentication/server/email-verification.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'

import type { Route } from './+types/verify-email-confirm'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.verify_email_title()} - Unitae` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const token = params.token ?? ''
  const user = await verifyEmailVerificationToken(token)

  if (user == null) {
    return { valid: false }
  }

  await consumeEmailVerificationToken(token)

  // Si l'utilisateur a une session active, rediriger vers l'accueil
  const session = await getSession(request.headers.get('Cookie'))
  const sessionUserId = Number(session.get('userId'))

  if (sessionUserId === user.id) {
    throw redirect('/')
  }

  // Sinon, rediriger vers la page de connexion
  session.flash('success', m.verify_email_confirmed())
  throw redirect('/login', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}

export default function VerifyEmailConfirmPage({ loaderData }: Route.ComponentProps) {
  const { valid } = loaderData

  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md text-center">
          <h1 className="mb-4 font-bold text-2xl text-gray-900">{m.verify_email_title()}</h1>
          <p className="mb-6 text-gray-600">{m.verify_email_invalid_token()}</p>
          <Link to="/verify-email" className="text-blue-600 text-sm hover:text-blue-700">
            {m.verify_email_try_again()}
          </Link>
        </div>
      </div>
    )
  }

  return null
}
