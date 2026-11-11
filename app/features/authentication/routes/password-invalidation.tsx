import { data, redirect } from 'react-router'
import ResetPasswordRequired from '~/features/authentication/emails/reset-password-required'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-account-password.server'
import { revokeAccountSessions } from '~/features/authentication/server/revoke-account-sessions.server'
import { sendResetAccountPasswordEmail } from '~/features/authentication/server/send-reset-account-password-email.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, requirePermission } from '~/shared/auth/route-context.server'
import { assertMayActOnAccount } from '~/shared/domain/account-protection.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { GrantBeyondActorError } from '~/shared/domain/role-grant-limits.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { displayFirstname } from '~/shared/utils/display-name'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/password-invalidation'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Unitae' }]
}

export function loader() {
  throw redirect('/')
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const permissions = context.get(permissionsContext)
  const session = await getSession(request.headers.get('Cookie'))

  requirePermission(permissions, Permission.CanManageUsers)

  // Within the caller's congregation only: this route runs outside RLS scope.
  const user = await db.userAccount.findUnique({
    where: {
      id_congregationId: {
        id: requireParamId(params.userId, '/settings/users'),
        congregationId: currentUser.congregationId,
      },
    },
    include: { member: { select: { firstname: true } } },
  })

  if (user == null) throw redirect('/settings/users')

  // An administrator's sessions and password are handled by administrators only.
  try {
    await assertMayActOnAccount({
      accountId: user.id,
      actorId: currentUser.id,
      congregationId: currentUser.congregationId,
      actorPermissions: permissions,
      action: 'send-password-link',
    })
  } catch (error) {
    if (error instanceof GrantBeyondActorError) {
      return data({ ok: false as const, error: m.settings_user_admin_only() }, { status: 403 })
    }
    throw error
  }

  // Revoke the target's active sessions first — this is the security action and must not
  // depend on email deliverability. An admin forcing a reset on a compromised account needs
  // the attacker logged out even when the mail provider is down. Audit here too, so the
  // revocation is recorded whether or not the notification email goes out.
  await revokeAccountSessions(user.id)

  audit({
    action: AuditAction.PasswordResetRequested,
    congregationId: user.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: user.id,
  })

  const token = await createPasswordResetToken(user.id)
  const congregation = await resolveCongregation(user.congregationId)
  const sent = await sendResetAccountPasswordEmail(
    user.id,
    <ResetPasswordRequired
      email={user.email}
      firstname={displayFirstname(user) ?? undefined}
      token={token}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />,
  )

  // The sessions are ended whether or not the e-mail goes out: the dialog closes, and the toast says which happened.
  session.flash(
    sent ? 'success' : 'error',
    sent ? m.auth_password_invalidation_success({ email: user.email }) : m.auth_email_send_error(),
  )
  return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
}
