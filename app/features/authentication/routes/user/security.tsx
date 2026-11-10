import { parseWithZod } from '@conform-to/zod/v4'
import QRCode from 'qrcode'
import { data, redirect } from 'react-router'
import { changePasswordSchema, twoFactorCodeSchema } from '~/features/authentication/schemas/login.schema'
import { isAccountInBreachScope } from '~/features/authentication/server/breach-scope.server'
import { changeAccountPassword } from '~/features/authentication/server/change-account-password.server'
import { confirmTwoFactorEnrollment } from '~/features/authentication/server/confirm-two-factor-enrollment.server'
import { disableTwoFactor } from '~/features/authentication/server/disable-two-factor.server'
import { checkNewPasswordPolicy } from '~/features/authentication/server/password-policy.server'
import { endCurrentSessions } from '~/features/authentication/server/revoke-account-sessions.server'
import {
  commitSession,
  establishAuthenticatedSession,
  getSession,
} from '~/features/authentication/server/session.server'
import { startTwoFactorEnrollment } from '~/features/authentication/server/start-two-factor-enrollment.server'
import { buildOtpAuthUri } from '~/features/authentication/server/totp.server'
import { getTwoFactorStatus } from '~/features/authentication/server/two-factor-status.server'
import { verifyTwoFactorChallenge } from '~/features/authentication/server/verify-two-factor-challenge.server'
import type { PasswordResult } from '~/features/authentication/ui/PasswordDialog'
import { SecuritySettings } from '~/features/authentication/ui/SecuritySettings'
import type { TwoFactorResult } from '~/features/authentication/ui/TwoFactorDialogs'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { AccountPage } from '~/shared/ui/AccountPage'
import type { Route } from './+types/security'

const SECRET_FIELDS = ['password', 'new_password', 'new_password_confirm']

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.account_section_security()} - Unitae` }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const account = context.get(currentAccountContext)
  const status = await withScopeFromContext(context, db => getTwoFactorStatus(db, account.id))
  return { twoFactorSince: status.enabledAt, timezone: context.get(congregationContext).timezone }
}

export default function SecurityPage({ loaderData }: Route.ComponentProps) {
  return (
    <AccountPage title={m.account_section_security()} subtitle={m.account_security_subtitle()}>
      <SecuritySettings twoFactorSince={loaderData.twoFactorSince} timezone={loaderData.timezone} />
    </AccountPage>
  )
}

type ActionContext = Route.ActionArgs['context']
type Actor = { id: number; email: string; congregationId: number }
type Session = Awaited<ReturnType<typeof getSession>>

/** Saved: the toast in the session, the dialog closes on `ok`. */
async function saved(session: Session, message: string) {
  session.flash('success', message)
  return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
}

async function changePassword(context: ActionContext, session: Session, actor: Actor, formData: FormData) {
  const submission = parseWithZod(formData, { schema: changePasswordSchema })
  const refuse = (fieldErrors?: Record<string, string[]>) =>
    data<PasswordResult>({ ok: false, reply: submission.reply({ fieldErrors, hideFields: SECRET_FIELDS }) }, 400)
  if (submission.status !== 'success') return refuse()

  const { password, new_password: newPassword } = submission.value
  const checkBreached = await withScopeFromContext(context, db =>
    isAccountInBreachScope(db, actor.id, actor.congregationId),
  )
  const policyError = await checkNewPasswordPolicy(newPassword, { checkBreached })
  if (policyError) return refuse({ new_password: [policyError] })
  if (!(await changeAccountPassword(actor.id, password, newPassword))) {
    return refuse({ password: [m.account_password_wrong()] })
  }

  audit({
    action: AuditAction.PasswordChanged,
    congregationId: actor.congregationId,
    actorId: actor.id,
    entityType: 'User',
    entityId: actor.id,
  })
  // The change bumped the account's session epoch, revoking every other device. Re-stamp this cookie with the
  // fresh epoch so the acting device stays signed in.
  await establishAuthenticatedSession(session, actor.id)
  return saved(session, m.account_password_changed())
}

/** Ends every session of the account, then signs this one back in: the others have to sign in again. */
async function signOutOthers(session: Session, actor: Actor) {
  const ended = await endCurrentSessions(actor.id, Number(session.get('sessionEpoch') ?? 0))
  if (!ended) return data({ ok: false as const, error: m.account_session_stale() }, 409)

  await establishAuthenticatedSession(session, actor.id)
  audit({
    action: AuditAction.UserSessionsEnded,
    congregationId: actor.congregationId,
    actorId: actor.id,
    entityType: 'User',
    entityId: actor.id,
  })
  return saved(session, m.account_devices_done())
}

async function setupStep(actor: Actor, secret: string, error?: string) {
  const qrDataUrl = await QRCode.toDataURL(buildOtpAuthUri(actor.email, secret))
  return data<TwoFactorResult>({ ok: false, setup: { secret, qrDataUrl }, error }, error ? 400 : 200)
}

async function startTwoFactor(context: ActionContext, actor: Actor, formData: FormData) {
  // Re-enrolling regenerates the secret and resets `twoFactorEnabledAt` to null, which disarms the login gate.
  // So when it is already on, require proof of the current factor first — otherwise a hijacked session could
  // silently switch it off, defeating the guarantee the 'disable' intent enforces.
  const status = await withScopeFromContext(context, db => getTwoFactorStatus(db, actor.id))
  if (status.enabled) {
    const proof = twoFactorCodeSchema.safeParse({ code: formData.get('code') })
    if (!proof.success || !(await verifyTwoFactorChallenge(actor.id, proof.data.code))) {
      return data<TwoFactorResult>({ ok: false, error: m.account_2fa_wrong_code() }, 400)
    }
  }
  const { secret } = await withScopeFromContext(context, db => startTwoFactorEnrollment(db, actor.id, actor.email))
  return setupStep(actor, secret)
}

async function confirmTwoFactor(context: ActionContext, session: Session, actor: Actor, formData: FormData) {
  const secret = String(formData.get('secret') ?? '')
  const submission = twoFactorCodeSchema.safeParse({ code: formData.get('code') })
  const confirmed =
    submission.success &&
    (await withScopeFromContext(context, db => confirmTwoFactorEnrollment(db, actor.id, submission.data.code)))
  if (!confirmed) return setupStep(actor, secret, m.account_2fa_wrong_code())

  audit({
    action: AuditAction.TwoFactorEnabled,
    congregationId: actor.congregationId,
    actorId: actor.id,
    entityType: 'User',
    entityId: actor.id,
  })
  return saved(session, m.account_2fa_enabled())
}

async function disableTwoFactorFor(context: ActionContext, session: Session, actor: Actor, formData: FormData) {
  const submission = twoFactorCodeSchema.safeParse({ code: formData.get('code') })
  const verified = submission.success && (await verifyTwoFactorChallenge(actor.id, submission.data.code))
  if (!verified) return data<TwoFactorResult>({ ok: false, error: m.account_2fa_wrong_code() }, 400)

  await withScopeFromContext(context, db => disableTwoFactor(db, actor.id))
  audit({
    action: AuditAction.TwoFactorDisabled,
    congregationId: actor.congregationId,
    actorId: actor.id,
    entityType: 'User',
    entityId: actor.id,
  })
  return saved(session, m.account_2fa_disabled())
}

export async function action({ request, context }: Route.ActionArgs) {
  const actor = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const intent = formData.get('intent')

  if (intent === 'password') return changePassword(context, session, actor, formData)
  if (intent === 'sign-out-others') return signOutOthers(session, actor)
  if (intent === 'start') return startTwoFactor(context, actor, formData)
  if (intent === 'confirm') return confirmTwoFactor(context, session, actor, formData)
  if (intent === 'disable') return disableTwoFactorFor(context, session, actor, formData)
  return redirect('/me/security')
}
