import { redirect } from 'react-router'
import ResetPasswordRequired from '~/features/authentication/emails/reset-password-required'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-account-password.server'
import { sendResetAccountPasswordEmail } from '~/features/authentication/server/send-reset-account-password-email.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, currentAccountContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
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

  requirePermission(permissions, Permission.SettingsUserManager)

  const user = await db.userAccount.findUnique({
    where: { id: requireParamId(params.userId, '/settings/users') },
  })

  if (user == null) throw redirect('/settings/users')

  const token = await createPasswordResetToken(user.id)
  const congregation = await resolveCongregation(user.congregationId)
  const sent = await sendResetAccountPasswordEmail(
    user.id,
    <ResetPasswordRequired
      email={user.email}
      firstname={user.firstname || undefined}
      token={token}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />,
  )

  if (!sent) {
    session.flash('error', m.auth_email_send_error())
    return redirect(`/settings/users/${user.id}/edit`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  audit({
    action: AuditAction.PasswordResetRequested,
    congregationId: user.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: user.id,
  })

  session.flash('success', m.auth_password_invalidation_success({ email: user.email }))

  return redirect(`/settings/users/${user.id}/edit`, {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
