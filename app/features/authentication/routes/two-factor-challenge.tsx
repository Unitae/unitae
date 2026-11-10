import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { useEffect, useRef, useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { twoFactorCodeSchema } from '~/features/authentication/schemas/login.schema'
import { resolveLoginAuditCongregationId } from '~/features/authentication/server/login-audit.server'
import {
  buildTwoFactorChallengeUrl,
  resolvePostLoginRedirect,
} from '~/features/authentication/server/post-login-redirect.server'
import { guardTwoFactorAttempt, releaseTwoFactorAttempts } from '~/features/authentication/server/rate-limit.server'
import {
  commitSession,
  destroySession,
  establishAuthenticatedSession,
  getSession,
} from '~/features/authentication/server/session.server'
import { verifyTwoFactorChallenge } from '~/features/authentication/server/verify-two-factor-challenge.server'
import { AuthShell } from '~/features/authentication/ui/AuthShell'
import { AUTH_SUBMIT, AuthField, AuthMessage } from '~/features/authentication/ui/auth-parts'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { getCongregationBrand, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Input } from '~/shared/ui/input'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { safeRedirectUrl } from '~/shared/utils/safe-redirect.server'
import type { Route } from './+types/two-factor-challenge'

const CODE_LENGTH = 6
const NOT_A_DIGIT = /\D/g

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_2fa_challenge_page_title()} - Unitae` }]
}

/**
 * Reads the pending 2FA account id from the session. Returns the numeric id, or
 * null when the session holds no valid pending challenge (direct navigation, or
 * a subdomain that does not own the pending account in multi-tenant mode).
 */
async function resolvePendingUserId(request: Request, rawPending: string | undefined): Promise<number | null> {
  const pendingId = Number(rawPending)
  if (!rawPending || Number.isNaN(pendingId) || pendingId <= 0) return null

  // The session cookie is shared across subdomains (`.unitae.app`), so make sure
  // the pending account actually belongs to this subdomain's congregation.
  const urlCongregation = await resolveCongregationFromRequest(request)
  if (urlCongregation) {
    const account = await unscopedDb.userAccount.findUnique({
      where: { id: pendingId },
      select: { congregationId: true },
    })
    if (!account || account.congregationId !== urlCongregation.id) return null
  }

  return pendingId
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const pendingId = await resolvePendingUserId(request, session.get('pending2faUserId'))

  if (pendingId == null) {
    throw redirect('/login', { headers: { 'Set-Cookie': await destroySession(session) } })
  }

  const redirectTo = safeRedirectUrl(new URL(request.url).searchParams.get('redirectTo'), '/')

  return data(
    { error: session.get('error'), congregation: await getCongregationBrand(request), redirectTo },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}

export default function TwoFactorChallengePage({ loaderData, actionData }: Route.ComponentProps) {
  const { error, congregation, redirectTo } = loaderData
  const formRef = useRef<HTMLFormElement>(null)
  const [code, setCode] = useState('')

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: twoFactorCodeSchema })
    },
  })

  // Typed or pasted, the sixth digit sends the code: there is nothing else to press.
  useEffect(() => {
    if (code.length === CODE_LENGTH) formRef.current?.requestSubmit()
  }, [code])

  return (
    <AuthShell
      congregation={congregation}
      title={m.auth_2fa_challenge_heading()}
      description={m.auth_2fa_challenge_instruction()}
    >
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      <Form method="post" ref={formRef} className="flex flex-col gap-4" {...getFormProps(form)}>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <AuthField
          id={fields.code.id}
          label={m.auth_2fa_challenge_code_label()}
          errorId={fields.code.errorId}
          errors={fields.code.errors}
        >
          {/* The tracking also follows the last digit: the left padding evens it out, so the code sits centred. */}
          <Input
            id={fields.code.id}
            name={fields.code.name}
            value={code}
            onChange={event => setCode(event.target.value.replace(NOT_A_DIGIT, '').slice(0, CODE_LENGTH))}
            aria-invalid={fields.code.errors != null || undefined}
            aria-describedby={fields.code.errors != null ? fields.code.errorId : undefined}
            autoFocus={true}
            autoComplete="one-time-code"
            inputMode="numeric"
            className="h-13 pl-[0.45em] text-center font-medium text-2xl tabular-nums tracking-[0.45em]"
          />
        </AuthField>
        <SubmitButton className={AUTH_SUBMIT}>{m.auth_2fa_challenge_submit()}</SubmitButton>
      </Form>
      <p className="text-faint text-sm leading-relaxed">{m.auth_2fa_challenge_lost()}</p>
      {/* POST to /logout so the pending 2FA state is cleared from the session. */}
      <Form method="post" action="/logout">
        <button type="submit" className="text-brand-text text-sm underline-offset-4 hover:underline">
          {m.auth_back_to_login()}
        </button>
      </Form>
    </AuthShell>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const postLoginRedirect = resolvePostLoginRedirect(request, formData)
  const challengeUrl = buildTwoFactorChallengeUrl(postLoginRedirect)

  const pendingId = await resolvePendingUserId(request, session.get('pending2faUserId'))
  if (pendingId == null) {
    throw redirect('/login', { headers: { 'Set-Cookie': await destroySession(session) } })
  }

  const submission = parseWithZod(formData, { schema: twoFactorCodeSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const urlCongregation = await resolveCongregationFromRequest(request)

  const { limited } = await guardTwoFactorAttempt(pendingId)
  if (limited) {
    session.flash('error', m.auth_2fa_challenge_rate_limit_error())
    return redirect(challengeUrl, { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  const verified = await verifyTwoFactorChallenge(pendingId, submission.value.code)
  const congregationId = await resolveLoginAuditCongregationId(urlCongregation?.id, { id: pendingId })
  if (!verified) {
    if (congregationId != null) {
      audit({
        action: AuditAction.TwoFactorChallengeFailed,
        congregationId,
        actorId: pendingId,
        entityType: 'User',
        entityId: pendingId,
      })
    }
    session.flash('error', m.auth_2fa_challenge_invalid_code_error())
    return redirect(challengeUrl, { headers: { 'Set-Cookie': await commitSession(session) } })
  }

  // Challenge passed — promote the pending state to a full session.
  await releaseTwoFactorAttempts(pendingId)
  session.unset('pending2faUserId')
  await establishAuthenticatedSession(session, pendingId)

  if (congregationId != null) {
    audit({
      action: AuditAction.UserLogin,
      congregationId,
      actorId: pendingId,
      entityType: 'User',
      entityId: pendingId,
    })
  }

  return redirect(postLoginRedirect, { headers: { 'Set-Cookie': await commitSession(session) } })
}
