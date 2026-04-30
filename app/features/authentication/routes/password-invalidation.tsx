import { redirect } from 'react-router'
import ResetPasswordRequired from '~/features/authentication/emails/reset-password-required'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-user-password.server'
import { sendResetUserPasswordEmail } from '~/features/authentication/server/send-reset-user-password-email.server'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, requireRole, userContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb as db } from '~/shared/infra/db.server'
import { Role } from '~/shared/types/role'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/password-invalidation'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Unitae' }]
}

export function loader() {
  throw redirect('/')
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const currentUser = context.get(userContext)
  const permissions = context.get(permissionsContext)
  const session = await getSession(request.headers.get('Cookie'))

  requireRole(permissions, Role.SettingsUserManager)

  const user = await db.user.findUnique({
    where: { id: requireParamId(params.userId, '/settings/users') },
  })

  if (user == null) throw redirect('/settings/users')

  const token = await createPasswordResetToken(user.id)
  const congregation = await resolveCongregation(user.congregationId)
  const sent = await sendResetUserPasswordEmail(
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
