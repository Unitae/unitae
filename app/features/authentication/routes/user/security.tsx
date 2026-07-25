import QRCode from 'qrcode'
import { Form, redirect } from 'react-router'
import { twoFactorCodeSchema } from '~/features/authentication/schemas/login.schema'
import { confirmTwoFactorEnrollment } from '~/features/authentication/server/confirm-two-factor-enrollment.server'
import { disableTwoFactor } from '~/features/authentication/server/disable-two-factor.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { startTwoFactorEnrollment } from '~/features/authentication/server/start-two-factor-enrollment.server'
import { buildOtpAuthUri } from '~/features/authentication/server/totp.server'
import { getTwoFactorStatus } from '~/features/authentication/server/two-factor-status.server'
import { verifyTwoFactorChallenge } from '~/features/authentication/server/verify-two-factor-challenge.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import type { Route } from './+types/security'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.user_security_page_title()} - Unitae` }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const status = await withScopeFromContext(context, db => getTwoFactorStatus(db, currentUser.id))

  return { enabled: status.enabled }
}

type SetupStep = { step: 'setup'; secret: string; qrDataUrl: string; error?: string }
type ActionData = SetupStep | { error: string } | undefined

export default function SecurityPage({ loaderData, actionData }: Route.ComponentProps) {
  const { enabled } = loaderData
  const setup = actionData && 'step' in actionData ? actionData : null
  const inlineError = actionData && 'error' in actionData ? actionData.error : undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.user_security_page_title()}
        subtitle={m.user_security_page_subtitle()}
        breadcrumbs={[{ label: m.user_security_page_title() }]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.user_security_2fa_section()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{m.user_security_2fa_description()}</p>

          {setup ? (
            <TwoFactorSetup setup={setup} />
          ) : enabled ? (
            <TwoFactorEnabled error={inlineError} />
          ) : (
            <TwoFactorDisabled />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TwoFactorSetup({ setup }: { setup: SetupStep }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{m.user_security_2fa_setup_scan_instruction()}</p>
      <img src={setup.qrDataUrl} alt={m.user_security_2fa_qr_alt()} className="h-48 w-48 self-center" />
      <p className="text-muted-foreground text-xs">{m.user_security_2fa_setup_manual_key()}</p>
      <code className="select-all break-all rounded bg-muted px-2 py-1 font-mono text-sm">{setup.secret}</code>

      {setup.error && (
        <Alert variant="destructive">
          <AlertDescription>{setup.error}</AlertDescription>
        </Alert>
      )}

      <Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="intent" value="confirm" />
        <input type="hidden" name="secret" value={setup.secret} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-code">{m.user_security_2fa_setup_code_label()}</Label>
          <Input
            id="confirm-code"
            name="code"
            type="text"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            autoFocus={true}
          />
        </div>
        <div className="flex gap-2">
          <SubmitButton className="w-fit">{m.user_security_2fa_setup_confirm_button()}</SubmitButton>
          <Button asChild variant="outline" className="w-fit">
            <a href="/me/security">{m.user_security_2fa_setup_cancel_button()}</a>
          </Button>
        </div>
      </Form>
    </div>
  )
}

function TwoFactorEnabled({ error }: { error?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium text-sm">{m.user_security_2fa_status_enabled()}</p>
      <p className="text-muted-foreground text-sm">{m.user_security_2fa_disable_instruction()}</p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="intent" value="disable" />
        <div className="flex flex-col gap-2">
          <Label htmlFor="disable-code">{m.user_security_2fa_setup_code_label()}</Label>
          <Input
            id="disable-code"
            name="code"
            type="text"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
          />
        </div>
        <SubmitButton variant="destructive" className="w-fit">
          {m.user_security_2fa_disable_button()}
        </SubmitButton>
      </Form>
    </div>
  )
}

function TwoFactorDisabled() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{m.user_security_2fa_status_disabled()}</p>
      <Form method="post">
        <input type="hidden" name="intent" value="start" />
        <SubmitButton className="w-fit">{m.user_security_2fa_enable_button()}</SubmitButton>
      </Form>
    </div>
  )
}

type ActionContext = Route.ActionArgs['context']
type SecurityActor = { id: number; email: string; congregationId: number }
type SecuritySession = Awaited<ReturnType<typeof getSession>>

async function handleStart(context: ActionContext, actor: SecurityActor, formData: FormData): Promise<ActionData> {
  // Re-enrolling regenerates the secret and resets `twoFactorEnabledAt` to null,
  // which disarms the login gate. So when 2FA is already active, require proof of
  // the current factor first — otherwise a hijacked authenticated session could
  // silently switch 2FA off, defeating the guarantee the 'disable' branch enforces.
  const status = await withScopeFromContext(context, db => getTwoFactorStatus(db, actor.id))
  if (status.enabled) {
    const proof = twoFactorCodeSchema.safeParse({ code: formData.get('code') })
    if (!proof.success || !(await verifyTwoFactorChallenge(actor.id, proof.data.code))) {
      return { error: m.user_security_2fa_invalid_code_error() }
    }
  }

  const { secret, otpauthUri } = await withScopeFromContext(context, db =>
    startTwoFactorEnrollment(db, actor.id, actor.email),
  )
  return { step: 'setup', secret, qrDataUrl: await QRCode.toDataURL(otpauthUri) }
}

async function handleConfirm(
  context: ActionContext,
  session: SecuritySession,
  actor: SecurityActor,
  formData: FormData,
): Promise<ActionData | Response> {
  const submittedSecret = String(formData.get('secret') ?? '')
  const setupError = async (): Promise<SetupStep> => ({
    step: 'setup',
    secret: submittedSecret,
    qrDataUrl: await QRCode.toDataURL(buildOtpAuthUri(actor.email, submittedSecret)),
    error: m.user_security_2fa_invalid_code_error(),
  })

  const submission = twoFactorCodeSchema.safeParse({ code: formData.get('code') })
  if (!submission.success) return setupError()

  const confirmed = await withScopeFromContext(context, db =>
    confirmTwoFactorEnrollment(db, actor.id, submission.data.code),
  )
  if (!confirmed) return setupError()

  audit({
    action: AuditAction.TwoFactorEnabled,
    congregationId: actor.congregationId,
    actorId: actor.id,
    entityType: 'User',
    entityId: actor.id,
  })
  session.flash('success', m.user_security_2fa_enabled_success())
  return redirect('/me/security', { headers: { 'Set-Cookie': await commitSession(session) } })
}

async function handleDisable(
  context: ActionContext,
  session: SecuritySession,
  actor: SecurityActor,
  formData: FormData,
): Promise<ActionData | Response> {
  const submission = twoFactorCodeSchema.safeParse({ code: formData.get('code') })
  const verified = submission.success && (await verifyTwoFactorChallenge(actor.id, submission.data.code))
  if (!verified) return { error: m.user_security_2fa_invalid_code_error() }

  await withScopeFromContext(context, db => disableTwoFactor(db, actor.id))
  audit({
    action: AuditAction.TwoFactorDisabled,
    congregationId: actor.congregationId,
    actorId: actor.id,
    entityType: 'User',
    entityId: actor.id,
  })
  session.flash('success', m.user_security_2fa_disabled_success())
  return redirect('/me/security', { headers: { 'Set-Cookie': await commitSession(session) } })
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionData | Response> {
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const intent = formData.get('intent')

  if (intent === 'start') return handleStart(context, currentUser, formData)
  if (intent === 'confirm') return handleConfirm(context, session, currentUser, formData)
  if (intent === 'disable') return handleDisable(context, session, currentUser, formData)
  return redirect('/me/security')
}
