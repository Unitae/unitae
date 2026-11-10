import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { data, Form, Link, redirect } from 'react-router'
import { loginSchema } from '~/features/authentication/schemas/login.schema'
import { resolveLoginAuditCongregationId } from '~/features/authentication/server/login-audit.server'
import { needSetupProcess } from '~/features/authentication/server/need-setup-process.server'
import {
  buildLoginRedirectUrl,
  buildTwoFactorChallengeUrl,
  resolvePostLoginRedirect,
} from '~/features/authentication/server/post-login-redirect.server'
import { guardLoginAttempt, releaseLoginAttempt } from '~/features/authentication/server/rate-limit.server'
import {
  commitSession,
  destroySession,
  establishAuthenticatedSession,
  getSession,
} from '~/features/authentication/server/session.server'
import { isTwoFactorEnabled } from '~/features/authentication/server/two-factor-status.server'
import { validateCredentials } from '~/features/authentication/server/validate-credentials.server'
import { AuthShell } from '~/features/authentication/ui/AuthShell'
import { AUTH_SUBMIT, AuthField, AuthMessage } from '~/features/authentication/ui/auth-parts'
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { getCongregationBrand, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'
import { PasswordInput } from '~/shared/ui/PasswordInput'
import { getClientIp } from '~/shared/utils/get-client-ip'
import { safeRedirectUrl } from '~/shared/utils/safe-redirect.server'
import { cn } from '~/shared/utils/utils'
import type { Route } from './+types/login'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.auth_login_page_title()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  // Verify that the subdomain matches an existing congregation
  await resolveCongregationFromRequest(request)

  const redirectTo = safeRedirectUrl(new URL(request.url).searchParams.get('redirectTo'), '/')

  const shouldStartSetup = await needSetupProcess()
  if (shouldStartSetup) {
    return redirect(process.env.UNITAE_MULTI_TENANT === 'true' ? '/register' : '/setup')
  }

  const session = await getSession(request.headers.get('Cookie'))
  if (session.has('userId') === true) {
    const uid = Number(session.get('userId'))
    if (Number.isNaN(uid) || uid <= 0) {
      return data(
        { error: undefined, success: undefined, congregation: await getCongregationBrand(request), redirectTo },
        { headers: { 'Set-Cookie': await destroySession(session) } },
      )
    }

    // In multi-tenant mode, verify the session matches the subdomain's congregation
    const urlCongregation = await resolveCongregationFromRequest(request)
    if (urlCongregation) {
      const user = await unscopedDb.userAccount.findUnique({
        where: { id: uid },
        select: { congregationId: true },
      })
      if (!user || user.congregationId !== urlCongregation.id) {
        return data(
          { error: undefined, success: undefined, congregation: await getCongregationBrand(request), redirectTo },
          { headers: { 'Set-Cookie': await destroySession(session) } },
        )
      }
    }
    throw redirect(redirectTo)
  }

  const congregation = await getCongregationBrand(request)

  // A password just changed or an address just confirmed: said here, where the person signs in next.
  return data(
    { error: session.get('error'), success: session.get('success'), congregation, redirectTo },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function LoginPage({ loaderData, actionData }: Route.ComponentProps) {
  const { error, success, congregation, redirectTo } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: loginSchema })
    },
  })

  return (
    <AuthShell congregation={congregation} title={m.auth_login_page_title()}>
      {error && <AuthMessage tone="error">{error}</AuthMessage>}
      {success && <AuthMessage tone="success">{success}</AuthMessage>}
      <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <AuthField
          id={fields.email.id}
          label={m.auth_login_email()}
          errorId={fields.email.errorId}
          errors={fields.email.errors}
        >
          <Input {...getInputProps(fields.email, { type: 'email' })} autoFocus={true} autoComplete="username" />
        </AuthField>
        <AuthField
          id={fields.password.id}
          label={m.auth_login_password()}
          aside={
            <Link to="/password/forgot" className="text-brand-text text-sm underline-offset-4 hover:underline">
              {m.auth_login_forgot_password()}
            </Link>
          }
          errorId={fields.password.errorId}
          errors={fields.password.errors}
        >
          <PasswordInput {...getInputProps(fields.password, { type: 'password' })} autoComplete="current-password" />
        </AuthField>
        <Button type="submit" className={cn('mt-1', AUTH_SUBMIT)}>
          {m.auth_login_submit()}
        </Button>
      </Form>
    </AuthShell>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const postLoginRedirect = resolvePostLoginRedirect(request, formData)
  const loginUrl = buildLoginRedirectUrl(postLoginRedirect)
  const submission = parseWithZod(formData, { schema: loginSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { email: username, password } = submission.value

  const clientIp = getClientIp(request)
  const { limited } = await guardLoginAttempt(clientIp)
  if (limited) {
    session.flash('error', m.auth_login_rate_limit_error())

    return redirect(loginUrl, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  const urlCongregation = await resolveCongregationFromRequest(request)
  const userId = await validateCredentials(username, password, urlCongregation?.id)

  if (userId == null) {
    const congregationId = await resolveLoginAuditCongregationId(urlCongregation?.id, { email: username })
    if (congregationId != null) {
      audit({
        action: AuditAction.UserLoginFailed,
        congregationId,
        actorEmail: username,
      })
    }
    session.flash('error', m.auth_login_invalid_credentials_error())

    return redirect(loginUrl, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  // Password is correct — release the brute-force budget regardless of what
  // happens next.
  await releaseLoginAttempt(clientIp)

  // When 2FA is armed, hold the user in a pending state and hand them off to the
  // TOTP challenge. They are NOT authenticated yet: `userId` is only written once
  // the challenge succeeds, so no authenticated route can be reached from here.
  if (await isTwoFactorEnabled(userId)) {
    session.unset('userId')
    session.set('pending2faUserId', String(userId))

    return redirect(buildTwoFactorChallengeUrl(postLoginRedirect), {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  await establishAuthenticatedSession(session, userId)

  const congregationId = await resolveLoginAuditCongregationId(urlCongregation?.id, { id: userId })
  if (congregationId != null) {
    audit({
      action: AuditAction.UserLogin,
      congregationId,
      actorId: userId,
      actorEmail: username,
      entityType: 'User',
      entityId: userId,
    })
  }

  return redirect(postLoginRedirect, {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
