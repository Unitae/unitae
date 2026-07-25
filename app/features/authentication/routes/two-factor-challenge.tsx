import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { twoFactorCodeSchema } from '~/features/authentication/schemas/login.schema'
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
import * as m from '~/i18n/paraglide/messages'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { getBrandingName, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { safeRedirectUrl } from '~/shared/utils/safe-redirect.server'
import type { Route } from './+types/two-factor-challenge'

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
    { error: session.get('error'), brandingName: await getBrandingName(request), redirectTo },
    { headers: { 'Set-Cookie': await commitSession(session) } },
  )
}

export default function TwoFactorChallengePage({ loaderData, actionData }: Route.ComponentProps) {
  const { error, brandingName, redirectTo } = loaderData

  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: twoFactorCodeSchema })
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md overflow-hidden shadow-md">
        <div className="h-1 bg-primary" />
        <CardHeader className="items-center space-y-2 text-center">
          <h1 className="font-bold font-display text-2xl tracking-tight">{brandingName}</h1>
          <p className="font-medium text-sm">{m.auth_2fa_challenge_heading()}</p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form method="post" className="flex flex-col gap-4" {...getFormProps(form)}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <p className="text-muted-foreground text-sm">{m.auth_2fa_challenge_instruction()}</p>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fields.code.id}>{m.auth_2fa_challenge_code_label()}</Label>
              <Input
                {...getInputProps(fields.code, { type: 'text' })}
                autoFocus={true}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
              />
              {fields.code.errors && <p className="text-destructive text-sm">{fields.code.errors}</p>}
            </div>

            <Button type="submit" className="mt-2 w-full">
              {m.auth_2fa_challenge_submit()}
            </Button>
          </Form>
        </CardContent>
        <CardFooter className="justify-center">
          {/* POST to /logout so the pending 2FA state is cleared from the session. */}
          <Form method="post" action="/logout">
            <button type="submit" className="text-primary text-xs hover:underline">
              {m.auth_2fa_challenge_back_to_login()}
            </button>
          </Form>
        </CardFooter>
      </Card>
    </div>
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
  if (!verified) {
    if (urlCongregation) {
      audit({
        action: AuditAction.TwoFactorChallengeFailed,
        congregationId: urlCongregation.id,
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

  if (urlCongregation) {
    audit({
      action: AuditAction.UserLogin,
      congregationId: urlCongregation.id,
      actorId: pendingId,
      entityType: 'User',
      entityId: pendingId,
    })
  }

  return redirect(postLoginRedirect, { headers: { 'Set-Cookie': await commitSession(session) } })
}
