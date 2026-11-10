import { MailCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { data, Form, redirect } from 'react-router'
import VerifyEmailTemplate from '~/features/authentication/emails/verify-email'
import {
  createEmailVerificationToken,
  getLatestVerificationToken,
} from '~/features/authentication/server/email-verification.server'
import { sendVerificationEmail } from '~/features/authentication/server/send-verification-email.server'
import { commitSession, destroySession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { getCongregationBrand, resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import { AuthShell } from '~/shared/ui/AuthShell'
import { AUTH_SUBMIT, AuthMessage, AuthSignOut } from '~/shared/ui/auth-parts'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { displayFirstname } from '~/shared/utils/display-name'

import type { Route } from './+types/verify-email'

const RESEND_COOLDOWN_SECONDS = 60

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.verify_email_title()} - Unitae` }]
}

/** Seconds before another link may be sent: a minute after the last one. */
function secondsUntilResend(lastSentAt: Date | undefined): number {
  if (lastSentAt == null) return 0
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - (Date.now() - lastSentAt.getTime()) / 1000))
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)

  if (!rawUserId || Number.isNaN(userId) || userId <= 0) {
    throw redirect('/login')
  }

  const user = await db.userAccount.findUnique({
    where: { id: userId },
    select: { email: true, active: true, emailVerifiedAt: true },
  })

  if (user == null || !user.active) {
    throw redirect('/login', { headers: { 'Set-Cookie': await destroySession(session) } })
  }

  if (user.emailVerifiedAt) {
    throw redirect('/')
  }

  const latest = await getLatestVerificationToken(userId)

  return data(
    {
      email: user.email,
      success: session.get('success'),
      error: session.get('error'),
      resendIn: secondsUntilResend(latest?.createdAt),
      congregation: await getCongregationBrand(request),
    },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}

/** Counts down from `seconds`, once a second, to 0. */
function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    setLeft(seconds)
    if (seconds <= 0) return
    const started = Date.now()
    const timer = setInterval(() => {
      const rest = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000))
      setLeft(rest)
      if (rest === 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [seconds])
  return left
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function VerifyEmailPage({ loaderData }: Route.ComponentProps) {
  const { email, success, error, resendIn, congregation } = loaderData
  const wait = useCountdown(resendIn)

  return (
    <AuthShell
      congregation={congregation}
      icon={MailCheck}
      title={m.verify_email_title()}
      description={m.verify_email_message({ email })}
    >
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      {success && <AuthMessage tone="success">{success}</AuthMessage>}
      <Form method="post">
        <SubmitButton variant="outline" className={AUTH_SUBMIT} disabled={wait > 0}>
          {wait > 0 ? m.verify_email_resend_wait({ time: clock(wait) }) : m.verify_email_resend()}
        </SubmitButton>
      </Form>
      <AuthSignOut>{m.verify_email_logout()}</AuthSignOut>
    </AuthShell>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)

  if (!rawUserId || Number.isNaN(userId) || userId <= 0) {
    throw redirect('/login')
  }

  const user = await db.userAccount.findUnique({
    where: { id: userId },
    include: { member: { select: { firstname: true } } },
  })
  if (user == null) {
    throw redirect('/login')
  }

  // One link a minute: a second press, from another tab, is told to wait rather than sent another.
  const existingToken = await getLatestVerificationToken(userId)
  if (secondsUntilResend(existingToken?.createdAt) > 0) {
    session.flash('error', m.verify_email_rate_limited())
    return redirect('/verify-email', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const token = await createEmailVerificationToken(userId)
  const congregation = await resolveCongregation(user.congregationId)

  const sent = await sendVerificationEmail(
    userId,
    VerifyEmailTemplate({
      email: user.email,
      firstname: displayFirstname(user) ?? undefined,
      token,
      baseUrl: congregation.baseUrl,
      platformName: congregation.displayName,
    }),
  )

  if (sent) session.flash('success', m.verify_email_resent())
  else session.flash('error', m.auth_email_send_error())
  return redirect('/verify-email', {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
