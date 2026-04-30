import VerifyEmailTemplate from '~/features/authentication/emails/verify-email'
import { Form, Link, redirect } from 'react-router'
import {
  createEmailVerificationToken,
  getLatestVerificationToken,
} from '~/features/authentication/server/email-verification.server'
import { sendVerificationEmail } from '~/features/authentication/server/send-verification-email.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb as db } from '~/shared/infra/db.server'

import type { Route } from './+types/verify-email'

const RESEND_COOLDOWN_SECONDS = 60

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.verify_email_title()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)

  if (!rawUserId || Number.isNaN(userId) || userId <= 0) {
    throw redirect('/login')
  }

  const user = await db.user.findUnique({ where: { id: userId } })

  if (user == null || !user.active) {
    throw redirect('/login', {
      headers: {
        'Set-Cookie': await (await import('~/features/authentication/server/session.server')).destroySession(session),
      },
    })
  }

  if (user.emailVerifiedAt) {
    throw redirect('/')
  }

  const flashSuccess = session.get('success')

  return Response.json({ email: user.email, flashSuccess }, { headers: { 'Set-Cookie': await commitSession(session) } })
}

export default function VerifyEmailPage({ loaderData }: Route.ComponentProps) {
  const { email, flashSuccess } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-4 font-bold text-2xl text-gray-900">{m.verify_email_title()}</h1>
        <p className="mb-6 text-gray-600">{m.verify_email_message({ email })}</p>
        {flashSuccess && <p className="mb-4 rounded bg-green-50 px-4 py-2 text-green-700 text-sm">{flashSuccess}</p>}
        <div className="flex flex-col gap-3">
          <Form method="post">
            <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              {m.verify_email_resend()}
            </button>
          </Form>
          <Link to="/logout" className="text-gray-500 text-sm hover:text-gray-700">
            {m.verify_email_logout()}
          </Link>
        </div>
      </div>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)

  if (!rawUserId || Number.isNaN(userId) || userId <= 0) {
    throw redirect('/login')
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (user == null) {
    throw redirect('/login')
  }

  // Vérifier le rate limiting
  const existingToken = await getLatestVerificationToken(userId)
  if (existingToken) {
    const secondsSinceCreation = (Date.now() - existingToken.createdAt.getTime()) / 1000
    if (secondsSinceCreation < RESEND_COOLDOWN_SECONDS) {
      session.flash('success', m.verify_email_rate_limited())
      return redirect('/verify-email', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    }
  }

  const token = await createEmailVerificationToken(userId)
  const congregation = await resolveCongregation(user.congregationId)

  const sent = await sendVerificationEmail(
    userId,
    VerifyEmailTemplate({
      email: user.email,
      firstname: user.firstname ?? undefined,
      token,
      baseUrl: congregation.baseUrl,
      platformName: congregation.displayName,
    }),
  )

  if (sent) {
    session.flash('success', m.verify_email_resent())
  } else {
    session.flash('success', m.auth_email_send_error())
  }
  return redirect('/verify-email', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
